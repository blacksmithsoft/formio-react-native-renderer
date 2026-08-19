// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import {
  getAtPath,
  hasAtPath,
  indexPath,
  joinPath,
  parsePath,
  setAtPath,
  unsetAtPath,
} from '../../src/engine/dataPaths';

describe('parsePath', () => {
  it('splits dotted and bracketed segments', () => {
    expect(parsePath('lines[0].qty')).toEqual(['lines', 0, 'qty']);
    expect(parsePath('a.b.c')).toEqual(['a', 'b', 'c']);
    expect(parsePath('grid[2]')).toEqual(['grid', 2]);
    expect(parsePath('')).toEqual([]);
  });

  it('treats non-numeric brackets as a literal key rather than an array index', () => {
    expect(parsePath('a[b].c')).toEqual(['a', 'b', 'c']);
  });

  it('keeps an unterminated bracket rather than losing the rest of the path', () => {
    expect(parsePath('a[0')).toEqual(['a[0']);
  });
});

describe('getAtPath', () => {
  const data = { a: { b: [{ c: 1 }, { c: 2 }] }, flat: 'x', zero: 0, empty: '' };

  it('reads nested objects and array rows', () => {
    expect(getAtPath(data, 'a.b[1].c')).toBe(2);
    expect(getAtPath(data, 'flat')).toBe('x');
  });

  it('distinguishes a falsy stored value from an absent one', () => {
    expect(getAtPath(data, 'zero')).toBe(0);
    expect(getAtPath(data, 'empty')).toBe('');
    expect(getAtPath(data, 'nope')).toBeUndefined();
  });

  it('returns undefined instead of throwing when the shape disagrees', () => {
    expect(getAtPath(data, 'flat.deeper.still')).toBeUndefined();
    expect(getAtPath(data, 'a.b.notAnIndex')).toBeUndefined();
    expect(getAtPath(null, 'a')).toBeUndefined();
  });
});

describe('setAtPath', () => {
  it('writes without mutating the input', () => {
    const before = { a: { b: 1 } };
    const after = setAtPath(before, 'a.c', 2);
    expect(after).toEqual({ a: { b: 1, c: 2 } });
    expect(before).toEqual({ a: { b: 1 } });
  });

  it('copies only the spine it touches, so untouched branches keep their identity', () => {
    const untouched = { keep: true };
    const before = { untouched, target: { value: 1 } };
    const after = setAtPath(before, 'target.value', 2);
    expect(after.untouched).toBe(untouched);
    expect(after.target).not.toBe(before.target);
  });

  it('creates arrays for numeric segments and objects for named ones', () => {
    expect(setAtPath({}, 'lines[0].qty', 5)).toEqual({ lines: [{ qty: 5 }] });
    expect(setAtPath({}, 'a.b', 1)).toEqual({ a: { b: 1 } });
  });

  it('replaces a level whose stored shape disagrees with the path', () => {
    expect(setAtPath({ lines: 'oops' }, 'lines[0].qty', 5)).toEqual({ lines: [{ qty: 5 }] });
  });

  it('returns the original object for an empty path', () => {
    const before = { a: 1 };
    expect(setAtPath(before, '', 2)).toBe(before);
  });
});

describe('unsetAtPath', () => {
  it('deletes the key rather than setting it to undefined', () => {
    const after = unsetAtPath({ a: 1, b: 2 }, 'a');
    expect(Object.prototype.hasOwnProperty.call(after, 'a')).toBe(false);
    expect(after).toEqual({ b: 2 });
  });

  it('splices an array row out, renumbering the rows after it', () => {
    const after = unsetAtPath({ lines: [{ q: 1 }, { q: 2 }, { q: 3 }] }, 'lines[1]');
    expect(after).toEqual({ lines: [{ q: 1 }, { q: 3 }] });
  });

  it('removes a key from inside a row without disturbing the row itself', () => {
    const after = unsetAtPath({ lines: [{ q: 1, note: 'x' }] }, 'lines[0].note');
    expect(after).toEqual({ lines: [{ q: 1 }] });
  });

  it('returns the original object when there is nothing to remove', () => {
    const before = { a: 1 };
    expect(unsetAtPath(before, 'missing')).toBe(before);
    expect(unsetAtPath(before, 'a.b.c')).toBe(before);
  });

  it('removes a key stored as null, which is present but empty', () => {
    const after = unsetAtPath({ a: null }, 'a');
    expect(Object.prototype.hasOwnProperty.call(after, 'a')).toBe(false);
  });
});

describe('hasAtPath', () => {
  it('separates "absent" from "stored as null or undefined"', () => {
    expect(hasAtPath({ a: null }, 'a')).toBe(true);
    expect(hasAtPath({ a: undefined }, 'a')).toBe(true);
    expect(hasAtPath({}, 'a')).toBe(false);
  });

  it('bounds-checks array indices', () => {
    expect(hasAtPath({ rows: [1] }, 'rows[0]')).toBe(true);
    expect(hasAtPath({ rows: [1] }, 'rows[1]')).toBe(false);
  });
});

describe('path building', () => {
  it('joins keys and indices', () => {
    expect(joinPath('', 'a')).toBe('a');
    expect(joinPath('a', 'b')).toBe('a.b');
    expect(joinPath('a', '')).toBe('a');
    expect(indexPath('lines', 3)).toBe('lines[3]');
  });
});
