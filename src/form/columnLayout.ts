// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * Column spans for the editable renderer — docs/FORMS.md §8.
 *
 * Form.io's `columns` component carries 12-unit grid semantics, and the renderer reproduces them
 * exactly: a `width: 3` column is a quarter of the row on every device. A form authored as four
 * across is four across, because a layout that rearranges itself between the builder preview and
 * the phone is a layout nobody can design against.
 *
 * The `size` property is still parsed and still travels with the schema, but it no longer gates
 * anything. Bootstrap would stack below that breakpoint; this renderer does not, and the cost is
 * real — four columns on a 390dp phone leave roughly 67dp of input each, and long labels wrap
 * hard. That trade is deliberate, and the same rule now applies in `render/columnSpan.ts`, so
 * the read-only and editable renderers agree.
 *
 * Widths that overrun the 12-unit row still wrap, which is what Bootstrap does too.
 */

/** Bootstrap 5's breakpoints, in dp. Retained because `FormColumn.size` is typed against it. */
export const BREAKPOINTS = { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200 } as const;

export type BreakpointName = keyof typeof BREAKPOINTS;

/** The span a column takes, out of 12 — the authored width, clamped to the row. */
export function resolveFormColumnSpan(width: number, columns = 12): number {
  return Math.max(1, Math.min(Math.round(width), columns));
}
