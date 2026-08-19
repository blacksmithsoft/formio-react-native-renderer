// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { isEmptyValue, validateComponent } from '../../src/engine/validation';
import { parseFormComponents } from '../../src/engine/parseForm';
import type { FormComponent } from '../../src/engine/types';

function one(component: Record<string, unknown>): FormComponent {
  const [parsed] = parseFormComponents([{ input: true, ...component }]);
  if (!parsed) throw new Error('component did not parse');
  return parsed;
}

const check = (component: Record<string, unknown>, value: unknown): string[] =>
  validateComponent(one(component), value);

describe('isEmptyValue', () => {
  it('treats zero and false-as-a-number as answered', () => {
    expect(isEmptyValue(0)).toBe(false);
    expect(isEmptyValue('0')).toBe(false);
  });

  it('treats an unticked checkbox, a blank string and an empty list as unanswered', () => {
    expect(isEmptyValue(false)).toBe(true);
    expect(isEmptyValue('   ')).toBe(true);
    expect(isEmptyValue([])).toBe(true);
    expect(isEmptyValue(undefined)).toBe(true);
    expect(isEmptyValue(null)).toBe(true);
  });

  it('treats a selectboxes map with nothing ticked as unanswered', () => {
    expect(isEmptyValue({ a: false, b: false })).toBe(true);
    expect(isEmptyValue({ a: false, b: true })).toBe(false);
  });
});

describe('required', () => {
  const required = { type: 'textfield', key: 'name', label: 'Name', validate: { required: true } };

  it('fails on an empty value and passes on any answer', () => {
    expect(check(required, '')).toEqual(['Name is required']);
    expect(check(required, 'Ali')).toEqual([]);
  });

  it('uses customMessage when the author supplied one', () => {
    expect(check({ ...required, validate: { required: true, customMessage: 'Tell us who.' } }, '')).toEqual([
      'Tell us who.',
    ]);
  });

  it('requires a checkbox to be ticked', () => {
    expect(check({ type: 'checkbox', key: 'agree', label: 'Agree', validate: { required: true } }, false)).toEqual([
      'Agree is required',
    ]);
  });
});

describe('length and word rules', () => {
  const field = (validate: Record<string, unknown>) => ({
    type: 'textfield',
    key: 'notes',
    label: 'Notes',
    validate,
  });

  it('enforces minLength and maxLength', () => {
    expect(check(field({ minLength: 3 }), 'ab')).toEqual(['Notes must have at least 3 characters.']);
    expect(check(field({ maxLength: 3 }), 'abcd')).toEqual([
      'Notes must have no more than 3 characters.',
    ]);
    expect(check(field({ minLength: 3, maxLength: 5 }), 'abcd')).toEqual([]);
  });

  it('enforces minWords and maxWords', () => {
    expect(check(field({ minWords: 3 }), 'two words')).toEqual(['Notes must have at least 3 words.']);
    expect(check(field({ maxWords: 2 }), 'one two three')).toEqual([
      'Notes must have no more than 2 words.',
    ]);
  });

  it('does not run shape rules on an unanswered optional field', () => {
    expect(check(field({ minLength: 3 }), '')).toEqual([]);
  });
});

describe('numeric rules', () => {
  const number = (validate: Record<string, unknown>) => ({
    type: 'number',
    key: 'qty',
    label: 'Qty',
    validate,
  });

  it('enforces min and max', () => {
    expect(check(number({ min: 5 }), 3)).toEqual(['Qty cannot be less than 5.']);
    expect(check(number({ max: 5 }), 9)).toEqual(['Qty cannot be greater than 5.']);
    expect(check(number({ min: 1, max: 10 }), 5)).toEqual([]);
  });

  it('compares numeric strings, which is how a text keyboard delivers them', () => {
    expect(check(number({ min: 5 }), '3')).toEqual(['Qty cannot be less than 5.']);
  });

  it('rejects a value that is not a number at all', () => {
    expect(check(number({}), 'twelve')).toEqual(['Qty must be a number.']);
  });
});

describe('pattern', () => {
  it('anchors the authored pattern, as Form.io does', () => {
    const component = { type: 'textfield', key: 'code', label: 'Code', validate: { pattern: '\\d{3}' } };
    expect(check(component, '123')).toEqual([]);
    expect(check(component, 'x123x')).toEqual(['Code does not match the pattern \\d{3}']);
  });

  it('ignores a pattern that will not compile rather than failing the form open', () => {
    const component = { type: 'textfield', key: 'code', label: 'Code', validate: { pattern: '([' } };
    expect(() => check(component, 'anything')).not.toThrow();
    expect(check(component, 'anything')).toEqual([]);
  });
});

describe('type-implied rules', () => {
  it('validates email and url', () => {
    expect(check({ type: 'email', key: 'e', label: 'Email' }, 'nope')).toEqual([
      'Email must be a valid email.',
    ]);
    expect(check({ type: 'email', key: 'e', label: 'Email' }, 'a@b.co')).toEqual([]);
    expect(check({ type: 'url', key: 'u', label: 'Site' }, 'not a url')).toEqual([
      'Site must be a valid url.',
    ]);
    expect(check({ type: 'url', key: 'u', label: 'Site' }, 'https://vise.example.com/x')).toEqual([]);
  });

  it('is lenient about phone numbers, since the server is', () => {
    expect(check({ type: 'phoneNumber', key: 'p', label: 'Phone' }, '+44 20 7946 0958 ext 12')).toEqual([]);
    expect(check({ type: 'phoneNumber', key: 'p', label: 'Phone' }, '12')).toEqual([
      'Phone must be a valid phone number.',
    ]);
  });

  it('applies branded types by their base type', () => {
    expect(check({ type: 'custom_email', key: 'e', label: 'Email' }, 'nope')).toEqual([
      'Email must be a valid email.',
    ]);
  });
});

describe('selection counts', () => {
  const boxes = {
    type: 'selectboxes',
    key: 'ppe',
    label: 'PPE',
    validate: { minSelectedCount: 2, maxSelectedCount: 3 },
  };

  it('counts the ticked keys of a selectboxes map', () => {
    expect(check(boxes, { a: true, b: false })).toEqual(['Please select at least 2 items.']);
    expect(check(boxes, { a: true, b: true })).toEqual([]);
    expect(check(boxes, { a: true, b: true, c: true, d: true })).toEqual([
      'Please select no more than 3 items.',
    ]);
  });
});

describe('grids', () => {
  it('reads minLength and maxLength as row counts', () => {
    const grid = {
      type: 'datagrid',
      key: 'lines',
      label: 'Lines',
      components: [],
      validate: { minLength: 2, maxLength: 3 },
    };
    expect(check(grid, [{}])).toEqual(['Lines must have at least 2 rows.']);
    expect(check(grid, [{}, {}])).toEqual([]);
    expect(check(grid, [{}, {}, {}, {}])).toEqual(['Lines must have no more than 3 rows.']);
  });

  it('requires at least one row when the grid is required', () => {
    const grid = {
      type: 'datagrid',
      key: 'lines',
      label: 'Lines',
      components: [],
      validate: { required: true },
    };
    expect(check(grid, [])).toEqual(['Lines is required']);
  });
});

describe('customMessage', () => {
  it('replaces the generated text for whichever rule failed', () => {
    const component = {
      type: 'textfield',
      key: 'code',
      label: 'Code',
      validate: { minLength: 5, customMessage: 'Codes are five characters.' },
    };
    expect(check(component, 'ab')).toEqual(['Codes are five characters.']);
  });
});
