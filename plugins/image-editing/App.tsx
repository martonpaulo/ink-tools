import React, {useContext, useEffect, useState} from 'react';
import {RootTagContext, ScrollView, StyleSheet, View} from 'react-native';
import {
  shared,
  TitleBar,
  useBackKey,
  useWorking,
  WorkingStrip,
} from '@ink-tools/ui-kit';
import {closePluginView} from '@ink-tools/sn-adapter/official';
import {copy} from './src/copy';
import {EditsForm} from './src/EditsForm';
import {currentSettings, rememberSettings} from './src/edits';
import {
  closeStyles,
  GridState,
  gridState,
  onGridState,
  pickStyle,
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
import {retouchNative} from './src/native';
import {askFilePermissions} from './src/permissions';
import {working} from './src/working';

/**
 * Retouch's views: the editor, which the «Image Editing» lasso button opens (#226), the Styles
 * grid it opens (#133), and Settings, one switch per edit the editor shows (#136), every size and
 * colour from the shared ui-kit (#93). Back does what the open screen's «Close» does: it closes
 * the styles grid back to the editor, the editor, or Settings, and does nothing while an edit runs
 * (#204). In a pen mode it leaves the mode: Erase keeps its strokes as «Done» does, Crop drops its
 * marks as «Cancel» does (#278). PluginHost never sends React Native's Back event to a plugin view
 * (#204), so the native module turns the key into it (`BackKey.java`, #226); every screen keeps its
 * visible «Close» too.
 */
export default function App({
  close = () => closePluginView(),
  listenBackKey = rootTag =>
    retouchNative()
      .listenBackKey(rootTag)
      .then(result =>
        console.log(
          `Retouch: back key: ${result.ok ? 'listening' : result.message}`,
        ),
      ),
}: {
  /** Closes the plugin view; tests pass a fake. */
  close?: () => void;
  /** Routes the device Back key to this view's root (#226); tests pass a fake. */
  listenBackKey?: (rootTag: number) => void;
}) {
  const rootTag = useContext(RootTagContext);
  useEffect(() => {
    listenBackKey(rootTag);
    // Once per root view: the native listener outlives each show of the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootTag]);
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
      {/* One switch row per edit and per style outgrows the Manta's height (#274). */}
      <ScrollView style={styles.rows}>
        <EditsForm
          settings={settings}
          onChange={next => {
            setSettings(next);
            rememberSettings(next);
          }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  rows: {flex: 1},
});
