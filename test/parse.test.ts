// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { baseFieldType, parseSchemaNodes, parseSchemaTabLayout } from '../src/index';
import type { SchemaField, SchemaLayoutNode } from '../src/index';

/**
 * Parser behaviour the shared fixtures do not pin down, plus the two base-type defects from
 * docs/SPEC.md §9 that this package fixes.
 */

function fields(nodes: SchemaLayoutNode[]): SchemaField[] {
  return nodes.flatMap((node) => (node.kind === 'field' ? [node.field] : []));
}

describe('baseFieldType', () => {
  it('strips only a leading custom_ prefix', () => {
    expect(baseFieldType('custom_select')).toBe('select');
    expect(baseFieldType('select')).toBe('select');
    expect(baseFieldType('my_custom_select')).toBe('my_custom_select');
    expect(baseFieldType('')).toBe('');
  });
});

describe('branded types resolve on the base type', () => {
  it('reads a custom_select from data.values', () => {
    const [field] = fields(
      parseSchemaNodes([
        {
          type: 'custom_select',
          key: 'status',
          label: 'Status',
          data: { values: [{ label: 'Open', value: 'open' }] },
        },
      ])
    );

    expect(field?.options).toEqual([{ label: 'Open', value: 'open' }]);
    // The unstripped type is retained so a host can match its real backend type name.
    expect(field?.type).toBe('custom_select');
  });

  it('treats every branded non-field as unsupported', () => {
    const nodes = parseSchemaNodes([
      { type: 'custom_file', key: 'photos', label: 'Photos' },
      { type: 'custom_editgrid', key: 'lines', label: 'Lines' },
      { type: 'custom_datagrid', key: 'grid', label: 'Grid' },
      { type: 'custom_textfield', key: 'name', label: 'Name' },
    ]);

    expect(nodes.map((node) => node.kind)).toEqual([
      'unsupported',
      'unsupported',
      'unsupported',
      'field',
    ]);
  });

  it('marks custom_textarea multiline', () => {
    const [field] = fields(parseSchemaNodes([{ type: 'custom_textarea', key: 'notes' }]));
    expect(field?.multiline).toBe(true);
  });
});

describe('normalisation', () => {
  it('omits empty optional properties rather than storing empty strings', () => {
    const [field] = fields(
      parseSchemaNodes([
        { type: 'textfield', key: 'a', description: '', placeholder: '', prefix: '', labelWidth: 0 },
      ])
    );

    expect(field?.description).toBeUndefined();
    expect(field?.placeholder).toBeUndefined();
    expect(field?.prefix).toBeUndefined();
    expect(field?.labelWidth).toBeUndefined();
  });

  it('falls back key to type and label to key', () => {
    const [field] = fields(parseSchemaNodes([{ type: 'textfield' }]));
    expect(field?.key).toBe('textfield');
    expect(field?.label).toBe('textfield');
  });

  it('keeps author order and drops web-hidden or mobile-hidden components', () => {
    const nodes = parseSchemaNodes([
      { type: 'textfield', key: 'first' },
      { type: 'textfield', key: 'ghost', hidden: true },
      { type: 'textfield', key: 'mobileGhost', mobileHidden: true },
      { type: 'textfield', key: 'second' },
    ]);

    expect(fields(nodes).map((field) => field.key)).toEqual(['first', 'second']);
  });

  it('does not resolve a tab marked hidden on mobile', () => {
    const schema = {
      components: [{
        type: 'tabs',
        components: [{
          key: 'quantities',
          mobileHidden: true,
          components: [{ type: 'number', key: 'qty' }],
        }],
      }],
    };

    expect(parseSchemaTabLayout(schema, 'quantities')).toEqual([]);
  });

  it('treats an unknown type as a field rather than dropping it', () => {
    const nodes = parseSchemaNodes([{ type: 'signature', key: 'sig' }, { type: 'newThing', key: 'x' }]);
    expect(nodes.map((node) => node.kind)).toEqual(['field', 'field']);
  });
});

describe('malformed input never throws', () => {
  // The failure mode most likely to reach a user: a schema that did not sync cleanly, opened
  // offline. Every one of these must degrade to an empty tree.
  const junk: unknown[] = [null, undefined, 0, 'x', true, {}, [], [null, 'x', 1], { components: 7 }];

  it('parseSchemaNodes degrades to an empty tree', () => {
    for (const value of junk) {
      expect(parseSchemaNodes(value), `input ${JSON.stringify(value)}`).toEqual([]);
    }
  });

  it('parseSchemaTabLayout degrades to an empty tree', () => {
    for (const value of junk) {
      expect(parseSchemaTabLayout(value, 'basic'), `input ${JSON.stringify(value)}`).toEqual([]);
    }
  });

  it('keeps a well-formed subtree when a sibling is malformed', () => {
    const nodes = parseSchemaNodes([
      { type: 'columns', key: 'row', columns: 'not-an-array' },
      { type: 'panel', key: 'p', title: 'P', components: null },
      { type: 'textfield', key: 'ok' },
    ]);

    expect(nodes.map((node) => node.kind)).toEqual(['columns', 'panel', 'field']);
  });
});
