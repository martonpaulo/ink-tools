/**
 * One game's view (#386), the same for every game: its choices and «Add Page», which puts a new
 * puzzle on a page after the current one; and, on a page the game made, «Check», which marks the
 * mistakes in the ink, and «Show Solution», both shown here only, so the note never gets the answer.
 * A pass-and-play board (#402) has no `open`: its view is the choices and «Add Page» alone.
 * Every control comes from ui-kit (#273); a failure stays on screen as its Error with Retry (#245).
 * Each of those presses reads the page on screen again, never the read the view kept: the view
 * outlives a close, and the page can turn before the next press (device round, #542).
 * The view opens on the game's last choices, kept by each «Add Page» (#569).
 */
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {
  ActionRow,
  Button,
  ChoiceList,
  ErrorView,
  LoadingView,
  MediaFrame,
  metrics,
  PagedColumn,
  RowGroup,
  shared,
  TitleBar,
  useBackKey,
  type Problem,
} from '@ink-tools/ui-kit';
import {encodePng, knownPageLayout, pageCodeParts, parsePuzzleCode, placedPageCode, seedFromNumber, toBase64, withPageLayout, type Raster} from '@ink-tools/puzzle-core';
import type {Game, GameViewProps} from '../games';
import {playCopy} from './copy';
import {devicePages, type Here, type PagePorts} from './pages';
import {deviceKept, type KeptChoices} from './kept';
import {offered, recalled, settle, type Choices, type GamePage, type PageShape, type Puzzle, type PuzzleGame, type Verdict} from './puzzle';

/** A fresh seed for each new puzzle: 40 bits, eight characters of the code's alphabet. */
const SEED_RANGE = 2 ** 40;
const freshSeed = () => seedFromNumber(Math.floor(Math.random() * SEED_RANGE));

/** shortcut: every page is laid out for the right hand; add the choice when a player asks for it. */
const HAND = 'right' as const;

export type GameViewDeps = {
  pages?: PagePorts;
  seed?: () => string;
  kept?: KeptChoices;
};

type Screen =
  | {kind: 'reading'}
  | {kind: 'ready'; board: Puzzle | null; newer?: boolean}
  | {kind: 'working'}
  | {kind: 'verdict'; board: Puzzle; verdict: Verdict}
  | {kind: 'answer'; board: Puzzle; picture: Raster}
  | {kind: 'error'; problem: Problem; retry: () => void};

const shapeOf = (here: Here): PageShape => ({orientation: here.orientation, hand: HAND});

/**
 * The puzzle a page's background name holds, laid out as that page was printed: a page made before
 * a layout change keeps its grid where its picture has it, so «Check» reads its ink there (#553).
 */
export function openPage(open: NonNullable<PuzzleGame['open']>, name: string, here: Here): Puzzle {
  const {code, version} = pageCodeParts(name);
  return {...withPageLayout(version, () => open(code, shapeOf(here))), code: name};
}

/** Lets the Loading view draw before a long synchronous step, such as drawing a page. */
const nextFrame = () => new Promise<void>(resolve => setTimeout(resolve, 0));

