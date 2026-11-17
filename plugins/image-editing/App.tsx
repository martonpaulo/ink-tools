import React, {useEffect, useState} from 'react';
import {Text, View} from 'react-native';
import {
  Button,
  shared,
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
  onEditorState,
  runEditorEdit,
  stylesDone,
} from './src/editor';
import {Editor} from './src/EditorView';
import {askFilePermissions} from './src/permissions';
import {working} from './src/working';

/**
 * Retouch's views: the editor, which the «Image Editing» lasso button opens (#226), the Styles
 * grid it opens (#133), and Settings, one switch per edit the editor shows (#136), every size and
 * colour from the shared ui-kit (#93). Back does what the open screen's «Close» does: it closes
 * the styles grid back to the editor, the editor, or Settings, and does nothing while an edit runs
 * (#204). Settings has its own «Close» too: opened by the permission path, PluginHost kept the key
 * from the view on the Nomad, so Back never reached it (#204, measured on beta 7).
 */
export default function App({
  close = () => closePluginView(),
}: {
  /** Closes the plugin view; tests pass a fake. */
  close?: () => void;
}) {
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
    } else if (editor.phase === 'ready' && editor.draw !== null) {
      cancelDrawing();
    } else if (editor.phase !== 'idle') {
      closeEditor(close);
    } else {
      close();
    }
  });
  if (useWorking(working)) {
    return <WorkingStrip />;
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
        onMark={addMark}
        onClear={clearMarks}
        onCancel={cancelDrawing}
        onClose={() => closeEditor(close)}
      />
    );
  }
  return (
    <View style={shared.screen}>
      <Text accessibilityRole="header" style={shared.textLarge}>
        {copy.title}
      </Text>
      <EditsForm
        settings={settings}
        onChange={next => {
          setSettings(next);
          rememberSettings(next);
        }}
      />
      <View style={shared.actions}>
        <Button label={copy['settings.close']} onPress={close} />
      </View>
    </View>
  );
}
