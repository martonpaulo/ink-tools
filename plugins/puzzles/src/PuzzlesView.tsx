/**
 * The Puzzles full view (#453), every control from ui-kit (#273): the title bar with Close, then the
 * game list. Opening a game first checks what it needs (`requirements.ts`): the plugin's declared
 * permissions and the game's own. While that runs, the Loading state; a missing one, the Needs
 * state with its fix; a check the host could not answer, the Error state with Retry (#245).
 * Each press of the button first reads the page on screen: a page a puzzle game made opens straight
 * on that game's view, whose «Check» and «Show Solution» come first; any other page, or one that
 * cannot be read, opens on the game list (#601).
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {View} from 'react-native';
import {
  closePluginView,
  hasPermission,
  onButtonEvent,
  requestPermission,
} from '@ink-tools/sn-adapter/official';
import {
  Chevron,
  ErrorView,
  ListRow,
  LoadingView,
  Needs,
  PagedList,
  RowGroup,
  shared,
  TitleBar,
  useBackKey,
  type Problem,
} from '@ink-tools/ui-kit';
import {knownPageLayout, pageCodeParts, parsePuzzleCode} from '@ink-tools/puzzle-core';
import {copy} from './copy';
import {GAMES, type Game, type OpenedPage} from './games';
import {Opening} from './play/GameView';
import {devicePages, type PagePorts} from './play/pages';
import {
  CHECK_FAILED,
  checkRequirements,
  needsProblem,
  PLUGIN_REQUIREMENTS,
  type RequirementPorts,
} from './requirements';

/** sn-adapter's Back key module, as `PuzzlesPackage.java` registers it (#300). */
export const BACK_MODULE = 'PuzzlesBack';

const DEVICE_PORTS: RequirementPorts = {
  has: hasPermission,
  request: requestPermission,
  log: line => console.log(`Puzzles: ${line}`),
};

/** What the view reads of the page on screen when it opens: the same reads «Check» makes (#601). */
export type PageReader = Pick<PagePorts, 'here' | 'codeOf' | 'log'>;

export type PuzzlesViewProps = {
  /** Closes the plugin view; tests pass a fake. */
  close?: () => void;
  ports?: RequirementPorts;
  games?: readonly Game[];
  /** The page on screen; tests pass fake pages. */
  pages?: PageReader;
};

/**
 * The game of `games` that made the page whose background is named `name`, or null for a page no
 * game of the list made (#601). The name is read as «Check» reads it: a page of an older layout,
 * with no `-L` mark or an older one, is its game's too; one a newer Puzzles drew opens on the list.
 * Only the code is read, never the puzzle made, so the view opens at once (#595).
 */
export function gameOfPage(name: string | null, games: readonly Game[]): Game | null {
  if (name === null || !knownPageLayout(name)) {return null;}
  let id: string;
  try {
    id = parsePuzzleCode(pageCodeParts(name).code).game;
  } catch {
    // A background no game made: its name is no puzzle code.
    return null;
  }
  // A pass-and-play board's name is no puzzle code, so only a puzzle game can match (#402).
  return games.find(game => game.id === id) ?? null;
}

/** The game the page on screen holds and that read, or null; a page that cannot be read logs why and holds none. */
async function pageGame(pages: PageReader, games: readonly Game[]): Promise<{game: Game; opened: OpenedPage} | null> {
  const here = await pages.here();
  if (!here.ok) {
    pages.log(`the page was not read, so the game list shows: ${here.message}`);
    return null;
  }
  const code = await pages.codeOf(here.value);
  if (!code.ok) {
    pages.log(`page ${here.value.page} was not read, so the game list shows: ${code.message}`);
    return null;
  }
  const game = gameOfPage(code.value, games);
  // The page only: a note's name can be personal, and logs keep no personal data.
  pages.log(`opened on page ${here.value.page}: ${game ? `${code.value}, a ${game.id} page` : 'no puzzle of the list'}`);
  return game && code.value !== null ? {game, opened: {here: here.value, name: code.value}} : null;
}

type Screen =
  /** The page read as the view opens, and a game's requirements checked after it: no mark, as the wait is short (#601). */
  | {kind: 'opening'}
  | {kind: 'list'}
  | {kind: 'checking'}
  | {kind: 'needs'; problem: Problem}
  | {kind: 'error'; retry: () => void}
  | {kind: 'game'; game: Game; opened?: OpenedPage};

