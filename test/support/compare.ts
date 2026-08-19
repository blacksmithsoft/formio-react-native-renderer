// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * Comparison helpers for the conformance suite.
 *
 * A failure has to name the path that differs — `[2].field.labelWidth`, not "trees differ" —
 * or a fixture diff on a hundred-node tree is unreadable.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Serialise the parser output the way the fixtures are written: absent optional properties are
 * omitted rather than emitted as null, which is exactly what `JSON.stringify` does with
 * `undefined`.
 */
export function toComparable(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function describe(value: unknown): string {
  return value === undefined ? 'undefined' : JSON.stringify(value);
}

/** The first path at which `actual` and `expected` differ, or `null` when they match. */
export function firstDifference(actual: unknown, expected: unknown, path = ''): string | null {
  const here = path || '$';

  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(actual) || !Array.isArray(expected)) {
      return `${here}: ${describe(actual)} != ${describe(expected)}`;
    }
    if (actual.length !== expected.length) {
      return `${here}.length: ${actual.length} != ${expected.length}`;
    }
    for (let index = 0; index < expected.length; index += 1) {
      const diff = firstDifference(actual[index], expected[index], `${path}[${index}]`);
      if (diff) return diff;
    }
    return null;
  }

  if (isPlainObject(expected) || isPlainObject(actual)) {
    if (!isPlainObject(actual) || !isPlainObject(expected)) {
      return `${here}: ${describe(actual)} != ${describe(expected)}`;
    }
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
    for (const key of keys) {
      const diff = firstDifference(actual[key], expected[key], `${path}.${key}`);
      if (diff) return diff;
    }
    return null;
  }

  return Object.is(actual, expected) ? null : `${here}: ${describe(actual)} != ${describe(expected)}`;
}
