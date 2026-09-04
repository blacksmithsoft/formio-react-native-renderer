// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { applyDefaults, emptyTreeNode, validateForm } from '../../src/engine/formState';
import { renameMapKey, uniqueMapKey } from '../../src/engine/nestedData';
import { parseForm } from '../../src/engine/parseForm';
import { form, textfield } from './support';

describe('datamap', () => {
  const schema = {
    type: 'datamap',
    key: 'extraMeta',
    label: 'Extra Metadata',
    input: true,
    keyLabel: 'Key',
    valueComponent: { type: 'textfield', key: 'value', label: 'Value', input: true },
  };

  it('parses as a datamap with no issues', () => {
    const parsed = form([schema]);
    expect(parsed.components[0]?.role).toBe('datamap');
    expect(parsed.components[0]?.dataMap?.keyLabel).toBe('Key');
    expect(parsed.components[0]?.dataMap?.valueComponent.base).toBe('textfield');
    expect(parsed.issues).toEqual([]);
  });

  it('defaults to an empty object and does not block submit', () => {
    const parsed = form([schema]);
    const data = applyDefaults(parsed, {});
    expect(data.extraMeta).toEqual({});
    expect(validateForm(parsed, data).blocked).toBe(false);
  });

  it('counts entries for minLength', () => {
    const parsed = form([{ ...schema, validate: { minLength: 1 } }]);
    expect(validateForm(parsed, { extraMeta: {} }).errors.extraMeta?.[0]).toContain('at least 1 entries');
    expect(validateForm(parsed, { extraMeta: { a: '1' } }).errors).toEqual({});
  });
});

describe('tree', () => {
  const schema = {
    type: 'tree',
    key: 'wbsTree',
    label: 'WBS Tree',
    input: true,
    components: [textfield('nodeName'), textfield('nodeCode')],
  };

  it('parses as a tree with no issues', () => {
    const parsed = form([schema]);
    expect(parsed.components[0]?.role).toBe('tree');
    expect(parsed.components[0]?.children.map((child) => child.key)).toEqual(['nodeName', 'nodeCode']);
    expect(parsed.issues).toEqual([]);
  });

  it('defaults to a Form.io node and does not block submit', () => {
    const parsed = form([schema]);
    const data = applyDefaults(parsed, {});
    expect(data.wbsTree).toEqual(emptyTreeNode(parsed.components[0]!));
    expect(data.wbsTree).toEqual({ data: {}, children: [] });
    expect(validateForm(parsed, data).blocked).toBe(false);
  });

  it('validates node fields under data', () => {
    const parsed = form([
      {
        ...schema,
        components: [textfield('nodeName', { validate: { required: true } })],
      },
    ]);
    const empty = applyDefaults(parsed, {});
    expect(validateForm(parsed, empty).errors['wbsTree.data.nodeName']?.[0]).toContain('required');

    expect(
      validateForm(parsed, { wbsTree: { data: { nodeName: 'Foundation' }, children: [] } }).errors
    ).toEqual({});
  });
});

describe('map key helpers', () => {
  it('allocates a unique key', () => {
    expect(uniqueMapKey({})).toBe('key');
    expect(uniqueMapKey({ key: 'a' })).toBe('key1');
    expect(uniqueMapKey({ key: 'a', key1: 'b' })).toBe('key2');
  });

  it('renames without losing order or colliding', () => {
    expect(renameMapKey({ a: 1, b: 2 }, 'a', 'c')).toEqual({ c: 1, b: 2 });
    expect(renameMapKey({ a: 1, b: 2 }, 'a', 'b')).toEqual({ b1: 1, b: 2 });
    expect(renameMapKey({ a: 1 }, 'a', '  ')).toEqual({ a: 1 });
  });
});

describe('parseForm kitchen-sink blockers', () => {
  it('no longer flags datamap or tree as errors', () => {
    const parsed = parseForm({
      components: [
        { type: 'datamap', key: 'extraMeta', input: true, valueComponent: { type: 'textfield', key: 'value' } },
        { type: 'tree', key: 'wbsTree', input: true, components: [textfield('nodeName')] },
      ],
    });
    expect(parsed.issues.filter((entry) => entry.issue.severity === 'error')).toEqual([]);
    expect(validateForm(parsed, applyDefaults(parsed, {})).blocked).toBe(false);
  });
});