export function PuzzlesView({
  close = () => closePluginView(),
  ports = DEVICE_PORTS,
  games = GAMES,
  pages: given,
}: PuzzlesViewProps): React.JSX.Element {
  const pages = useMemo(() => given ?? devicePages(), [given]);
  // The title bar alone while the page is read, so the list never shows and then turns into a game (#601).
  const [screen, setScreen] = useState<Screen>({kind: 'opening'});
  const list = useCallback(() => setScreen({kind: 'list'}), []);

  /**
   * Checks what `game` needs, then opens it, or shows the Needs or Error state that stops it; `opened`
   * when the view opens on the game's page, whose check shows no Loading after the page read (#601).
   */
  const open = useCallback(
    (game: Game, opened?: OpenedPage) => {
      const run = () => {
        setScreen(opened ? {kind: 'opening'} : {kind: 'checking'});
        checkRequirements([...PLUGIN_REQUIREMENTS, ...(game.requires ?? [])], ports).then(
          found => {
            if (found.kind === 'met') {
              setScreen({kind: 'game', game, opened});
            } else if (found.kind === 'unmet') {
              const problem = needsProblem(found.missing, ports, {
                granted: run,
                refused: refused => setScreen({kind: 'needs', problem: refused}),
              });
              setScreen({kind: 'needs', problem});
            } else {
              setScreen({kind: 'error', retry: run});
            }
          },
          error => {
            ports.log(`check failed: ${String(error)}`);
            setScreen({kind: 'error', retry: run});
          },
        );
      };
      run();
    },
    [ports],
  );

  /** The last page read started; an older read that answers after it changes nothing. */
  const reads = useRef(0);
  /** Reads the page on screen, then opens its game, or the game list for a page with none (#601). */
  const start = useCallback(async () => {
    const read = ++reads.current;
    setScreen({kind: 'opening'});
    let found: Awaited<ReturnType<typeof pageGame>> = null;
    try {
      found = await pageGame(pages, games);
    } catch (error) {
      pages.log(`the page was not read, so the game list shows: ${String(error)}`);
    }
    if (read !== reads.current) {return;}
    if (found) {
      open(found.game, found.opened);
    } else {
      list();
    }
  }, [games, list, open, pages]);

  useEffect(() => {
    start();
  }, [start]);
  // The view outlives a close and the page can turn before the next press, so each press reads the
  // page again, never ending on the screen the last one ended on, such as a solution (device round,
  // #386); `src/toolbar.ts` lets the press reach here (#539).
  useEffect(
    () =>
      onButtonEvent(() => {
        start();
      }),
    [start],
  );

  switch (screen.kind) {
    case 'opening':
      return <Opening title={copy.title} onClose={close} />;
    case 'checking':
      return <LoadingView title={copy.title} onClose={close} />;
    case 'needs':
      return <Needs problem={screen.problem} onClose={close} />;
    case 'error':
      return <ErrorView title={copy.title} problem={CHECK_FAILED} onRetry={screen.retry} onBack={list} onClose={close} />;
    case 'game': {
      const {View: GameView} = screen.game;
      return <GameView onBack={list} onClose={close} opened={screen.opened} />;
    }
    case 'list':
      return <GameList games={games} close={close} open={open} />;
  }
}

/** The game list; with no game, one line that says so, with no caption over an empty group. */
function GameList({
  games,
  close,
  open,
}: {
  games: readonly Game[];
  close: () => void;
  open: (game: Game) => void;
}): React.JSX.Element {
  // Back closes the view and never reaches the note behind it (#204, #300).
  useBackKey(close);
  return (
    <View style={shared.screen}>
      <TitleBar title={copy.title} onClose={close} />
      {games.length === 0 ? (
        <RowGroup note={copy['games.none']} />
      ) : (
        // Nothing scrolls: the games page with ui-kit's Pager (#548).
        <PagedList caption={copy['games.caption']}>
          {games.map(game => (
            <ListRow key={game.id} title={game.title} subtitle={game.subtitle} trailing={<Chevron />} onPress={() => open(game)} />
          ))}
        </PagedList>
      )}
    </View>
  );
}

