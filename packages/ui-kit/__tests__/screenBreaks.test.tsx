/** The size rule catches small text and small buttons, and passes the shared Button (#93). */
import React from 'react';
import {Pressable, Text, View} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {Button, metrics, shared} from '../src';
import {screenBreaks} from '../src/screenBreaks';

function breaks(element: React.JSX.Element) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(element);
  });
  return screenBreaks(tree.root);
}

describe('screenBreaks (#93)', () => {
  it('passes a screen built from the tokens', () => {
    expect(
      breaks(
        <View style={shared.screen}>
          <Text style={shared.textLarge}>
            Title <Text>inherits its size</Text>
          </Text>
          <Button label="OK" onPress={() => {}} />
        </View>,
      ),
    ).toEqual([]);
  });

  it('fails a text under the minimum font size', () => {
    expect(breaks(<Text style={{fontSize: metrics.minFont - 1}}>Small</Text>)).toEqual([
      `text «Small» is ${metrics.minFont - 1} units, under ${metrics.minFont}`,
    ]);
  });

  it('fails a text with no font size, which would fall back to the platform default', () => {
    expect(breaks(<Text>Bare</Text>)).toEqual(['text «Bare» has no font size from the tokens']);
  });

  it('fails a button under the touch target', () => {
    const small = metrics.touchTarget - 1;
    expect(
      breaks(
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tiny"
          style={{width: small, height: small}}
          onPress={() => {}}>
          <Text style={shared.text}>x</Text>
        </Pressable>,
      ),
    ).toEqual([`button «Tiny» is ${small} x ${small} units, under ${metrics.touchTarget}`]);
  });
});
