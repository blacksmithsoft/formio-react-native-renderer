// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import { useFormioTheme } from './FormioThemeProvider';
import type { FormioTheme } from './FormioTheme';

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };
/** Mirrors `StyleSheet.create`'s own second constraint, which is what narrows style literals. */
type AnyNamedStyles = { [name: string]: ViewStyle | TextStyle | ImageStyle };

/**
 * Build a stylesheet from theme tokens once per theme.
 *
 * `StyleSheet.create` cannot run at module scope here because every value in it comes from a
 * theme the host owns. Caching on the theme object keeps that from costing a rebuild on every
 * render; the cache is weak, so a discarded theme takes its stylesheets with it.
 */
export function createStyles<T extends NamedStyles<T> | AnyNamedStyles>(
  factory: (theme: FormioTheme) => T & AnyNamedStyles
): () => T {
  const cache = new WeakMap<FormioTheme, T>();

  return function useStyles(): T {
    const theme = useFormioTheme();
    const cached = cache.get(theme);
    if (cached) return cached;
    const styles = StyleSheet.create(factory(theme));
    cache.set(theme, styles);
    return styles;
  };
}
