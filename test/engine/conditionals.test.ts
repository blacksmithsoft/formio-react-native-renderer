// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { evaluateConditional } from '../../src/engine/conditionals';
import { validateForm } from '../../src/engine/formState';
import type { ConditionalRule } from '../../src/engine/types';
import { container, datagrid, form, panel, textfield } from './support';

const simple = (extra: Partial<Extract<ConditionalRule, { kind: 'simple' }>> = {}): ConditionalRule => ({
  kind: 'simple',
  show: true,
  when: 'hasIncident',
  eq: 'yes',
  ...extra,
});

describe('simple conditionals', () => {
  it('shows when the tested value matches', () => {
    expect(evaluateConditional(simple(), { root: { hasIncident: 'yes' } })).toBe(true);
    expect(evaluateConditional(simple(), { root: { hasIncident: 'no' } })).toBe(false);
  });

  it('inverts when show is false', () => {
    const hide = simple({ show: false });
    expect(evaluateConditional(hide, { root: { hasIncident: 'yes' } })).toBe(false);
    expect(evaluateConditional(hide, { root: { hasIncident: 'no' } })).toBe(true);
  });

  it('compares as strings, because the builder writes eq as text whatever the field is', () => {
    expect(evaluateConditional(simple({ eq: 'true' }), { root: { hasIncident: true } })).toBe(true);
    expect(evaluateConditional(simple({ eq: '3' }), { root: { hasIncident: 3 } })).toBe(true);
  });

  it('reads a selectboxes map by key and an array by membership', () => {
    expect(evaluateConditional(simple({ eq: 'a' }), { root: { hasIncident: { a: true, b: false } } })).toBe(true);
    expect(evaluateConditional(simple({ eq: 'b' }), { root: { hasIncident: { a: true, b: false } } })).toBe(false);
    expect(evaluateConditional(simple({ eq: 'b' }), { root: { hasIncident: ['a', 'b'] } })).toBe(true);
  });

  it('prefers the enclosing grid row over the submission root', () => {
    const scope = { root: { hasIncident: 'no' }, row: { hasIncident: 'yes' } };
    expect(evaluateConditional(simple(), scope)).toBe(true);
  });

  it('falls back to the root when the row does not carry the key', () => {
    const scope = { root: { hasIncident: 'yes' }, row: { other: 1 } };
    expect(evaluateConditional(simple(), scope)).toBe(true);
  });
});

describe('json logic conditionals', () => {
  const rule: ConditionalRule = {
    kind: 'json',
    logic: { '===': [{ var: 'hasIncident' }, 'yes'] },
  };

  it('evaluates the rule against the submission', () => {
    expect(evaluateConditional(rule, { root: { hasIncident: 'yes' } })).toBe(true);
    expect(evaluateConditional(rule, { root: { hasIncident: 'no' } })).toBe(false);
  });

  it('merges the row over the root so a rule inside a grid sees its own row', () => {
    expect(evaluateConditional(rule, { root: { hasIncident: 'no' }, row: { hasIncident: 'yes' } })).toBe(true);
  });
});

describe('robustness', () => {
  it('is visible when there is no rule', () => {
    expect(evaluateConditional(undefined, { root: {} })).toBe(true);
  });

  it('is visible when a rule cannot be evaluated, rather than invisible', () => {
    const broken: ConditionalRule = { kind: 'json', logic: { unknownOperator: [1] } };
    expect(evaluateConditional(broken, { root: {} })).toBe(true);
  });

  it('ignores the empty conditional object the builder writes for every component', () => {
    const parsed = form([textfield('a', { conditional: { show: '', when: null, eq: '' } })]);
    expect(parsed.components[0]?.conditional).toBeUndefined();
  });
});

describe('hidden components are not validated', () => {
  it('lets a required field pass while its conditional hides it', () => {
    const parsed = form([
      textfield('hasIncident'),
      textfield('detail', {
        validate: { required: true },
        conditional: { show: true, when: 'hasIncident', eq: 'yes' },
      }),
    ]);

    expect(validateForm(parsed, { hasIncident: 'no' }).errors).toEqual({});
    expect(validateForm(parsed, { hasIncident: 'yes' }).errors).toEqual({
      detail: ['detail is required'],
    });
  });

  it('propagates a hidden panel to the fields inside it', () => {
    const parsed = form([
      textfield('mode'),
      panel('extra', [textfield('why', { validate: { required: true } })], {
        conditional: { show: true, when: 'mode', eq: 'detailed' },
      }),
    ]);

    expect(validateForm(parsed, { mode: 'simple' }).errors).toEqual({});
    expect(Object.keys(validateForm(parsed, { mode: 'detailed' }).errors)).toEqual(['why']);
  });

  it('scopes a required field inside a container to its own path', () => {
    const parsed = form([container('site', [textfield('city', { validate: { required: true } })])]);
    expect(Object.keys(validateForm(parsed, { site: {} }).errors)).toEqual(['site.city']);
  });

  it('validates every grid row independently', () => {
    const parsed = form([datagrid('lines', [textfield('qty', { validate: { required: true } })])]);
    const errors = validateForm(parsed, { lines: [{ qty: '1' }, { qty: '' }, { qty: '3' }] }).errors;
    expect(Object.keys(errors)).toEqual(['lines[1].qty']);
  });
});
