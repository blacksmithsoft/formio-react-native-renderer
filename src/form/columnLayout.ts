// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * Column collapse for the editable renderer — docs/FORMS.md §8.
 *
 * Form.io's `columns` component already carries grid semantics: each column has a 12-unit
 * `width` and a `size`, and `size: "md"` means "these widths apply at md and above". Below that,
 * Bootstrap stacks. A phone is just a narrow browser window, so honouring the author's own
 * breakpoint gives parity for free and matches what they see when they narrow the browser.
 *
 * Two things are worth stating plainly.
 *
 * **This is not the rule the read-only renderer uses.** `render/columnSpan.ts` collapses at a
 * fixed 1024dp with a pairing heuristic — a rule invented before the `size` property was being
 * read. The two are recorded as a divergence in `docs/SPEC.md` rather than quietly unified,
 * because reconciling them is a behavioural change that has to land on both platforms at once.
 *
 * **The width is the container's, never the window's.** A form can sit in a modal, a padded
 * card or a tablet split view, and `Dimensions.get('window')` is wrong in all three.
 */

/** Bootstrap 5's breakpoints, in dp. */
export const BREAKPOINTS = { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200 } as const;

export type BreakpointName = keyof typeof BREAKPOINTS;

/**
 * The span a column takes, out of 12.
 *
 * `containerWidth` is `undefined` until the first layout pass. Assuming narrow there is right
 * for every phone and costs a wide layout a single frame of stacked columns — the opposite
 * assumption costs every phone a frame of unreadably narrow ones.
 */
export function resolveFormColumnSpan(
  width: number,
  size: BreakpointName,
  containerWidth: number | undefined,
  columns = 12
): number {
  const span = Math.max(1, Math.min(Math.round(width), columns));
  if (containerWidth === undefined) return columns;
  return containerWidth < BREAKPOINTS[size] ? columns : span;
}