export function GameView({
  game,
  onBack,
  onClose,
  pages: given,
  seed = freshSeed,
  kept: givenKept,
}: GameViewProps & GameViewDeps & {game: PuzzleGame}): React.JSX.Element {
  const pages = useMemo(() => given ?? devicePages(), [given]);
  const kept = useMemo(() => givenKept ?? deviceKept(), [givenKept]);
  const [screen, setScreen] = useState<Screen>({kind: 'reading'});
  const [choices, setChoices] = useState<Choices>(() => recalled(game.options, null));

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
    // The page only: a note's name can be personal, and logs keep no personal data.
    pages.log(`${game.id}: on page ${here.value.page}`);
    const code = await pages.codeOf(here.value);
    if (!code.ok) {return failed(playCopy['error.here'], retry, code.message);}
    let board: Puzzle | null = null;
    // A page drawn by a layout this Puzzles does not know says so, not that it holds no puzzle.
    const newer = code.value !== null && !knownPageLayout(code.value);
    if (code.value !== null && game.open && !newer) {
      // Opening a puzzle from its code makes it again, which takes tens of seconds for a large hard
      // one and holds this JavaScript the whole time; the time is logged so a press that seems lost
      // right after the view opens can be told from a slow open (tablet row 146, #595).
      const started = Date.now();
      try {
        board = openPage(game.open, code.value, here.value);
        pages.log(`${game.id}: opened ${code.value} in ${Date.now() - started} ms`);
      } catch (error) {
        // Another game's page, or a background no game made: this game has nothing to check there.
        pages.log(`${game.id}: ${code.value} is not a ${game.id} page: ${String(error)}`);
      }
    }
    setScreen({kind: 'ready', board, newer});
  }, [failed, game, pages]);

  useEffect(() => {
    // The page files an earlier Add Page left, as its insert ended this JavaScript before it could.
    pages.clear();
    // The game's last choices first, so the view never shows its defaults and then changes (#569).
    kept.recall(game.id).then(last => {
      if (last.ok) {
        setChoices(recalled(game.options, last.value));
      } else {
        pages.log(`${game.id}: the last choices were not read, so the defaults show: ${last.message}`);
      }
      read();
    });
  }, [game, kept, pages, read]);

  /**
   * The page on screen now and its puzzle of this game: `board` when the page still holds it, else
   * the puzzle the page holds now, so the press acts on the page the person sees. A page with no
   * puzzle of this game shows instead, and this answers null, so a check or a solution never belongs
   * to another page (#542).
   */
  const onScreen = useCallback(
    async (board: Puzzle, retry: () => void): Promise<{here: Here; board: Puzzle} | null> => {
      const here = await pages.here();
      if (!here.ok) {
        failed(playCopy['error.here'], retry, here.message);
        return null;
      }
      const code = await pages.codeOf(here.value);
      if (!code.ok) {
        failed(playCopy['error.here'], retry, code.message);
        return null;
      }
      if (code.value === board.code) {return {here: here.value, board};}
      pages.log(`${game.id}: page ${here.value.page} holds ${code.value ?? 'no puzzle'}, not ${board.code}`);
      if (code.value !== null && game.open) {
        try {
          return {here: here.value, board: openPage(game.open, code.value, here.value)};
        } catch (error) {
          pages.log(`${game.id}: ${code.value} is not a ${game.id} page: ${String(error)}`);
        }
      }
      read();
      return null;
    },
    [failed, game, pages, read],
  );

  const add = useCallback(
    async () => {
      const retry = () => {
        add();
      };
      setScreen({kind: 'working'});
      await nextFrame();
      // The page on screen now, not the one the view opened on (#542).
      const here = await pages.here();
      if (!here.ok) {return failed(playCopy['error.here'], retry, here.message);}
      let board: GamePage;
      let png: Uint8Array;
      try {
        const made = game.create(choices, seed(), shapeOf(here.value));
        // Its background's name says the layout it is drawn by, so the page opens by it later (#553).
        board = {...made, code: placedPageCode(made.code)};
        png = encodePng(board.page);
      } catch (error) {
        return failed(playCopy['error.add'], retry, String(error));
      }
      // The view closes first: the note reload of a successful insert can end this JavaScript, and a
      // view left open then stays frozen on Loading over a dead bridge (device round, #386). The note
      // shows the new page after the current one; only a failure opens the view again, on its Error.
      pages.log(`${game.id}: adding ${board.code} after page ${here.value.page}`);
      // Kept before the insert, whose note reload can end this JavaScript; a failure only logs (#569).
      const keptNow = await kept.keep(game.id, choices);
      if (!keptNow.ok) {pages.log(`${game.id}: the choices were not kept: ${keptNow.message}`);}
      await pages.hide();
      const inserted = await pages.insert(here.value, board.code, png);
      if (!inserted.ok) {
        await pages.show();
        return failed(playCopy['error.add'], retry, inserted.message);
      }
      pages.log(`${game.id}: added ${board.code}`);
      onBack();
    },
    [choices, failed, game, kept, onBack, pages, seed],
  );

  const check = useCallback(
    async (shown: Puzzle) => {
      const retry = () => {
        check(shown);
      };
      setScreen({kind: 'working'});
      pages.log(`${game.id}: check pressed on ${shown.code}`);
      const now = await onScreen(shown, retry);
      if (!now) {return;}
      const {here, board} = now;
      const ink = await pages.ink(here);
      if (!ink.ok) {return failed(playCopy['error.check'], retry, ink.message);}
      let verdict: Verdict;
      try {
        verdict = await board.check(ink.value, elements => pages.read(here, elements));
      } catch (error) {
        return failed(playCopy['error.check'], retry, String(error));
      }
      pages.log(`${game.id}: checked ${board.code}: ${verdict.wrong} wrong, solved ${verdict.solved}`);
      setScreen({kind: 'verdict', board, verdict});
    },
    [failed, game.id, onScreen, pages],
  );

  const answer = useCallback(
    async (shown: Puzzle) => {
      const retry = () => {
        answer(shown);
      };
      setScreen({kind: 'working'});
      await nextFrame();
      const now = await onScreen(shown, retry);
      if (!now) {return;}
      setScreen({kind: 'answer', board: now.board, picture: now.board.answer()});
    },
    [onScreen],
  );

  switch (screen.kind) {
    case 'reading':
    case 'working':
      return <LoadingView title={game.title} onClose={onClose} />;
    case 'error':
      return <ErrorView title={game.title} problem={screen.problem} onRetry={screen.retry} onBack={onBack} onClose={onClose} />;
    case 'verdict': {
      const {verdict} = screen;
      const found = verdict.solved
        ? playCopy['verdict.solved']
        : verdict.wrong === 0
          ? playCopy['verdict.open']
          : (game.wrong ?? playCopy['verdict.wrong'])(verdict.wrong);
      const line = verdict.unread === 0 ? found : `${found} ${(game.unread ?? playCopy['verdict.unread'])(verdict.unread)}`;
      const back = () => setScreen({kind: 'ready', board: screen.board});
      return <Picture title={playCopy['verdict.title']} note={line} raster={verdict.picture} onBack={back} onClose={onClose} />;
    }
    case 'answer': {
      const back = () => setScreen({kind: 'ready', board: screen.board});
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
          onChoose={(id, value) => setChoices(current => settle(game.options, {...current, [id]: value}))}
          onAdd={add}
          onCheck={check}
          onAnswer={answer}
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
  screen: {board: Puzzle | null; newer?: boolean};
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
        title={playCopy['here.title'](game.title, playCopy.bands[parsePuzzleCode(pageCodeParts(board.code).code).difficulty], board.size)}
        subtitle={pageCodeParts(board.code).code}
        action={{label: playCopy['here.check'], onPress: () => onCheck(board)}}
        secondAction={{label: playCopy['here.answer'], onPress: () => onAnswer(board)}}
      />
    </RowGroup>
  ) : (
    <RowGroup caption={playCopy['here.caption']} note={screen.newer ? playCopy['here.newer'] : playCopy['here.none'](game.title)} />
  );
  // The «New page» caption heads the choices, so they never read as the open puzzle's (#549).
  const newPage = <RowGroup caption={playCopy['new.caption']} note={game.open ? playCopy['new.note'] : playCopy['new.noteBoard']} />;
  const hasChoices = game.options.length > 0;
  return (
    <View style={shared.screen}>
      <TitleBar title={game.title} onBack={onBack} onClose={onClose} />
      {/* Nothing scrolls: the parts page with ui-kit's Pager, in the room the fixed button below leaves (#548, #578). */}
      {(game.open || hasChoices) && (
        <PagedColumn>
          {board && thisPage}
          {hasChoices && newPage}
          {game.options.map(option => (
            <ChoiceList
              key={option.id}
              title={option.title}
              choices={offered(option, choices)}
              value={choices[option.id]}
              note={option.note?.(choices)}
              onChange={value => onChoose(option.id, value)}
            />
          ))}
        </PagedColumn>
      )}
      {!hasChoices && newPage}
      {/* Fixed under the choices, so a long list never pushes the view's main action off screen (#383). */}
      <View style={[shared.buttons, styles.section]}>
        <Button kind="primary" label={playCopy['new.add']} onPress={onAdd} />
      </View>
      {/* With no puzzle on the page, its note comes last, out of the list, so a long list never cuts it. */}
      {!board && thisPage}
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
      <MediaFrame uri={uri} width={raster.width} height={raster.height} accessibilityLabel={note} />
    </View>
  );
}

const styles = StyleSheet.create({
  /** The gap a RowGroup leaves under itself, so the next caption sits as far from the button. */
  section: {marginBottom: metrics.sectionGap},
});
