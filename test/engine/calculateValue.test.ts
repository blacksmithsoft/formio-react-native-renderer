// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { compileCalculateValue, evaluateCalculate } from '../../src/engine/calculateValue';

describe('compileCalculateValue', () => {
  it('keeps JSON Logic as a json rule', () => {
    const logic = { '*': [{ var: 'qty' }, 2] };
    expect(compileCalculateValue(logic)).toEqual({ kind: 'json', logic });
  });

  it('compiles serial-number JavaScript without eval', () => {
    expect(compileCalculateValue('value = rowIndex + 1;')).toEqual({ kind: 'rowIndex', offset: 1 });
    expect(compileCalculateValue('value = _rowIndex + 1')).toEqual({ kind: 'rowIndex', offset: 1 });
    expect(compileCalculateValue('row.slNo = rowIndex + 1')).toEqual({ kind: 'rowIndex', offset: 1 });
    expect(compileCalculateValue('row.slno = rowIndex + 9')).toEqual({ kind: 'rowIndex', offset: 9 });
    expect(compileCalculateValue('row.slno = rowIndex + 16')).toEqual({ kind: 'rowIndex', offset: 16 });
  });

  it('compiles a quoted list indexed by row', () => {
    const source = `var questions = [\n  "Alpha",\n  "Beta"\n];\nvalue = questions[rowIndex] || '';`;
    expect(compileCalculateValue(source)).toEqual({ kind: 'rowPick', values: ['Alpha', 'Beta'] });
  });

  it('refuses JavaScript it cannot honour', () => {
    expect(compileCalculateValue('value = Math.random()')).toBeUndefined();
    expect(compileCalculateValue('show = data.x > 1')).toBeUndefined();
  });
});

describe('evaluateCalculate', () => {
  it('numbers a row from zero plus the authored offset', () => {
    expect(evaluateCalculate({ kind: 'rowIndex', offset: 1 }, 0, {})).toBe(1);
    expect(evaluateCalculate({ kind: 'rowIndex', offset: 9 }, 0, {})).toBe(9);
    expect(evaluateCalculate({ kind: 'rowIndex', offset: 1 }, -1, {})).toBeUndefined();
  });

  it('picks the matching string, or empty past the end of the list', () => {
    const rule = { kind: 'rowPick' as const, values: ['A', 'B'] };
    expect(evaluateCalculate(rule, 1, {})).toBe('B');
    expect(evaluateCalculate(rule, 4, {})).toBe('');
  });
});
