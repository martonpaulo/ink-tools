/**
 * One game's view (#386), the same for every game: its choices and «Add Page», which puts a new
 * puzzle on a page after the current one; and, on a page the game made, «Check», which marks the
 * mistakes in the ink, and «Show Solution», both shown here only, so the note never gets the answer.
 * A pass-and-play board (#402) has no `open`: its view is the choices and «Add Page» alone.
 * Every control comes from ui-kit (#273); a failure stays on screen as its Error with Retry (#245).
 */
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Image, ScrollView, StyleSheet, View} from 'react-native';
import {
  ActionRow,
  Button,
  ChoiceList,
  ErrorView,
  LoadingView,
  metrics,
  RowGroup,
  shared,
  TitleBar,
  useBackKey,
  type Problem,
} from '@ink-tools/ui-kit';
import {encodePng, parsePuzzleCode, seedFromNumber, toBase64, type Raster} from '@ink-tools/puzzle-core';
import type {Game, GameViewProps} from '../games';
import {playCopy} from './copy';
import {devicePages, type Here, type PagePorts} from './pages';
import type {Choices, GamePage, PageShape, Puzzle, PuzzleGame, Verdict} from './puzzle';

/** A fresh seed for each new puzzle: 40 bits, eight characters of the code's alphabet. */
const SEED_RANGE = 2 ** 40;
const freshSeed = () => seedFromNumber(Math.floor(Math.random() * SEED_RANGE));

/** shortcut: every page is laid out for the right hand; add the choice when a player asks for it. */
const HAND = 'right' as const;

export type GameViewDeps = {
  pages?: PagePorts;
  seed?: () => string;
};

type Screen =
  | {kind: 'reading'}
  | {kind: 'ready'; here: Here; board: Puzzle | null}
  | {kind: 'working'}
  | {kind: 'verdict'; here: Here; board: Puzzle; verdict: Verdict}
  | {kind: 'answer'; here: Here; board: Puzzle; picture: Raster}
  | {kind: 'error'; problem: Problem; retry: () => void};

const shapeOf = (here: Here): PageShape => ({orientation: here.orientation, hand: HAND});

/** Lets the Loading view draw before a long synchronous step, such as drawing a page. */
const nextFrame = () => new Promise<void>(resolve => setTimeout(resolve, 0));

export function GameView({
  game,
  onBack,
  onClose,
  pages: given,
  seed = freshSeed,
}: GameViewProps & GameViewDeps & {game: PuzzleGame}): React.JSX.Element {
  const pages = useMemo(() => given ?? devicePages(), [given]);
  const [screen, setScreen] = useState<Screen>({kind: 'reading'});
  const [choices, setChoices] = useState<Choices>(() =>
    Object.fromEntries(game.options.map(option => [option.id, option.initial])),
  );

  const failed = useCallback(
    (what: string, retry: () => void, why: string) => {
      pages.log(`${game.id}: ${what}: ${why}`);
      // Only a page that cannot be read points at the note; another failure has no known cause.
      const reason = what === playCopy['error.here'] ? playCopy['error.hereHint'] : playCopy['error.hint'];
      setScreen({kind: 'error', problem: {what, reason}, retry});
    },
    [game.id, pages],
  );

  /** Reads the current page, and the puzzle on it when this game made it. */
  const read = useCallback(async () => {
    setScreen({kind: 'reading'});
    const retry = () => {
      read();
    };
    const here = await pages.here();
    if (!here.ok) {return failed(playCopy['error.here'], retry, here.message);}
    const code = await pages.codeOf(here.value);
    if (!code.ok) {return failed(playCopy['error.here'], retry, code.message);}
    let board: Puzzle | null = null;
    if (code.value !== null && game.open) {
      try {
        board = game.open(code.value, shapeOf(here.value));
      } catch (error) {
        // Another game's page, or a background no game made: this game has nothing to check there.
        pages.log(`${game.id}: ${code.value} is not a ${game.id} page: ${String(error)}`);
      }
    }
    setScreen({kind: 'ready', here: here.value, board});
  }, [failed, game, pages]);

  useEffect(() => {
    // The page files an earlier Add Page left, as its insert ended this JavaScript before it could.
    pages.clear();
    read();
  }, [pages, read]);

  const add = useCallback(
    async (here: Here) => {
      const retry = () => {
      add(here);
    };
      setScreen({kind: 'working'});
      await nextFrame();
      let board: GamePage;
      let png: Uint8Array;
      try {
        board = game.create(choices, seed(), shapeOf(here));
        png = encodePng(board.page);
      } catch (error) {
        return failed(playCopy['error.add'], retry, String(error));
      }
      // The view closes first: the note reload of a successful insert can end this JavaScript, and a
      // view left open then stays frozen on Loading over a dead bridge (device round, #386). The note
      // shows the new page after the current one; only a failure opens the view again, on its Error.
      pages.log(`${game.id}: adding ${board.code} after page ${here.page}`);
      await pages.hide();
      const inserted = await pages.insert(here, board.code, png);
      if (!inserted.ok) {
        await pages.show();
        return failed(playCopy['error.add'], retry, inserted.message);
      }
      pages.log(`${game.id}: added ${board.code}`);
      onBack();
    },
    [choices, failed, game, onBack, pages, seed],
  );

  const check = useCallback(
    async (here: Here, board: Puzzle) => {
      const retry = () => {
      check(here, board);
    };
      setScreen({kind: 'working'});
      const ink = await pages.ink(here);
      if (!ink.ok) {return failed(playCopy['error.check'], retry, ink.message);}
      let verdict: Verdict;
      try {
        verdict = await board.check(ink.value, elements => pages.read(here, elements));
      } catch (error) {
        return failed(playCopy['error.check'], retry, String(error));
      }
      pages.log(`${game.id}: checked ${board.code}: ${verdict.wrong} wrong, solved ${verdict.solved}`);
      setScreen({kind: 'verdict', here, board, verdict});
    },
    [failed, game.id, pages],
  );

  const answer = useCallback(async (here: Here, board: Puzzle) => {
    setScreen({kind: 'working'});
    await nextFrame();
    setScreen({kind: 'answer', here, board, picture: board.answer()});
  }, []);

  switch (screen.kind) {
    case 'reading':
    case 'working':
      return <LoadingView title={game.title} onClose={onClose} />;
    case 'error':
      return <ErrorView problem={screen.problem} onRetry={screen.retry} onClose={onClose} />;
    case 'verdict': {
      const {verdict} = screen;
      const line = verdict.solved
        ? playCopy['verdict.solved']
        : verdict.wrong === 0
          ? playCopy['verdict.open']
          : playCopy['verdict.wrong'](verdict.wrong);
      const back = () => setScreen({kind: 'ready', here: screen.here, board: screen.board});
      return <Picture title={playCopy['verdict.title']} note={line} raster={verdict.picture} onBack={back} onClose={onClose} />;
    }
    case 'answer': {
      const back = () => setScreen({kind: 'ready', here: screen.here, board: screen.board});
      return (
        <Picture title={playCopy['answer.title']} note={playCopy['answer.note']} raster={screen.picture} onBack={back} onClose={onClose} />
      );
    }
    case 'ready':
      return (
        <Ready
          game={game}
          screen={screen}
          choices={choices}
          onChoose={(id, value) => setChoices(current => ({...current, [id]: value}))}
          onAdd={() => add(screen.here)}
          onCheck={board => check(screen.here, board)}
          onAnswer={board => answer(screen.here, board)}
          onBack={onBack}
          onClose={onClose}
        />
      );
  }
}

