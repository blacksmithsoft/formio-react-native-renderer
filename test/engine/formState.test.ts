// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import {
  applyClearOnHide,
  applyDefaults,
  emptyRow,
  initialValueFor,
  reconcile,
  toSubmission,
  validateForm,
} from '../../src/engine/formState';
import { parseForm } from '../../src/engine/parseForm';
import { container, datagrid, form, textfield } from './support';

describe('defaults', () => {
  it('seeds an absent value and leaves an existing one alone', () => {
    const parsed = form([textfield('a', { defaultValue: 'seed' }), textfield('b', { defaultValue: 'seed' })]);
    expect(applyDefaults(parsed, { b: 'mine' })).toEqual({ a: 'seed', b: 'mine' });
  });

  it('gives a checkbox false and a selectboxes group a full map, not undefined', () => {
    const parsed = form([
      { type: 'checkbox', key: 'agree', label: 'Agree', input: true },
      {
        type: 'selectboxes',
        key: 'ppe',
        label: 'PPE',
        input: true,
        values: [
          { label: 'Hat', value: 'hat' },
          { label: 'Vest', value: 'vest' },
        ],
      },
    ]);
    expect(applyDefaults(parsed, {})).toEqual({ agree: false, ppe: { hat: false, vest: false } });
  });

  it('opens a datagrid with one row and an editgrid with none', () => {
    const grid = parseForm({ components: [datagrid('lines', [textfield('qty')])] });
    expect(applyDefaults(grid, {})).toEqual({ lines: [{}] });

    const edit = parseForm({
      components: [{ type: 'editgrid', key: 'entries', label: 'Entries', input: true, components: [textfield('q')] }],
    });
    expect(applyDefaults(edit, {})).toEqual({ entries: [] });
  });

  it('seeds defaults inside a container at their scoped path', () => {
    const parsed = form([container('site', [textfield('city', { defaultValue: 'Doha' })])]);
    expect(applyDefaults(parsed, {})).toEqual({ site: { city: 'Doha' } });
  });

  it('does not overwrite a stored value with a default, even a falsy one', () => {
    const parsed = form([{ type: 'checkbox', key: 'agree', label: 'Agree', input: true, defaultValue: true }]);
    expect(applyDefaults(parsed, { agree: false })).toEqual({ agree: false });
  });
});

describe('initialValueFor and emptyRow', () => {
  it('builds a row with each child at its initial value', () => {
    const parsed = parseForm({
      components: [
        datagrid('lines', [
          textfield('qty', { defaultValue: '1' }),
          { type: 'checkbox', key: 'done', label: 'Done', input: true },
        ]),
      ],
    });
    const grid = parsed.components[0];
    if (!grid) throw new Error('grid did not parse');
    expect(emptyRow(grid)).toEqual({ qty: '1', done: false });
  });

  it('gives a multiple-value field an empty list', () => {
    const [component] = parseForm({
      components: [textfield('tagged', { multiple: true })],
    }).components;
    if (!component) throw new Error('component did not parse');
    expect(initialValueFor(component)).toEqual([]);
  });
});

