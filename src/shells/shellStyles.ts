// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { createStyles } from '../theme/createStyles';

/** Shell chrome: the screen frame, the scroll padding and the pinned action bar. */
export const useShellStyles = createStyles(({ colors, metrics }) => ({
  screen: {
    flex: 1,
    backgroundColor: colors.surface.washAlt,
  },
  fill: {
    flex: 1,
  },
  content: {
    padding: metrics.panel.gap,
    // Room below the last field so it clears the pinned action bar when scrolled to the bottom.
    paddingBottom: metrics.form.buttonHeight + metrics.panel.gap * 2,
  },
  actionBar: {
    borderTopWidth: metrics.control.borderWidth,
    borderTopColor: colors.border.default,
    backgroundColor: colors.surface.card,
    paddingHorizontal: metrics.panel.gap,
    paddingVertical: metrics.form.actionGap,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: metrics.form.actionGap,
    marginBottom: metrics.panel.gap,
  },
  progressTrack: {
    flex: 1,
    height: metrics.control.borderWidth * 4,
    borderRadius: metrics.control.borderWidth * 2,
    backgroundColor: colors.surface.input,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.brand.primary,
  },
  progressLabel: {
    fontSize: metrics.label.fontSize,
    fontWeight: metrics.label.fontWeight,
    color: colors.text.secondary,
  },
  pageTitle: {
    fontSize: metrics.panel.titleFontSize,
    fontWeight: metrics.panel.titleFontWeight,
    color: colors.text.primary,
    marginBottom: metrics.panel.titleGap,
  },
}));
