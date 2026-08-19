// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import type { ComponentType } from 'react';
import type { TextStyle } from 'react-native';

/**
 * The token contract — docs/THEMING.md.
 *
 * The renderer contains no literal colours or dimensions; every one comes from here. A host maps
 * its own palette onto these tokens once, at the root, which is the difference between a library
 * and a folder somebody copied.
 */

export interface FormioColors {
  brand: { primary: string };
  surface: { card: string; input: string; muted: string; washAlt: string };
  border: { strong: string; default: string };
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
    placeholder: string;
    inverse: string;
  };
  status: { danger: string; warning: string };
  /**
   * The notices drawn in place of, or above, a component the renderer could not honour —
   * docs/FORMS.md §6. Two severities, because "this is degraded" and "this form cannot be sent"
   * are different messages and must not look the same.
   */
  banner: {
    warningSurface: string;
    warningBorder: string;
    warningText: string;
    dangerSurface: string;
    dangerBorder: string;
    dangerText: string;
  };
  misc: { signaturePad: string };
}

export type FormioFontWeight = TextStyle['fontWeight'];

export interface FormioMetrics {
  control: {
    minHeight: number;
    textareaMinHeight: number;
    radius: number;
    borderWidth: number;
    padX: number;
    padY: number;
    gap: number;
    fontSize: number;
    lineHeight: number;
    iconSize: number;
  };
  label: {
    fontSize: number;
    fontWeight: FormioFontWeight;
    gap: number;
    minWidth: number;
    gutter: number;
    /** Top padding that aligns a left label with the control's first line. */
    baselineOffset: number;
  };
  description: { fontSize: number; gap: number };
  panel: {
    radius: number;
    padding: number;
    gap: number;
    titleFontSize: number;
    titleFontWeight: FormioFontWeight;
    titleGap: number;
  };
  grid: {
    columns: number;
    /** Total space between columns; half is applied to each side. */
    gutter: number;
    /** Width available to the renderer below which columns collapse — docs/SPEC.md §8. */
    breakpoint: number;
  };
  field: { gap: number };
  tick: { size: number; radius: number; glyphSize: number; dotSize: number };
  option: { fontSize: number; gap: number; rowGap: number; inlineGap: number };
  subLabel: { fontSize: number; gap: number };
  day: { gap: number };
  tag: { radius: number; padX: number; padY: number; fontSize: number; gap: number };
  survey: {
    questionFlex: number;
    valueFlex: number;
    cellPadX: number;
    valuePadX: number;
    cellPadY: number;
    headerFontSize: number;
    headerFontWeight: FormioFontWeight;
  };
  signature: { height: number; captionFontSize: number; captionGap: number };
  /**
   * Tokens used only by the editable renderer. Grouped separately so a host that embeds only the
   * read-only viewer has nothing extra to map.
   */
  form: {
    errorFontSize: number;
    errorGap: number;
    /** Minimum tappable edge. Below roughly this, a gloved hand misses — docs/FORMS.md §8. */
    touchTarget: number;
    buttonHeight: number;
    buttonRadius: number;
    buttonPadX: number;
    buttonFontSize: number;
    buttonFontWeight: FormioFontWeight;
    actionGap: number;
    tabPadX: number;
    tabPadY: number;
    tabFontSize: number;
    tabGap: number;
    /** A datagrid row, an edit-grid entry, a file row. */
    rowGap: number;
    rowPadding: number;
    rowRadius: number;
    chipRadius: number;
  };
  banner: {
    radius: number;
    padding: number;
    gap: number;
    fontSize: number;
    titleFontWeight: FormioFontWeight;
  };
}

export interface FormioIconProps {
  size: number;
  color: string;
}

export type FormioIcon = ComponentType<FormioIconProps>;

/**
 * Four slots, injected rather than imported. A general-purpose package cannot depend on
 * `@expo/vector-icons`, and four icons is a small enough surface for both platforms to match.
 */
export interface FormioIcons {
  check: FormioIcon;
  chevronDown: FormioIcon;
  calendar: FormioIcon;
  clock: FormioIcon;
}

export interface FormioTheme {
  colors: FormioColors;
  metrics: FormioMetrics;
  icons: FormioIcons;
}

type PartialGroups<T> = { [K in keyof T]?: Partial<T[K]> };

/** What a host supplies: any subset of tokens, merged over the defaults. */
export interface PartialFormioTheme {
  colors?: PartialGroups<FormioColors>;
  metrics?: PartialGroups<FormioMetrics>;
  icons?: Partial<FormioIcons>;
}
