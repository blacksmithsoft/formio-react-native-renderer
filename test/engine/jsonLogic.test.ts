// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { apply, truthy } from '../../src/engine/jsonLogic';

/**
 * The operator set follows `json-logic-js`, quirks included. Several cases below pin a quirk
 * rather than a nicety — an empty array being falsy, `+` coercing with `parseFloat`, a missing
 * `var` resolving to `null` — because rules are authored against that implementation on the web
 * and "improving" one would be a parity bug, not a fix.
 */

describe('truthy', () => {
  it('treats an empty array as false and a non-empty one as true', () => {
    expect(truthy([])).toBe(false);
    expect(truthy([0])).toBe(true);
  });

  it('otherwise follows JavaScript', () => {
    expect(truthy(0)).toBe(false);
    expect(truthy('')).toBe(false);
    expect(truthy('0')).toBe(true);
    expect(truthy({})).toBe(true);
  });
});

describe('var', () => {
  const data = { a: 1, nested: { b: 'x' }, lines: [{ qty: 4 }] };

  it('reads dotted paths', () => {
    expect(apply({ var: 'nested.b' }, data)).toBe('x');
  });

  it('reads bracketed array paths as well as dotted ones', () => {
    expect(apply({ var: 'lines[0].qty' }, data)).toBe(4);
    expect(apply({ var: 'lines.0.qty' }, data)).toBe(4);
  });

  it('resolves a missing path to null, and to the default when one is given', () => {
    expect(apply({ var: 'nope' }, data)).toBeNull();
    expect(apply({ var: ['nope', 'fallback'] }, data)).toBe('fallback');
  });

  it('returns the whole scope for an empty path', () => {
    expect(apply({ var: '' }, data)).toBe(data);
  });
});

describe('comparison and logic', () => {
  it('distinguishes loose from strict equality', () => {
    expect(apply({ '==': [1, '1'] }, {})).toBe(true);
    expect(apply({ '===': [1, '1'] }, {})).toBe(false);
    expect(apply({ '!=': [1, '1'] }, {})).toBe(false);
    expect(apply({ '!==': [1, '1'] }, {})).toBe(true);
  });

  it('supports the three-argument between form', () => {
    expect(apply({ '<': [1, 5, 10] }, {})).toBe(true);
    expect(apply({ '<': [1, 50, 10] }, {})).toBe(false);
    expect(apply({ '<=': [1, 1, 1] }, {})).toBe(true);
  });

  it('short-circuits and returns the deciding operand, not a boolean', () => {
    expect(apply({ and: [true, 'last'] }, {})).toBe('last');
    expect(apply({ and: [false, 'never'] }, {})).toBe(false);
    expect(apply({ or: ['first', 'never'] }, {})).toBe('first');
    expect(apply({ or: [null, 'second'] }, {})).toBe('second');
  });

  it('evaluates if as a variadic cond', () => {
    expect(apply({ if: [false, 'a', true, 'b', 'c'] }, {})).toBe('b');
    expect(apply({ if: [false, 'a', false, 'b', 'c'] }, {})).toBe('c');
    expect(apply({ if: [false, 'a'] }, {})).toBeNull();
  });
});

describe('arithmetic and strings', () => {
  it('coerces with parseFloat, as json-logic does', () => {
    expect(apply({ '+': [1, '2'] }, {})).toBe(3);
    expect(apply({ '+': ['3 apples', 1] }, {})).toBe(4);
    expect(apply({ '-': [10] }, {})).toBe(-10);
    expect(apply({ '*': [2, 3, 4] }, {})).toBe(24);
    expect(apply({ '/': [10, 4] }, {})).toBe(2.5);
    expect(apply({ '%': [10, 3] }, {})).toBe(1);
  });

  it('handles min, max, cat and substr', () => {
    expect(apply({ min: [3, 1, 2] }, {})).toBe(1);
    expect(apply({ max: [3, 1, 2] }, {})).toBe(3);
    expect(apply({ cat: ['a', 'b', 1] }, {})).toBe('ab1');
    expect(apply({ substr: ['jsonlogic', 4] }, {})).toBe('logic');
    expect(apply({ substr: ['jsonlogic', -5] }, {})).toBe('logic');
    expect(apply({ substr: ['jsonlogic', 0, 4] }, {})).toBe('json');
    expect(apply({ substr: ['jsonlogic', 0, -5] }, {})).toBe('json');
  });

  it('tests membership in both strings and arrays', () => {
    expect(apply({ in: ['a', 'bot'] }, {})).toBe(false);
    expect(apply({ in: ['a', 'bat'] }, {})).toBe(true);
    expect(apply({ in: ['a', ['a', 'b']] }, {})).toBe(true);
    expect(apply({ in: ['a', null] }, {})).toBe(false);
  });
});

describe('missing', () => {
  it('lists keys that are absent or empty', () => {
    expect(apply({ missing: ['a', 'b'] }, { a: 1 })).toEqual(['b']);
    expect(apply({ missing: ['a'] }, { a: '' })).toEqual(['a']);
  });

  it('missing_some passes once enough keys are present', () => {
    expect(apply({ missing_some: [1, ['a', 'b', 'c']] }, { a: 1 })).toEqual([]);
    expect(apply({ missing_some: [2, ['a', 'b', 'c']] }, { a: 1 })).toEqual(['b', 'c']);
  });
});

describe('iterators', () => {
  const data = { rows: [{ n: 1 }, { n: 2 }, { n: 3 }] };

  it('maps, filters and reduces with the item as the scope', () => {
    expect(apply({ map: [{ var: 'rows' }, { var: 'n' }] }, data)).toEqual([1, 2, 3]);
    expect(apply({ filter: [{ var: 'rows' }, { '>': [{ var: 'n' }, 1] }] }, data)).toEqual([
      { n: 2 },
      { n: 3 },
    ]);
    expect(
      apply(
        {
          reduce: [
            { var: 'rows' },
            { '+': [{ var: 'current.n' }, { var: 'accumulator' }] },
            0,
          ],
        },
        data
      )
    ).toBe(6);
  });

  it('quantifies with all, some and none', () => {
    expect(apply({ all: [{ var: 'rows' }, { '>': [{ var: 'n' }, 0] }] }, data)).toBe(true);
    expect(apply({ some: [{ var: 'rows' }, { '>': [{ var: 'n' }, 2] }] }, data)).toBe(true);
    expect(apply({ none: [{ var: 'rows' }, { '>': [{ var: 'n' }, 9] }] }, data)).toBe(true);
    // An empty list fails `all`, matching json-logic.
    expect(apply({ all: [{ var: 'nope' }, true] }, data)).toBe(false);
  });
});

describe('robustness', () => {
  it('returns literals unchanged', () => {
    expect(apply(3, {})).toBe(3);
    expect(apply('text', {})).toBe('text');
    expect(apply(null, {})).toBeNull();
  });

  it('resolves an unknown operator to null instead of throwing', () => {
    expect(apply({ notAnOperator: [1, 2] }, {})).toBeNull();
  });

  it('leaves a multi-key object alone, since it is not a rule', () => {
    const literal = { a: 1, b: 2 };
    expect(apply(literal, {})).toBe(literal);
  });

  it('survives deeply malformed input', () => {
    expect(() => apply({ '+': { var: 'a' } }, { a: 'x' })).not.toThrow();
    expect(() => apply({ map: [null, null] }, {})).not.toThrow();
  });
});
