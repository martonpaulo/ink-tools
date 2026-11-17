/**
 * The editor view (#226): the lassoed picture on top, every edit switched on in Settings as a
 * button below it, grouped, and «Close». Erase and Crop turn the picture into a pen canvas: each
 * stroke shows as dots when it is drawn, and «Erase» or «Crop» runs it. No slider and no live
 * preview: the picture is shown again once per edit, one refresh.
 */
import React, {useRef, useState} from 'react';
import {
  GestureResponderEvent,
  Image,
  LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {Button, metrics, shared} from '@ink-tools/ui-kit';
import type {PenPoint} from '@ink-tools/sn-adapter/official';
import {copy} from './copy';
import {EDITOR_GROUPS, EditorState} from './editor';
import {EditDefinition, editOf, enabledEdits, RetouchSettings} from './edits';
import {sizeOf} from './edit';

/** A drawn point joins its stroke only this far, in view pixels, from the last: one per refresh. */
const MIN_STEP = 6;
/** The side of a drawn dot, in view pixels. */
const DOT = 6;

export type EditorProps = {
  state: EditorState;
  settings: RetouchSettings;
  onEdit: (edit: EditDefinition) => void;
  onApply: (edit: EditDefinition) => void;
  /** A stroke drawn on the picture, in page pixels. */
  onMark: (points: PenPoint[]) => void;
  onClear: () => void;
  onCancel: () => void;
  onClose: () => void;
};

type Box = {width: number; height: number};

export function Editor({
  state,
  settings,
  onEdit,
  onApply,
  onMark,
  onClear,
  onCancel,
  onClose,
}: EditorProps): React.JSX.Element {
  const [box, setBox] = useState<Box | null>(null);
  const [live, setLive] = useState<PenPoint[]>([]);
  const stroke = useRef<PenPoint[]>([]);
  if (state.phase !== 'ready') {
    return (
      <EditorScreen
        status={
          state.phase === 'failed' ? state.message : copy['editor.opening']
        }
        closeDisabled={state.phase === 'opening'}
        onClose={onClose}
      />
    );
  }
  const picture = sizeOf(state.rect);
  const scale = box
    ? Math.min(box.width / picture.width, box.height / picture.height)
    : 0;
  const toPage = (point: PenPoint): PenPoint => ({
    x: state.rect.left + point.x / scale,
    y: state.rect.top + point.y / scale,
  });
  const toView = (point: PenPoint): PenPoint => ({
    x: (point.x - state.rect.left) * scale,
    y: (point.y - state.rect.top) * scale,
  });
  const at = (event: GestureResponderEvent): PenPoint => ({
    x: event.nativeEvent.locationX,
    y: event.nativeEvent.locationY,
  });
  const drawing = state.draw !== null && state.busy === null && scale > 0;
  const start = (event: GestureResponderEvent) => {
    stroke.current = [at(event)];
    setLive(stroke.current);
  };
  const move = (event: GestureResponderEvent) => {
    const point = at(event);
    const last = stroke.current[stroke.current.length - 1];
    if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= MIN_STEP) {
      stroke.current = [...stroke.current, point];
      setLive(stroke.current);
    }
  };
  const end = () => {
    if (stroke.current.length > 0) {
      onMark(stroke.current.map(toPage));
    }
    stroke.current = [];
    setLive([]);
  };
  const dots = [...state.marks.map(mark => mark.map(toView)), live];
  const edits = enabledEdits(settings);
  const status =
    state.busy !== null
      ? copy['editor.working']
      : state.message ??
        (state.draw === 'erase'
          ? copy['editor.drawErase']
          : state.draw === 'crop'
          ? copy['editor.drawCrop']
          : null);
  return (
    <EditorScreen
      status={status}
      closeDisabled={state.busy !== null}
      onClose={onClose}>
      <View
        style={styles.stage}
        onLayout={(event: LayoutChangeEvent) =>
          setBox({
            width: event.nativeEvent.layout.width,
            height: event.nativeEvent.layout.height,
          })
        }>
        {scale > 0 ? (
          <View
            testID="editor-canvas"
            style={[
              shared.outline,
              {width: picture.width * scale, height: picture.height * scale},
            ]}
            onStartShouldSetResponder={() => drawing}
            onMoveShouldSetResponder={() => drawing}
            onResponderGrant={start}
            onResponderMove={move}
            onResponderRelease={end}
            onResponderTerminate={end}>
            <Image
              accessibilityLabel={copy['editor.picture']}
              source={{uri: `file://${state.preview}`}}
              resizeMode="stretch"
              style={styles.picture}
            />
            {dots.flatMap((mark, k) =>
              mark.map((point, i) => (
                <View
                  key={`${k}-${i}`}
                  pointerEvents="none"
                  style={[
                    styles.dot,
                    {left: point.x - DOT / 2, top: point.y - DOT / 2},
                  ]}
                />
              )),
            )}
          </View>
        ) : null}
      </View>
      {state.draw !== null ? (
        <View style={shared.buttons}>
          <Button
            label={editOf(state.draw).name}
            primary
            disabled={state.busy !== null || state.marks.length === 0}
            onPress={() => onApply(editOf(state.draw!))}
          />
          <Button
            label={copy['editor.clear']}
            disabled={state.busy !== null || state.marks.length === 0}
            onPress={onClear}
          />
          <Button
            label={copy['editor.cancel']}
            disabled={state.busy !== null}
            onPress={onCancel}
          />
        </View>
      ) : (
        <ScrollView style={styles.edits} contentContainerStyle={styles.groups}>
          {EDITOR_GROUPS.map(group => {
            const shown = edits.filter(edit => group.edits.includes(edit.id));
            return shown.length === 0 ? null : (
              <View key={group.heading} style={styles.group}>
                <Text accessibilityRole="header" style={shared.heading}>
                  {copy[group.heading]}
                </Text>
                <View style={shared.buttons}>
                  {shown.map(edit => (
                    <Button
                      key={edit.id}
                      label={edit.name}
                      disabled={state.busy !== null}
                      onPress={() => onEdit(edit)}
                    />
                  ))}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </EditorScreen>
  );
}

/**
 * The editor's frame: the title, a status line that keeps its two lines when empty, so a message
 * never moves the picture (one refresh less), the screen's content, and «Close».
 */
function EditorScreen({
  status,
  closeDisabled,
  onClose,
  children = null,
}: {
  status: string | null;
  closeDisabled: boolean;
  onClose: () => void;
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={shared.screen}>
      <Text accessibilityRole="header" style={shared.textLarge}>
        {copy.title}
      </Text>
      <Text
        accessibilityLiveRegion="polite"
        style={[shared.text, shared.statusLine]}>
        {status ?? ''}
      </Text>
      {children}
      <View style={shared.actions}>
        <Button
          label={copy['editor.close']}
          disabled={closeDisabled}
          onPress={onClose}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // White behind the picture, so a transparent edit never lies on black.
  picture: {...StyleSheet.absoluteFillObject, backgroundColor: metrics.paper},
  dot: {
    position: 'absolute',
    width: DOT,
    height: DOT,
    backgroundColor: metrics.ink,
  },
  edits: {flex: 1, alignSelf: 'stretch'},
  groups: {gap: metrics.sectionGap},
  group: {gap: metrics.controlGap},
});
