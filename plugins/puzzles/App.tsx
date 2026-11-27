import React from 'react';
import {useArmOnRoot} from '@ink-tools/ui-kit';
import {armBackKey} from '@ink-tools/sn-adapter/official';
import {BACK_MODULE, PuzzlesView, type PuzzlesViewProps} from './src/PuzzlesView';

/** The Puzzles full view (#453); Back stays in the view and never reaches the note (#300). */
export default function App(props: PuzzlesViewProps) {
  useArmOnRoot(rootTag => armBackKey(BACK_MODULE, rootTag));
  return <PuzzlesView {...props} />;
}
