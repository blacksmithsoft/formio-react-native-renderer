// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * Strip the branded prefix off backend variants (`custom_radio`, `custom_select`, …), which
 * behave and render exactly like the stock component they wrap.
 *
 * Every type test in the parser and the renderer goes through this. Matching a raw type is the
 * bug behind SPEC.md §9 gaps 1 and 2.
 */
export function baseFieldType(type: string): string {
  return type.replace(/^custom_/, '');
}
