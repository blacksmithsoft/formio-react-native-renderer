// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { defaultFormioTheme } from './defaultTheme';
import { mergeTheme } from './mergeTheme';
import type { FormioTheme, PartialFormioTheme } from './FormioTheme';

const FormioThemeContext = createContext<FormioTheme>(defaultFormioTheme);

/** The resolved theme. Falls back to the defaults when no provider is mounted. */
export function useFormioTheme(): FormioTheme {
  return useContext(FormioThemeContext);
}

export interface FormioThemeProviderProps {
  /** Any subset of tokens; the rest fall back to `defaultFormioTheme`. */
  theme?: PartialFormioTheme;
  children?: ReactNode;
}

/**
 * Wrap the renderer once, near the root of the screen.
 *
 * Hold the `theme` object still across renders — a fresh literal on every render re-merges the
 * tokens and rebuilds every stylesheet underneath.
 */
export function FormioThemeProvider({ theme, children }: FormioThemeProviderProps) {
  const value = useMemo(() => mergeTheme(defaultFormioTheme, theme), [theme]);
  return <FormioThemeContext.Provider value={value}>{children}</FormioThemeContext.Provider>;
}
