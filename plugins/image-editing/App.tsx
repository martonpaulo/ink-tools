import React, {useEffect, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {
  shared,
  TitleBar,
  useArmOnRoot,
  useBackKey,
  useWorking,
  WorkingStrip,
} from '@ink-tools/ui-kit';
import {armBackKey as armModule, closePluginView} from '@ink-tools/sn-adapter/official';
import {copy} from './src/copy';
import {EditsForm} from './src/EditsForm';
import {currentSettings, rememberSettings} from './src/edits';
import {
  closeStyles,
  GridState,
  gridState,
  onGridState,
  pickStyle,
  retryStyles,
  toggleOption,
} from './src/styles';
import {StylesGrid} from './src/StylesGrid';
import {
  addMark,
  applyDrawing,
  cancelDrawing,
  clearMarks,
  closeEditor,
  EditorState,
  editorState,
  finishErase,
  onEditorState,
  runEditorEdit,
  stylesDone,
  undoStroke,
} from './src/editor';
import {Editor} from './src/EditorView';
import {BACK_MODULE} from './src/native';
import {askFilePermissions} from './src/permissions';
import {working} from './src/working';

/**
 * Retouch's views: the editor, which the «Image Editing» lasso button opens (#226), the Styles
 * grid it opens (#133), and Settings, one switch per edit the editor shows (#136), every size and
 * colour from the shared ui-kit (#93). Back does what the open screen's «Close» does: it closes
 * the styles grid back to the editor, the editor, or Settings, and does nothing while an edit runs
 * (#204). In a pen mode it leaves the mode: Erase keeps its strokes as «Done» does, Crop drops its
 * marks as «Cancel» does (#278). PluginHost never sends React Native's Back event to a plugin view
 * (#204), so sn-adapter's native Back key module turns the key into it (`BackKeyModule.java`,
 * #226, #300); every screen keeps its visible «Close» too.
 */
export default function App({
  close = () => closePluginView(),
  armBackKey = rootTag => armModule(BACK_MODULE, rootTag),
}: {
  /** Closes the plugin view; tests pass a fake. */
  close?: () => void;
  /** Arms the shared Back key module on this view's root (#226, #300); tests pass a fake. */
  armBackKey?: (rootTag: number) => void;
}) {
  // Once per root view, through the shared hook every plugin view uses (#300).
  useArmOnRoot(armBackKey);
  const [settings, setSettings] = useState(currentSettings());
  const [grid, setGrid] = useState<GridState>(gridState());
  const [editor, setEditor] = useState<EditorState>(editorState());
  useEffect(() => onGridState(setGrid), []);
  useEffect(() => onEditorState(setEditor), []);
  /** The grid's close: back to the editor when it opened the grid, else the view closes. */
  const closeGrid = () => {
    if (editorState().phase === 'idle') {
      close();
    }
  };
  useEffect(() => {
    askFilePermissions();
  }, []);
  useBackKey(() => {
    if (working.isWorking()) {
      // The edit ends by itself, with its toast.
    } else if (grid.phase !== 'idle') {
      // «Making» is refused there too, as the grid's «Close» is disabled.
      closeStyles(closeGrid);
    } else if (editor.phase === 'ready' && editor.draw === 'erase') {
      // Strokes shown erased are kept, as «Done» and «Close» keep them (#278).
      finishErase(close);
    } else if (editor.phase === 'ready' && editor.draw !== null) {
      cancelDrawing();
    } else if (editor.phase !== 'idle') {
      closeEditor(close);
    } else {
      close();
    }
  });
  if (useWorking(working)) {
    return <WorkingStrip working={working} />;
  }
  if (grid.phase !== 'idle') {
    return (
      <StylesGrid
        state={grid}
        onPick={style => pickStyle(style, closeGrid).then(done => stylesDone(done))}
        onToggle={option => toggleOption(option)}
        onRetry={() => retryStyles()}
        onClose={() => closeStyles(closeGrid)}
      />
    );
  }
  if (editor.phase !== 'idle') {
    return (
      <Editor
        state={editor}
        settings={settings}
        onEdit={edit => runEditorEdit(edit, close)}
        onApply={edit => applyDrawing(edit, close)}
        onMark={points => addMark(points)}
        onClear={clearMarks}
        onUndoStroke={() => undoStroke()}
        onDone={() => finishErase(close)}
        onCancel={() => cancelDrawing()}
        onClose={() => closeEditor(close)}
      />
    );
  }
  return (
    <View style={shared.screen}>
      <TitleBar title={copy.title} onClose={close} />
      {/* One switch row per edit and per style outgrows the Manta's height (#274): they page (#548). */}
      <View style={styles.rows}>
        <EditsForm
          settings={settings}
          onChange={next => {
            setSettings(next);
            rememberSettings(next);
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rows: {flex: 1},
});
