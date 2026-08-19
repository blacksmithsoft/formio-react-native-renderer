// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * A column's span, out of 12 — docs/SPEC.md §8.
 *
 * The authored width is honoured at every container width, matching `form/columnLayout.ts`. The
 * two renderers previously disagreed: this one collapsed at a fixed 1024dp and paired narrow
 * columns two-per-row, while the editable one followed the author's Bootstrap breakpoint. Both
 * now reproduce the schema exactly, so a summary and its form put the same fields on the same
 * row.
 */
export function resolveColumnSpan(width: number, grid: { columns: number }): number {
  return Math.max(1, Math.min(Math.round(width), grid.columns));
}
