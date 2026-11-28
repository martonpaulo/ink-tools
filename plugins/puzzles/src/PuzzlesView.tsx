/**
 * The Puzzles full view (#453), every control from ui-kit (#273): the title bar with Close, then the
 * game list. Opening a game first checks what it needs (`requirements.ts`): the plugin's declared
 * permissions and the game's own. While that runs, the Loading state; a missing one, the Needs
 * state with its fix; a check the host could not answer, the Error state with Retry (#245).
 */
import React, {useCallback, useEffect, useState} from 'react';
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
import {copy} from './copy';
import {GAMES, type Game} from './games';
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

export type PuzzlesViewProps = {
  /** Closes the plugin view; tests pass a fake. */
  close?: () => void;
  ports?: RequirementPorts;
  games?: readonly Game[];
};

type Screen =
  | {kind: 'list'}
  | {kind: 'checking'}
  | {kind: 'needs'; problem: Problem}
  | {kind: 'error'; retry: () => void}
  | {kind: 'game'; game: Game};

export function PuzzlesView({
  close = () => closePluginView(),
  ports = DEVICE_PORTS,
  games = GAMES,
}: PuzzlesViewProps): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>({kind: 'list'});
  const list = useCallback(() => setScreen({kind: 'list'}), []);
  // The view outlives a close, so each press starts at the game list, never on the screen the last
  // one ended on, such as a solution (device round, #386); `src/toolbar.ts` lets the press reach here (#539).
  useEffect(() => onButtonEvent(list), [list]);

  /** Checks what `game` needs, then opens it, or shows the Needs or Error state that stops it. */
  const open = useCallback(
    (game: Game) => {
      const run = () => {
        setScreen({kind: 'checking'});
        checkRequirements([...PLUGIN_REQUIREMENTS, ...(game.requires ?? [])], ports).then(
          found => {
            if (found.kind === 'met') {
              setScreen({kind: 'game', game});
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

  switch (screen.kind) {
    case 'checking':
      return <LoadingView title={copy.title} onClose={close} />;
    case 'needs':
      return <Needs problem={screen.problem} onClose={close} />;
    case 'error':
      return <ErrorView title={copy.title} problem={CHECK_FAILED} onRetry={screen.retry} onBack={list} onClose={close} />;
    case 'game': {
      const {View: GameView} = screen.game;
      return <GameView onBack={list} onClose={close} />;
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

