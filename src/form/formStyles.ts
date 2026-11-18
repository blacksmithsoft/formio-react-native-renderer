// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { createStyles } from '../theme/createStyles';

/**
 * Every style the editable layer uses, in one themed stylesheet.
 *
 * Same reasoning as `render/controls/controlStyles.ts`: the controls share a box, a row and an
 * error line, and splitting the sheet per file would mean rebuilding those in a dozen places and
 * letting them drift. No literal colours or dimensions — everything comes from the theme.
 */
export const useFormStyles = createStyles(({ colors, metrics }) => ({
  field: {
    marginBottom: metrics.field.gap,
  },
  /**
   * Host InfoField-style rows already include their own 4px gap. Applying `field.gap` (16)
   * on top of that stretches a compact label/value list into empty vertical space.
   */
  compactField: {
    marginBottom: 0,
  },
  leftLabelRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: metrics.field.gap,
  },
  leftLabel: {
    minWidth: metrics.label.minWidth,
    marginEnd: metrics.label.gutter,
    paddingTop: metrics.label.baselineOffset,
  },
  leftControl: {
    flex: 1,
  },
  label: {
    fontSize: metrics.label.fontSize,
    fontWeight: metrics.label.fontWeight,
    color: colors.text.secondary,
  },
  requiredMark: {
    color: colors.status.danger,
  },
  controlSpacing: {
    marginTop: metrics.label.gap,
  },
  description: {
    marginTop: metrics.description.gap,
    fontSize: metrics.description.fontSize,
    color: colors.text.tertiary,
  },
  error: {
    marginTop: metrics.form.errorGap,
    fontSize: metrics.form.errorFontSize,
    color: colors.status.danger,
  },

  input: {
    minHeight: metrics.control.minHeight,
    borderWidth: metrics.control.borderWidth,
    borderColor: colors.border.strong,
    borderRadius: metrics.control.radius,
    backgroundColor: colors.surface.card,
    paddingHorizontal: metrics.control.padX,
    paddingVertical: metrics.control.padY,
    fontSize: metrics.control.fontSize,
    lineHeight: metrics.control.lineHeight,
    color: colors.text.primary,
  },
  inputMultiline: {
    minHeight: metrics.control.textareaMinHeight,
    textAlignVertical: 'top',
  },
  inputFocused: {
    borderColor: colors.brand.primary,
  },
  inputInvalid: {
    borderColor: colors.status.danger,
  },
  inputDisabled: {
    backgroundColor: colors.surface.input,
    borderColor: colors.border.default,
    color: colors.text.tertiary,
  },
  /** The input plus its addons. The box moves out to this row when a prefix or suffix exists. */
  affixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: metrics.control.gap,
    borderWidth: metrics.control.borderWidth,
    borderColor: colors.border.strong,
    borderRadius: metrics.control.radius,
    backgroundColor: colors.surface.card,
    paddingHorizontal: metrics.control.padX,
  },
  affixInput: {
    flex: 1,
    minHeight: metrics.control.minHeight,
    paddingVertical: metrics.control.padY,
    fontSize: metrics.control.fontSize,
    color: colors.text.primary,
  },
  affix: {
    fontSize: metrics.control.fontSize,
    color: colors.text.secondary,
  },

  pressableControl: {
    minHeight: metrics.control.minHeight,
    borderWidth: metrics.control.borderWidth,
    borderColor: colors.border.strong,
    borderRadius: metrics.control.radius,
    backgroundColor: colors.surface.card,
    paddingHorizontal: metrics.control.padX,
    paddingVertical: metrics.control.padY,
    flexDirection: 'row',
    alignItems: 'center',
    gap: metrics.control.gap,
  },
  pressableValue: {
    flex: 1,
    fontSize: metrics.control.fontSize,
    color: colors.text.primary,
  },
  pressablePlaceholder: {
    flex: 1,
    fontSize: metrics.control.fontSize,
    color: colors.text.placeholder,
  },

  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: metrics.option.gap,
    // A radio row is a tap target, not a label. Below this a gloved hand misses it.
    minHeight: metrics.form.touchTarget,
  },
  optionsInline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: metrics.option.inlineGap,
  },
  optionLabel: {
    flexShrink: 1,
    fontSize: metrics.option.fontSize,
    color: colors.text.primary,
  },

  panel: {
    backgroundColor: colors.surface.card,
    borderRadius: metrics.panel.radius,
    padding: metrics.panel.padding,
    borderWidth: metrics.control.borderWidth,
    borderColor: colors.border.default,
    marginBottom: metrics.panel.gap,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: metrics.control.gap,
  },
  panelTitle: {
    flex: 1,
    fontSize: metrics.panel.titleFontSize,
    fontWeight: metrics.panel.titleFontWeight,
    color: colors.text.primary,
  },
  panelBody: {
    marginTop: metrics.panel.titleGap,
  },

  columnsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // Cancels the per-column padding, so the outermost columns stay flush with the surrounding
    // content. Load-bearing: without it the grid is inset by half a gutter.
    marginHorizontal: -metrics.grid.gutter / 2,
  },
  column: {
    paddingHorizontal: metrics.grid.gutter / 2,
  },

  tabBar: {
    flexDirection: 'row',
    gap: metrics.form.tabGap,
    marginBottom: metrics.panel.titleGap,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: metrics.form.errorGap,
    paddingHorizontal: metrics.form.tabPadX,
    paddingVertical: metrics.form.tabPadY,
    borderRadius: metrics.control.radius,
    backgroundColor: colors.surface.washAlt,
  },
  tabSelected: {
    backgroundColor: colors.brand.primary,
  },
  tabLabel: {
    fontSize: metrics.form.tabFontSize,
    color: colors.text.secondary,
  },
  tabLabelSelected: {
    color: colors.text.inverse,
  },
  /** A dot, not a number: a tab with errors inside it is otherwise invisible — docs/FORMS.md §8. */
  tabErrorDot: {
    width: metrics.tick.dotSize,
    height: metrics.tick.dotSize,
    borderRadius: metrics.tick.dotSize / 2,
    backgroundColor: colors.status.danger,
  },

  row: {
    borderWidth: metrics.control.borderWidth,
    borderColor: colors.border.default,
    borderRadius: metrics.form.rowRadius,
    padding: metrics.form.rowPadding,
    marginBottom: metrics.form.rowGap,
    backgroundColor: colors.surface.card,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: metrics.form.rowGap,
  },
  rowTitle: {
    fontSize: metrics.label.fontSize,
    fontWeight: metrics.label.fontWeight,
    color: colors.text.tertiary,
  },

  /** The scroller's own frame: the border stays put while the columns move inside it. */
  gridTable: {
    borderWidth: metrics.control.borderWidth,
    borderColor: colors.border.default,
    borderRadius: metrics.form.rowRadius,
    backgroundColor: colors.surface.card,
    overflow: 'hidden',
  },
  /** A horizontal scroller lays its content out as a row; the table's rows stack. */
  gridTableContent: {
    flexDirection: 'column',
  },
  gridTableRow: {
    flexDirection: 'row',
    borderTopWidth: metrics.control.borderWidth,
    borderTopColor: colors.border.default,
  },
  gridTableHeaderRow: {
    borderTopWidth: 0,
    alignItems: 'center',
    backgroundColor: colors.surface.washAlt,
  },
  /**
   * The width is supplied per table, measured — `flex` cannot be used here. Inside a horizontal
   * scroller the main axis is unbounded, so there is no free space to divide and every flexed
   * column would collapse to the width of whatever happens to be in it.
   */
  gridTableCell: {
    paddingHorizontal: metrics.form.tableCellPadX,
    paddingVertical: metrics.form.tableCellPadY,
  },
  gridTableActionCell: {
    width: metrics.form.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridTableHeaderText: {
    fontSize: metrics.label.fontSize,
    fontWeight: metrics.label.fontWeight,
    color: colors.text.secondary,
  },
  /** A field inside a table cell: the cell owns the spacing, so the field must not add its own. */
  gridTableCellField: {
    marginBottom: 0,
  },
  /** Read-only table cell: plain text instead of a disabled TextInput. */
  gridTableCellText: {
    fontSize: metrics.control.fontSize,
    lineHeight: metrics.control.lineHeight,
    color: colors.text.primary,
  },
  plainValue: {
    fontSize: metrics.control.fontSize,
    lineHeight: metrics.control.lineHeight,
    color: colors.text.primary,
  },

  button: {
    minHeight: metrics.form.buttonHeight,
    borderRadius: metrics.form.buttonRadius,
    paddingHorizontal: metrics.form.buttonPadX,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.primary,
  },
  buttonSecondary: {
    backgroundColor: colors.surface.card,
    borderWidth: metrics.control.borderWidth,
    borderColor: colors.border.strong,
  },
  buttonDisabled: {
    backgroundColor: colors.surface.input,
    borderColor: colors.border.default,
  },
  buttonLabel: {
    fontSize: metrics.form.buttonFontSize,
    fontWeight: metrics.form.buttonFontWeight,
    color: colors.text.inverse,
  },
  buttonLabelSecondary: {
    color: colors.text.primary,
  },
  buttonLabelDisabled: {
    color: colors.text.tertiary,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: metrics.form.actionGap,
    alignItems: 'center',
  },
  submitButton: {
    flex: 1,
  },

  banner: {
    borderRadius: metrics.banner.radius,
    borderWidth: metrics.control.borderWidth,
    padding: metrics.banner.padding,
    marginBottom: metrics.field.gap,
  },
  bannerWarning: {
    backgroundColor: colors.banner.warningSurface,
    borderColor: colors.banner.warningBorder,
  },
  bannerDanger: {
    backgroundColor: colors.banner.dangerSurface,
    borderColor: colors.banner.dangerBorder,
  },
  bannerTitle: {
    fontSize: metrics.banner.fontSize,
    fontWeight: metrics.banner.titleFontWeight,
    marginBottom: metrics.banner.gap,
  },
  bannerText: {
    fontSize: metrics.banner.fontSize,
  },
  bannerWarningText: {
    color: colors.banner.warningText,
  },
  bannerDangerText: {
    color: colors.banner.dangerText,
  },

  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: metrics.tag.gap,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: metrics.tag.gap,
    backgroundColor: colors.surface.muted,
    borderRadius: metrics.form.chipRadius,
    paddingHorizontal: metrics.tag.padX,
    paddingVertical: metrics.tag.padY,
  },
  chipText: {
    fontSize: metrics.tag.fontSize,
    color: colors.text.primary,
  },
  chipRemove: {
    fontSize: metrics.tag.fontSize,
    color: colors.text.tertiary,
  },

  dayRow: {
    flexDirection: 'row',
    gap: metrics.day.gap,
  },
  dayCell: {
    flex: 1,
  },
  subLabel: {
    fontSize: metrics.subLabel.fontSize,
    fontWeight: metrics.label.fontWeight,
    color: colors.text.secondary,
    marginBottom: metrics.subLabel.gap,
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
    justifyContent: 'center',
    minHeight: metrics.form.touchTarget,
    paddingHorizontal: metrics.survey.valuePadX,
  },
  surveyHeaderText: {
    fontSize: metrics.survey.headerFontSize,
    fontWeight: metrics.survey.headerFontWeight,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  surveyQuestionText: {
    fontSize: metrics.control.fontSize,
    color: colors.text.primary,
  },

  signaturePad: {
    height: metrics.signature.height,
    borderRadius: metrics.control.radius,
    borderWidth: metrics.control.borderWidth,
    borderColor: colors.border.default,
    backgroundColor: colors.misc.signaturePad,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
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

  contentText: {
    fontSize: metrics.control.fontSize,
    lineHeight: metrics.control.lineHeight,
    color: colors.text.primary,
    marginBottom: metrics.field.gap,
  },
  htmlBlock: {
    marginBottom: metrics.field.gap,
  },
  /**
   * What authored HTML inherits when it asks for nothing: the theme's body copy. Every other text
   * property comes from the markup, so this sheet must not set one the author might have set.
   */
  htmlText: {
    fontSize: metrics.control.fontSize,
    lineHeight: metrics.control.lineHeight,
    color: colors.text.primary,
  },
  htmlTable: {
    borderWidth: metrics.control.borderWidth,
    borderColor: colors.border.default,
    backgroundColor: colors.surface.card,
    marginBottom: metrics.field.gap,
  },
  htmlTableRow: {
    flexDirection: 'row',
    borderTopWidth: metrics.control.borderWidth,
    borderTopColor: colors.border.default,
  },
  htmlTableFirstRow: {
    borderTopWidth: 0,
  },
  htmlTableCell: {
    paddingHorizontal: metrics.form.tableCellPadX,
    paddingVertical: metrics.form.tableCellPadY,
    borderRightWidth: metrics.control.borderWidth,
    borderRightColor: colors.border.default,
    justifyContent: 'center',
  },
  htmlTableHeaderCell: {
    backgroundColor: colors.surface.washAlt,
  },
  htmlFieldInput: {
    marginBottom: 0,
    minHeight: metrics.control.minHeight,
  },
  htmlRadio: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: metrics.form.touchTarget,
  },
  hint: {
    fontSize: metrics.description.fontSize,
    color: colors.text.tertiary,
  },
  /** Indent a tree node's children so nesting is visible without a second scroller. */
  nestedChildren: {
    paddingStart: metrics.panel.padding,
    marginTop: metrics.form.rowGap,
  },
  mapEntry: {
    gap: metrics.label.gap,
  },
  reviewRow: {
    marginBottom: metrics.form.rowGap,
  },
  reviewValue: {
    marginTop: metrics.label.gap,
    fontSize: metrics.control.fontSize,
    color: colors.text.primary,
  },

  /*
   * The phone layout — docs/FORMS.md §8.
   *
   * Most of a phone form is drawn with the styles above: `panel` is the card, `label` and
   * `input` are the field. They look different on a phone because the theme they are built from
   * is — see `resolvePhoneTheme`. What follows is only what has no wide counterpart.
   */

  /**
   * Every block in a card ends with `field.gap` of bottom margin. This cancels the last one, so
   * the card's padding is the same on all four sides. Load-bearing for the same reason as the
   * negative margin on `columnsRow`.
   */
  phoneCardBody: {
    marginBottom: -metrics.field.gap,
  },
  /** An open card's chevron. The slot is `chevronDown`; open is the same icon turned over. */
  phoneChevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  /**
   * Two fields side by side. Bottom-aligned, so a label that wraps to a second line pushes its
   * own control down rather than leaving the two inputs at different heights.
   */
  phonePair: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    columnGap: metrics.grid.gutter,
  },
  /** `minWidth: 0` lets a long value shrink inside its half instead of pushing the other out. */
  phonePairCell: {
    flex: 1,
    minWidth: 0,
  },
  /** A wrapping tab strip. A phone form never scrolls sideways, tab strips included. */
  tabBarWrap: {
    flexWrap: 'wrap',
    rowGap: metrics.form.tabGap,
  },

  /** A card inside a card: a nested section, a grid row, a table row. */
  phoneSubCard: {
    borderWidth: metrics.control.borderWidth,
    borderColor: colors.border.default,
    borderRadius: metrics.form.rowRadius,
    padding: metrics.form.rowPadding,
    backgroundColor: colors.surface.washAlt,
  },
  /** What every block in a card ends with, for a block that has no field frame to supply it. */
  phoneBlockGap: {
    marginBottom: metrics.field.gap,
  },
  /** Sub-cards that follow one another, spaced by a gap so the last one adds nothing below. */
  phoneStack: {
    gap: metrics.form.rowGap,
    marginBottom: metrics.field.gap,
  },
  phoneSubCardTitle: {
    flex: 1,
    fontSize: metrics.phone.subCardTitleFontSize,
    fontWeight: metrics.panel.titleFontWeight,
    color: colors.text.primary,
  },
  phoneSubCardBody: {
    marginTop: metrics.form.rowGap,
  },

  /** A top-level data grid: a labelled run of record cards rather than one card of fields. */
  phoneSection: {
    marginBottom: metrics.panel.gap,
  },
  phoneSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: metrics.label.gap,
    marginBottom: metrics.form.rowGap,
  },
  phoneSectionLabel: {
    flexShrink: 1,
    fontSize: metrics.label.fontSize,
    fontWeight: metrics.panel.titleFontWeight,
    color: colors.text.tertiary,
    textTransform: 'uppercase',
  },
  phoneBadge: {
    minWidth: metrics.phone.badgeSize,
    height: metrics.phone.badgeSize,
    borderRadius: metrics.phone.badgeSize / 2,
    paddingHorizontal: metrics.phone.badgePadX,
    borderWidth: metrics.control.borderWidth,
    borderColor: colors.border.default,
    backgroundColor: colors.surface.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneBadgeText: {
    fontSize: metrics.phone.captionFontSize,
    fontWeight: metrics.panel.titleFontWeight,
    color: colors.text.secondary,
  },
  /**
   * The record cards of one grid. Each carries a bottom margin so a windowed list can measure
   * a row with its spacing; this cancels the last, and whatever follows adds its own gap back.
   */
  phoneRecordList: {
    marginBottom: -metrics.panel.gap,
  },
  phoneSubRecordList: {
    marginTop: metrics.label.gap,
    marginBottom: -metrics.form.rowGap,
  },
  phoneSubRecord: {
    marginBottom: metrics.form.rowGap,
  },
  phoneRecordHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: metrics.control.gap,
  },
  phoneRecordHeading: {
    flex: 1,
  },
  phoneCaption: {
    fontSize: metrics.phone.captionFontSize,
    color: colors.text.tertiary,
  },
  phoneRecordTitle: {
    fontSize: metrics.control.fontSize,
    fontWeight: metrics.panel.titleFontWeight,
    color: colors.text.primary,
  },
  phoneSubRecordTitle: {
    fontSize: metrics.phone.subCardTitleFontSize,
    fontWeight: metrics.panel.titleFontWeight,
    color: colors.text.primary,
  },
  phoneRecordBody: {
    marginTop: metrics.form.rowGap,
  },
  /** Dashed, because it is where a card will be rather than a card that is. */
  phoneAddButton: {
    minHeight: metrics.form.buttonHeight,
    borderRadius: metrics.form.buttonRadius,
    borderWidth: metrics.control.borderWidth,
    borderStyle: 'dashed',
    borderColor: colors.brand.primary,
    backgroundColor: colors.surface.card,
    paddingHorizontal: metrics.form.buttonPadX,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: metrics.label.gap,
  },
  phoneAddButtonLabel: {
    flexShrink: 1,
    fontSize: metrics.form.buttonFontSize,
    fontWeight: metrics.form.buttonFontWeight,
    color: colors.brand.primary,
  },
  phoneSectionFooter: {
    marginTop: metrics.panel.gap,
  },
  phoneSubRecordFooter: {
    marginTop: metrics.form.rowGap,
  },
  /** An HTML table cell that shares the row instead of holding a fixed width. */
  phoneHtmlTableCell: {
    minWidth: 0,
  },
}));
