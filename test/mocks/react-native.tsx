// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * The slice of `react-native` the renderer touches, as inspectable host components.
 *
 * String element types become host nodes in the test renderer, so a test can find every `Text`
 * or read the style array on a `View` without a native runtime. Interactive components are
 * strings too, which means a test drives them by calling the prop directly —
 * `input.props.onChangeText('x')` — rather than by simulating a gesture. That is the right level
 * for this suite: it exercises the renderer's own logic and leaves gesture handling to the
 * platform, which is not what these tests are about.
 */

export const View = 'View';
export const Text = 'Text';
export const Image = 'Image';
export const TextInput = 'TextInput';
export const Pressable = 'Pressable';
export const ScrollView = 'ScrollView';
export const KeyboardAvoidingView = 'KeyboardAvoidingView';
export const SafeAreaView = 'SafeAreaView';
export const FlatList = 'FlatList';

export const Platform = {
  OS: 'ios' as const,
  select: <T,>(options: { ios?: T; android?: T; default?: T }): T | undefined =>
    options.ios ?? options.default,
};

type Style = Record<string, unknown>;

function flatten(style: unknown): Style {
  if (Array.isArray(style)) {
    return style.reduce<Style>((acc, entry) => Object.assign(acc, flatten(entry)), {});
  }
  if (style && typeof style === 'object') return { ...(style as Style) };
  return {};
}

export const StyleSheet = {
  create: <T extends Record<string, unknown>>(styles: T): T => styles,
  flatten,
  hairlineWidth: 1,
  absoluteFill: {} as Style,
};
