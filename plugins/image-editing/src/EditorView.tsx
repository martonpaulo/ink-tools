/**
 * The editor view (#226): the lassoed picture on top, every edit switched on in Settings as a
 * button below it, grouped, and «Close». Erase and Crop turn the picture into a pen canvas. A pen
 * move draws nothing, so it costs no refresh (#278); when the pen lifts, Erase shows the picture
 * with that stroke erased and Crop shows the stroke's dots, one refresh per stroke. «Done» keeps
 * the erased strokes and «Crop» runs the crop. No slider and no live preview.
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
import {Button, metrics, Needs, shared} from '@ink-tools/ui-kit';
import type {PenPoint} from '@ink-tools/sn-adapter/official';
import {copy} from './copy';
import {EDITOR_GROUPS, EditorState} from './editor';
import {EditDefinition, editOf, enabledEdits, RetouchSettings} from './edits';
import {sizeOf} from './edit';

/** A drawn point joins its stroke only this far, in view pixels, from the last: one per refresh. */
const MIN_STEP = 6;
/** The side of a drawn dot, in view pixels. */
const DOT = 6;
/**
 * The least height the picture keeps, as a share of the screen: the edit list takes the height it
 * needs first, so every button shows above «Close» when it fits, and scrolls past this (#279).
 */
const PICTURE_FLOOR = '30%';

export type EditorProps = {
  state: EditorState;
  settings: RetouchSettings;
  onEdit: (edit: EditDefinition) => void;
  /** Crop's confirm. */
  onApply: (edit: EditDefinition) => void;
  /** A stroke drawn on the picture, in page pixels, when the pen lifts. */
  onMark: (points: PenPoint[]) => void;
  onClear: () => void;
  /** Erase's «Undo»: the last stroke goes (#278). */
  onUndoStroke: () => void;
  /** Erase's «Done»: the erased strokes go on the page (#278). */
  onDone: () => void;
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
  onUndoStroke,
  onDone,
  onCancel,
  onClose,
}: EditorProps): React.JSX.Element {
  const [box, setBox] = useState<Box | null>(null);
  // The stroke being drawn lives outside React state: a move renders nothing (#278).
  const stroke = useRef<PenPoint[]>([]);
  if (state.phase === 'needs') {
    return (
      <Needs
        problem={{
          what: copy['needs.lasso'],
          reason: copy['needs.lassoReason'],
          fix: {steps: [...copy['needs.lassoSteps']]},
        }}
        onClose={onClose}
      />
    );
  }
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
  };
  const move = (event: GestureResponderEvent) => {
    const point = at(event);
    const last = stroke.current[stroke.current.length - 1];
    if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= MIN_STEP) {
      stroke.current.push(point);
    }
  };
  const end = () => {
    if (stroke.current.length > 0) {
      onMark(stroke.current.map(toPage));
    }
    stroke.current = [];
  };
  const erasing = state.draw === 'erase';
  // Erase shows its strokes erased in the picture, never as dots; Crop shows its marks' dots.
  const dots = erasing ? [] : state.marks.map(mark => mark.map(toView));
  const picturePath = state.strokes[state.strokes.length - 1] ?? state.preview;
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
              source={{uri: `file://${picturePath}`}}
              resizeMode="stretch"
              // Android fades a new picture in over 300 ms: refreshes on e-ink (brief 8.4).
              fadeDuration={0}
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
      {erasing ? (
        <>
          <View style={shared.buttons}>
            <Button
              label={copy['editor.done']}
              primary
              disabled={state.busy !== null}
              onPress={onDone}
            />
            <Button
              label={copy['editor.undoStroke']}
              disabled={state.busy !== null || state.marks.length === 0}
              onPress={onUndoStroke}
            />
            <Button
              label={copy['editor.cancel']}
              disabled={state.busy !== null}
              onPress={onCancel}
            />
          </View>
          {/* Undo waits for a stroke: say why (interface rule 16, #233), on a line that stays
              when empty, so the first stroke moves nothing (#278). */}
          <Text style={[shared.hint, styles.hintLine]}>
            {state.busy === null && state.marks.length === 0
              ? copy['editor.noStrokes']
              : ''}
          </Text>
        </>
      ) : state.draw !== null ? (
        <>
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
          {/* The edit and Clear marks wait for a mark: say why (interface rule 16, #233), on a
              line that stays when empty, so the first mark moves nothing (#278). */}
          <Text style={[shared.hint, styles.hintLine]}>
            {state.busy === null && state.marks.length === 0
              ? copy['editor.noMarks'](editOf(state.draw).name)
              : ''}
          </Text>
        </>
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
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: PICTURE_FLOOR,
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
  hintLine: {
    lineHeight: metrics.statusLineHeight,
    minHeight: metrics.statusLineHeight,
  },
  // Its own height first, shrinking to scroll only past the picture's floor (#279).
  edits: {flexGrow: 0, flexShrink: 1, alignSelf: 'stretch'},
  groups: {gap: metrics.sectionGap},
  group: {gap: metrics.controlGap},
});
