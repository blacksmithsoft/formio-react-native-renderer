// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { requiresNetwork } from '../../src/engine/networkFields';
import { parseForm } from '../../src/engine/parseForm';
import { applyDefaults, validateForm } from '../../src/engine/formState';

describe('requiresNetwork', () => {
  it('flags url and resource selects without inlined options', () => {
    expect(requiresNetwork({ type: 'select', dataSrc: 'url', data: { url: 'https://example.com' } })).toBe(true);
    expect(requiresNetwork({ type: 'select', dataSrc: 'resource', data: { resource: 'users' } })).toBe(true);
    expect(requiresNetwork({ type: 'select', dataSrc: 'url' }, true)).toBe(false);
  });

  it('leaves inline selects and local grids alone', () => {
    expect(requiresNetwork({ type: 'select', dataSrc: 'values', data: { values: [{ label: 'A', value: 'a' }] } })).toBe(
      false
    );
    expect(requiresNetwork({ type: 'datagrid', key: 'lines' })).toBe(false);
  });

  it('flags widgets that cannot work without a live endpoint', () => {
    expect(requiresNetwork({ type: 'resource' })).toBe(true);
    expect(requiresNetwork({ type: 'custom_resource' })).toBe(true);
    expect(requiresNetwork({ type: 'datasource' })).toBe(true);
    expect(requiresNetwork({ type: 'recaptcha' })).toBe(true);
    expect(requiresNetwork({ type: 'stripe' })).toBe(true);
    expect(
      requiresNetwork({
        type: 'datatable',
        fetch: { enable: true, dataSrc: 'url', url: 'https://example.com/api/departments' },
      })
    ).toBe(true);
  });
});

describe('parseForm hides remote components', () => {
  it('marks unresolved remote selects hidden and does not warn', () => {
    const form = parseForm({
      components: [
        {
          type: 'select',
          key: 'resourceSelect',
          label: 'Linked Resource (select dataSrc)',
          input: true,
          dataSrc: 'resource',
          data: { resource: 'users' },
        },
        {
          type: 'select',
          key: 'urlSelect',
          label: 'URL-backed Select',
          input: true,
          dataSrc: 'url',
          data: { url: 'https://example.com/api/options' },
        },
        {
          type: 'select',
          key: 'weather',
          label: 'Weather',
          input: true,
          data: { values: [{ label: 'Clear', value: 'clear' }] },
        },
      ],
    });

    expect(form.components.find((component) => component.key === 'resourceSelect')?.hidden).toBe(true);
    expect(form.components.find((component) => component.key === 'urlSelect')?.hidden).toBe(true);
    expect(form.components.find((component) => component.key === 'weather')?.hidden).toBe(false);
    expect(form.issues).toEqual([]);
  });

  it('keeps a stored remote value and stays submittable', () => {
    const form = parseForm({
      components: [{ type: 'select', key: 'urlSelect', input: true, dataSrc: 'url', data: { url: 'https://x' } }],
    });
    const data = applyDefaults(form, { urlSelect: 'kept' });
    expect(data.urlSelect).toBe('kept');
    expect(validateForm(form, data).blocked).toBe(false);
    expect(validateForm(form, data).errors).toEqual({});
  });
});
