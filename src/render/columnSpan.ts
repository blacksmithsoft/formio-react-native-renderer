// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * Resolve a column's span against the width available to the renderer — docs/SPEC.md §8.
 *
 * The measurement is of the container, not the screen: a form in a tablet sidebar collapses
 * according to the space it actually occupies.
 *
 * `availableWidth` is `undefined` until the first layout pass. Assume narrow there, since that
 * is right for every phone and costs a wide layout one frame of collapsed columns.
 */
export function resolveColumnSpan(
  width: number,
  availableWidth: number | undefined,
  grid: { columns: number; breakpoint: number }
): number {
  if (availableWidth !== undefined && availableWidth >= grid.breakpoint) {
    return Math.min(width, grid.columns);
  }
  // A column authored at a third of a row or less pairs up two-per-row when space is tight;
  // anything wider takes the row. Four quarter-width fields become two rows of two, which stays
  // scannable, rather than four 90dp columns, which does not.
  return width <= grid.columns / 3 ? Math.round(grid.columns / 2) : grid.columns;
}
