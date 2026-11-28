/**
 * The one way a view shows a picture (#576): the frame takes the space its parent gives it, then
 * draws the picture at its own proportions, as large as fits, centred on both axes. A picture
 * sized by `aspectRatio` beside `flex` lands at the leading edge on the device, whose layout
 * engine does not stretch it, with the free space all on one side; the frame sets the picture's
 * width and height from its own measured box instead, so the gaps on opposite sides are equal.
 */
import React, {useState} from 'react';
import {Image, LayoutChangeEvent, StyleSheet, View} from 'react-native';

/** The `nativeID` of the frame and of its picture, which the render rules find them by (#576). */
export const MEDIA_FRAME_ID = 'media-frame';
export const MEDIA_ID = 'media';

export type MediaFrameProps = {
  /** The picture, such as a `data:image/png;base64,…` URI. */
  uri: string;
  /** The picture's own size, in any unit: only its proportions count. */
  width: number;
  height: number;
  /** What the picture shows, for a screen reader. */
  accessibilityLabel: string;
};

type Size = {width: number; height: number};

/** The largest size of `picture` that fits `box` at its own proportions. */
export function fitSize(picture: Size, box: Size): Size {
  if (picture.width <= 0 || picture.height <= 0) {
    return {width: 0, height: 0};
  }
  const scale = Math.min(box.width / picture.width, box.height / picture.height);
  return {width: picture.width * scale, height: picture.height * scale};
}

export function MediaFrame({uri, width, height, accessibilityLabel}: MediaFrameProps): React.JSX.Element {
  // Nothing is drawn before the frame knows its box: a picture drawn at a guessed size would flash
  // on the e-ink screen before it moved.
  const [box, setBox] = useState<Size | null>(null);
  const onLayout = (event: LayoutChangeEvent) => {
    const {width: boxWidth, height: boxHeight} = event.nativeEvent.layout;
    setBox(current =>
      current && current.width === boxWidth && current.height === boxHeight ? current : {width: boxWidth, height: boxHeight},
    );
  };
  const size = box ? fitSize({width, height}, box) : null;
  return (
    <View nativeID={MEDIA_FRAME_ID} testID={MEDIA_FRAME_ID} style={styles.frame} onLayout={onLayout}>
      {size && (
        <Image
          nativeID={MEDIA_ID}
          source={{uri}}
          style={size}
          resizeMode="contain"
          fadeDuration={0}
          accessibilityLabel={accessibilityLabel}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {flex: 1, alignSelf: 'stretch', justifyContent: 'center', alignItems: 'center'},
});
