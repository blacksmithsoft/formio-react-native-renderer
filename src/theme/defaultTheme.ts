// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import type {
  FormioColors,
  FormioMetricOverrides,
  FormioMetrics,
  FormioTheme,
} from './FormioTheme';
import { defaultFormioIcons } from './icons';

/**
 * The defaults from docs/THEMING.md. Colours reproduce Form.io's Bootstrap 5 appearance, so an
 * unthemed renderer looks like the web renderer; metrics are the ones the Vise Mobile renderer
 * ships today, so the extraction is invisible to its first consumer.
 *
 * Every colour is fully opaque: translucency composites differently across platforms and would
 * break golden-image comparison for no benefit.
 */

const defaultColors: FormioColors = {
  brand: { primary: '#0D6EFD' },
  surface: { card: '#FFFFFF', input: '#E9ECEF', muted: '#F1F3F5', washAlt: '#F8F9FA' },
  border: { strong: '#CED4DA', default: '#DEE2E6' },
  text: {
    primary: '#212529',
    secondary: '#495057',
    tertiary: '#6C757D',
    placeholder: '#ADB5BD',
    inverse: '#FFFFFF',
  },
  status: { danger: '#DC3545', warning: '#FFC107' },
  // Bootstrap 5's own alert palette, so a notice reads the way it does in the builder preview.
  banner: {
    warningSurface: '#FFF3CD',
    warningBorder: '#FFE69C',
    warningText: '#664D03',
    dangerSurface: '#F8D7DA',
    dangerBorder: '#F1AEB5',
    dangerText: '#842029',
  },
  // Form.io's own signature canvas colour. Themeable, but hosts should leave it alone.
  misc: { signaturePad: '#F5F5EB' },
};

const defaultMetrics: FormioMetrics = {
  control: {
    minHeight: 38,
    textareaMinHeight: 84,
    radius: 6,
    borderWidth: 1,
    padX: 12,
    padY: 8,
    gap: 8,
    fontSize: 15,
    lineHeight: 21,
    iconSize: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    gap: 6,
    minWidth: 100,
    gutter: 12,
    // control.padY plus one. A token rather than a formula because the two platforms round text
    // metrics differently, and a shared constant is easier to keep matched.
    baselineOffset: 9,
  },
  description: { fontSize: 12, gap: 4 },
  panel: {
    // A larger radius than the controls' 6 keeps the nesting readable at the corners.
    radius: 8,
    padding: 20,
    gap: 16,
    titleFontSize: 16,
    titleFontWeight: '700',
    titleGap: 20,
  },
  grid: { columns: 12, gutter: 12, breakpoint: 1024 },
  field: { gap: 16 },
  tick: { size: 18, radius: 3, glyphSize: 12, dotSize: 7 },
  option: { fontSize: 15, gap: 8, rowGap: 8, inlineGap: 20 },
  subLabel: { fontSize: 13, gap: 6 },
  day: { gap: 12 },
  tag: { radius: 4, padX: 8, padY: 3, fontSize: 13, gap: 6 },
  survey: {
    questionFlex: 2,
    valueFlex: 1,
    cellPadX: 10,
    valuePadX: 6,
    cellPadY: 8,
    headerFontSize: 13,
    headerFontWeight: '600',
  },
  signature: { height: 140, captionFontSize: 13, captionGap: 4 },
  form: {
    errorFontSize: 12,
    errorGap: 4,
    // 44 is the smallest edge both platform guidelines agree on, and the field case — a gloved
    // hand on a phone in daylight — is the one that actually sets it.
    touchTarget: 44,
    buttonHeight: 44,
    buttonRadius: 6,
    buttonPadX: 16,
    buttonFontSize: 15,
    buttonFontWeight: '600',
    actionGap: 8,
    tabPadX: 14,
    tabPadY: 10,
    tabFontSize: 14,
    tabGap: 4,
    rowGap: 12,
    rowPadding: 12,
    rowRadius: 6,
    chipRadius: 4,
    // Roughly a five-character number plus its padding. Two columns fill a phone, three overflow
    // it slightly, and a wide table scrolls rather than shrinking past legibility.
    tableMinColumnWidth: 128,
    tableCellPadX: 8,
    tableCellPadY: 8,
    htmlImageHeight: 80,
  },
  banner: { radius: 6, padding: 12, gap: 6, fontSize: 13, titleFontWeight: '600' },
  phone: {
    // Phones in portrait sit well under this and the narrowest tablet pane sits over it: 600dp
    // is the shortest side at which both platforms start calling a device a tablet.
    breakpoint: 600,
    cardIconSize: 20,
    actionIconSize: 18,
    captionFontSize: 11,
    subCardTitleFontSize: 13,
    badgeSize: 20,
    badgePadX: 6,
  },
};

/**
 * What changes on a phone. A phone form is denser than a tablet one — a 40dp control under a
 * 12dp label, cards with 14dp of padding — and the cards are rounder because there are more of
 * them on screen at once. Anything not listed keeps its value from `defaultMetrics`.
 */
const defaultPhoneMetrics: FormioMetricOverrides = {
  control: { minHeight: 40, radius: 8, fontSize: 14, lineHeight: 20, iconSize: 18 },
  label: { fontSize: 12, fontWeight: '400' },
  panel: {
    radius: 12,
    padding: 14,
    gap: 12,
    titleFontSize: 15,
    titleFontWeight: '600',
    titleGap: 14,
  },
  field: { gap: 14 },
  tick: { size: 20, radius: 4, glyphSize: 14, dotSize: 8 },
  option: { fontSize: 14, rowGap: 10 },
  signature: { height: 110 },
  form: { buttonRadius: 10, buttonFontSize: 14, rowRadius: 10, rowGap: 10 },
};

export const defaultFormioTheme: FormioTheme = {
  colors: defaultColors,
  metrics: defaultMetrics,
  phoneMetrics: defaultPhoneMetrics,
  icons: defaultFormioIcons,
};