/** The game list's entry of a puzzle game: its view is this one. */
export function puzzleEntry(game: PuzzleGame, deps: GameViewDeps = {}): Game {
  return {
    id: game.id,
    title: game.title,
    subtitle: game.subtitle,
    View: props => <GameView game={game} {...deps} {...props} />,
  };
}

function Ready({
  game,
  screen,
  choices,
  onChoose,
  onAdd,
  onCheck,
  onAnswer,
  onBack,
  onClose,
}: GameViewProps & {
  game: PuzzleGame;
  screen: {here: Here; board: Puzzle | null};
  choices: Choices;
  onChoose: (id: string, value: string) => void;
  onAdd: () => void;
  onCheck: (board: Puzzle) => void;
  onAnswer: (board: Puzzle) => void;
}): React.JSX.Element {
  useBackKey(onBack);
  const {board} = screen;
  // A board's page holds nothing the view reads back, so it has no «This page» (#402).
  const thisPage = !game.open ? null : board ? (
    <RowGroup caption={playCopy['here.caption']}>
      <ActionRow
        title={playCopy['here.title'](game.title, playCopy.bands[parsePuzzleCode(board.code).difficulty])}
        subtitle={board.code}
        action={{label: playCopy['here.check'], onPress: () => onCheck(board)}}
        secondAction={{label: playCopy['here.answer'], onPress: () => onAnswer(board)}}
      />
    </RowGroup>
  ) : (
    <RowGroup caption={playCopy['here.caption']} note={playCopy['here.none'](game.title)} />
  );
  return (
    <View style={shared.screen}>
      <TitleBar title={game.title} onBack={onBack} onClose={onClose} />
      <ScrollView style={styles.fill}>
        {board && thisPage}
        {game.options.map(option => (
          <ChoiceList
            key={option.id}
            title={option.title}
            choices={option.choices}
            value={choices[option.id]}
            onChange={value => onChoose(option.id, value)}
          />
        ))}
        <RowGroup caption={playCopy['new.caption']} note={game.open ? playCopy['new.note'] : playCopy['new.noteBoard']} />
        <View style={[shared.buttons, styles.section]}>
          <Button kind="primary" label={playCopy['new.add']} onPress={onAdd} />
        </View>
        {!board && thisPage}
      </ScrollView>
    </View>
  );
}

/** A page picture the note never gets: the marks of «Check», or the solution. */
function Picture({
  title,
  note,
  raster,
  onBack,
  onClose,
}: GameViewProps & {title: string; note: string; raster: Raster}): React.JSX.Element {
  useBackKey(onBack);
  const uri = useMemo(() => `data:image/png;base64,${toBase64(encodePng(raster))}`, [raster]);
  return (
    <View style={shared.screen}>
      <TitleBar title={title} onBack={onBack} onClose={onClose} />
      <RowGroup note={note} />
      <Image
        source={{uri}}
        style={[styles.fill, {aspectRatio: raster.width / raster.height}]}
        resizeMode="contain"
        fadeDuration={0}
        accessibilityLabel={note}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1},
  /** The gap a RowGroup leaves under itself, so the next caption sits as far from the button. */
  section: {marginBottom: metrics.sectionGap},
});