describe('clearOnHide', () => {
  const parsed = form([
    textfield('hasIncident'),
    textfield('detail', { conditional: { show: true, when: 'hasIncident', eq: 'yes' } }),
  ]);

  it('removes the value of a conditionally hidden component', () => {
    const cleared = applyClearOnHide(parsed, { hasIncident: 'no', detail: 'stale' });
    expect(cleared).toEqual({ hasIncident: 'no' });
    expect(Object.prototype.hasOwnProperty.call(cleared, 'detail')).toBe(false);
  });

  it('keeps the value while the component is visible', () => {
    expect(applyClearOnHide(parsed, { hasIncident: 'yes', detail: 'kept' })).toEqual({
      hasIncident: 'yes',
      detail: 'kept',
    });
  });

  it('honours clearOnHide: false', () => {
    const keeper = form([
      textfield('hasIncident'),
      textfield('detail', {
        clearOnHide: false,
        conditional: { show: true, when: 'hasIncident', eq: 'yes' },
      }),
    ]);
    expect(applyClearOnHide(keeper, { hasIncident: 'no', detail: 'stale' })).toEqual({
      hasIncident: 'no',
      detail: 'stale',
    });
  });

  it('clears a hidden container as one value rather than key by key', () => {
    const scoped = form([
      textfield('mode'),
      {
        type: 'container',
        key: 'site',
        label: 'Site',
        input: true,
        conditional: { show: true, when: 'mode', eq: 'full' },
        components: [textfield('city')],
      },
    ]);
    expect(applyClearOnHide(scoped, { mode: 'brief', site: { city: 'Doha' } })).toEqual({ mode: 'brief' });
  });

  it('returns the same object when nothing needs clearing, so a caller can compare by identity', () => {
    const data = { hasIncident: 'yes', detail: 'kept' };
    expect(applyClearOnHide(parsed, data)).toBe(data);
  });

  it('clears a field hidden inside one grid row without touching the others', () => {
    const grid = form([
      datagrid('lines', [
        textfield('kind'),
        textfield('other', { conditional: { show: true, when: 'kind', eq: 'other' } }),
      ]),
    ]);
    const cleared = applyClearOnHide(grid, {
      lines: [
        { kind: 'other', other: 'kept' },
        { kind: 'standard', other: 'stale' },
      ],
    });
    expect(cleared).toEqual({ lines: [{ kind: 'other', other: 'kept' }, { kind: 'standard' }] });
  });
});

describe('reconcile', () => {
  it('settles a chain of conditionals in one call', () => {
    const parsed = form([
      textfield('a'),
      textfield('b', { conditional: { show: true, when: 'a', eq: 'go' } }),
      textfield('c', { conditional: { show: true, when: 'b', eq: 'go' } }),
    ]);
    expect(reconcile(parsed, { a: 'stop', b: 'go', c: 'orphan' })).toEqual({ a: 'stop' });
  });

  it('terminates on a schema whose conditionals contradict each other', () => {
    const parsed = form([
      textfield('a', { defaultValue: 'x', conditional: { show: false, when: 'b', eq: 'x' } }),
      textfield('b', { defaultValue: 'x', conditional: { show: false, when: 'a', eq: 'x' } }),
    ]);
    expect(() => reconcile(parsed, { a: 'x', b: 'x' })).not.toThrow();
  });

  it('applies a JSON Logic calculateValue', () => {
    const parsed = form([
      textfield('qty'),
      textfield('rate'),
      textfield('total', {
        calculateValue: { '*': [{ var: 'qty' }, { var: 'rate' }] },
      }),
    ]);
    expect(reconcile(parsed, { qty: 3, rate: 4 })).toMatchObject({ total: 12 });
  });

  it('lets the user override a calculation when the schema allows it', () => {
    const parsed = form([
      textfield('qty'),
      textfield('total', {
        allowCalculateOverride: true,
        calculateValue: { '*': [{ var: 'qty' }, 2] },
      }),
    ]);
    expect(reconcile(parsed, { qty: 3, total: 99 }, new Set(['total']))).toMatchObject({ total: 99 });
    expect(reconcile(parsed, { qty: 3, total: 99 }, new Set())).toMatchObject({ total: 6 });
  });
});

describe('validateForm', () => {
  it('blocks the form when a component carries custom JavaScript', () => {
    const parsed = form([textfield('a', { customConditional: 'show = data.b === 1' })]);
    const result = validateForm(parsed, {});
    expect(result.blocked).toBe(true);
    expect(result.blockingIssues[0]?.issue.code).toBe('custom-javascript');
  });

  it('does not block on a merely degraded component', () => {
    const parsed = form([{ type: 'somethingNew', key: 'x', label: 'X', input: true }]);
    expect(validateForm(parsed, {}).blocked).toBe(false);
    expect(parsed.issues[0]?.issue.severity).toBe('warning');
  });

  it('does not validate a schema-hidden component', () => {
    const parsed = form([textfield('stamp', { hidden: true, validate: { required: true } })]);
    expect(validateForm(parsed, {}).errors).toEqual({});
  });
});

describe('toSubmission', () => {
  it('returns a detached copy under a data key', () => {
    const data = { nested: { a: 1 } };
    const submission = toSubmission(data);
    expect(submission).toEqual({ data: { nested: { a: 1 } } });
    expect(submission.data).not.toBe(data);
    expect(submission.data.nested).not.toBe(data.nested);
  });
});
