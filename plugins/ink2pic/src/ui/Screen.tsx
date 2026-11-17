/** The outer view of every screen: paper, the screen padding and the gap between its parts (#53). */
import React from 'react';
import {View} from 'react-native';
import {shared} from '@ink-tools/ui-kit';

export function Screen({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return <View style={shared.screen}>{children}</View>;
}
