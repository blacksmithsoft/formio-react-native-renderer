// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { createStyles } from '../../theme/createStyles';

/**
 * Every control's styling, in one themed stylesheet.
 *
 * The controls share a box, a mark and a value text style; splitting the sheet per file would
 * mean rebuilding those three in five places and letting them drift apart.
 */
export const useControlStyles = createStyles(({ colors, metrics }) => ({
  control: {
    minHeight: metrics.control.minHeight,
    borderWidth: metrics.control.borderWidth,
    borderColor: colors.border.strong,
    borderRadius: metrics.control.radius,
    backgroundColor: colors.surface.card,
    paddingHorizontal: metrics.control.padX,
    paddingVertical: metrics.control.padY,
    justifyContent: 'center',
  },
  controlDisabled: {
    backgroundColor: colors.surface.input,
    borderColor: colors.border.default,
  },
  controlTextarea: {
    minHeight: metrics.control.textareaMinHeight,
    justifyContent: 'flex-start',
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: metrics.control.gap,
  },
  controlValue: {
    flex: 1,
  },
  controlText: {
    fontSize: metrics.control.fontSize,
    lineHeight: metrics.control.lineHeight,
    color: colors.text.primary,
  },
  controlEmpty: {
    fontSize: metrics.control.fontSize,
    color: colors.text.placeholder,
  },
  affix: {
    fontSize: metrics.control.fontSize,
    color: colors.text.secondary,
  },
  subLabel: {
    fontSize: metrics.subLabel.fontSize,
    // No weight token of its own; a day sub-label is a label and reads as one.
    fontWeight: metrics.label.fontWeight,
    color: colors.text.secondary,
    marginBottom: metrics.subLabel.gap,
  },
  dayRow: {
    flexDirection: 'row',
    gap: metrics.day.gap,
  },
  dayCell: {
    flex: 1,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: metrics.option.gap,
    marginBottom: metrics.option.rowGap,
  },
  optionsInline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: metrics.option.inlineGap,
  },
  optionLabel: {
    fontSize: metrics.option.fontSize,
    color: colors.text.primary,
  },
  tick: {
    width: metrics.tick.size,
    height: metrics.tick.size,
    borderRadius: metrics.tick.radius,
    borderWidth: metrics.control.borderWidth,
    borderColor: colors.border.strong,
    backgroundColor: colors.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickRadio: {
    borderRadius: metrics.tick.size / 2,
  },
  tickChecked: {
    borderColor: colors.brand.primary,
    backgroundColor: colors.brand.primary,
  },
  radioDot: {
    width: metrics.tick.dotSize,
    height: metrics.tick.dotSize,
    borderRadius: metrics.tick.dotSize / 2,
    backgroundColor: colors.text.inverse,
  },
  tagsBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: metrics.tag.gap,
  },
  tag: {
    backgroundColor: colors.surface.muted,
    borderRadius: metrics.tag.radius,
    paddingHorizontal: metrics.tag.padX,
    paddingVertical: metrics.tag.padY,
  },
  tagText: {
    fontSize: metrics.tag.fontSize,
    color: colors.text.primary,
  },
  surveyTable: {
    borderWidth: metrics.control.borderWidth,
    borderColor: colors.border.default,
    borderRadius: metrics.control.radius,
    overflow: 'hidden',
  },
  surveyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: metrics.control.borderWidth,
    borderTopColor: colors.border.default,
  },
  surveyHeaderRow: {
    borderTopWidth: 0,
    backgroundColor: colors.surface.washAlt,
  },
  surveyQuestionCell: {
    flex: metrics.survey.questionFlex,
    paddingHorizontal: metrics.survey.cellPadX,
    paddingVertical: metrics.survey.cellPadY,
  },
  surveyValueCell: {
    flex: metrics.survey.valueFlex,
    alignItems: 'center',
    paddingHorizontal: metrics.survey.valuePadX,
    paddingVertical: metrics.survey.cellPadY,
  },
  surveyHeaderText: {
    fontSize: metrics.survey.headerFontSize,
    fontWeight: metrics.survey.headerFontWeight,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  signaturePad: {
    height: metrics.signature.height,
    borderRadius: metrics.control.radius,
    borderWidth: metrics.control.borderWidth,
    borderColor: colors.border.default,
    backgroundColor: colors.misc.signaturePad,
    overflow: 'hidden',
  },
  signatureImage: {
    width: '100%',
    height: '100%',
  },
  signatureCaption: {
    marginTop: metrics.signature.captionGap,
    fontSize: metrics.signature.captionFontSize,
    color: colors.text.tertiary,
    textAlign: 'center',
  },
}));
