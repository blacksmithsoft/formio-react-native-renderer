// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest';
import { TRANSFORM_VERSION, transformSchema } from '../../src/compat/transformSchema';
import { parseForm } from '../../src/engine/parseForm';
import { validateForm } from '../../src/engine/formState';

/** The server-side compatibility transform — docs/FORMS.md §7. */

const run = (components: unknown[], options = {}) => transformSchema({ components }, options);

const componentsOf = (schema: Record<string, unknown>) => schema.components as Array<Record<string, unknown>>;

describe('remote selects', () => {
  const remote = {
    type: 'select',
    key: 'site',
    label: 'Site',
    input: true,
    dataSrc: 'url',
    data: { url: 'https://api.example.com/sites' },
    valueProperty: 'id',
    template: '<span>{{ item.name }}</span>',
  };

  it('inlines the options so the field works with no network', async () => {
    const resolveOptions = vi.fn().mockResolvedValue([{ label: 'North Yard', value: 'north' }]);
    const result = await run([remote], { resolveOptions });

    expect(componentsOf(result.schema)[0]).toMatchObject({
      dataSrc: 'values',
      data: { values: [{ label: 'North Yard', value: 'north' }] },
    });
    expect(result.changes[0]).toMatchObject({ rule: 'inline-select-options', severity: 'info' });
  });

  it('drops the properties that only make sense against a live endpoint', async () => {
    const result = await run([remote], { resolveOptions: () => [] });
    const select = componentsOf(result.schema)[0]!;

    expect(select.valueProperty).toBeUndefined();
    expect(select.template).toBeUndefined();
  });

  it('ships an empty select with a warning rather than a select that spins forever', async () => {
    const result = await run([remote], { resolveOptions: () => null });

    expect(componentsOf(result.schema)[0]).toMatchObject({ dataSrc: 'values', data: { values: [] } });
    expect(result.changes[0]).toMatchObject({ rule: 'unresolved-select-options', severity: 'warning' });
  });

  it('survives a lookup that throws', async () => {
    const result = await run([remote], {
      resolveOptions: () => {
        throw new Error('endpoint down');
      },
    });

    expect(result.changes[0]?.rule).toBe('unresolved-select-options');
  });

  it('leaves an already-inline select alone', async () => {
    const inline = {
      type: 'select',
      key: 'status',
      input: true,
      dataSrc: 'values',
      data: { values: [{ label: 'Open', value: 'open' }] },
    };
    const result = await run([inline], { resolveOptions: () => [] });

    expect(componentsOf(result.schema)[0]).toEqual(inline);
    expect(result.changes).toEqual([]);
  });
});

describe('address', () => {
  it('becomes a text field with hidden coordinates', async () => {
    const result = await run([{ type: 'address', key: 'site', label: 'Site address', input: true }]);

    expect(componentsOf(result.schema).map((item) => [item.type, item.key])).toEqual([
      ['textfield', 'site'],
      ['hidden', 'site_lat'],
      ['hidden', 'site_lng'],
    ]);
    expect(result.changes[0]?.rule).toBe('address-to-fields');
  });
});

describe('signature', () => {
  it('stays a signature when the build has a pad for it', async () => {
    const result = await run([{ type: 'signature', key: 'sig', input: true }], {
      capabilities: ['signature'],
    });

    expect(componentsOf(result.schema)[0]?.type).toBe('signature');
    expect(result.changes).toEqual([]);
  });

  it('falls back to an image file when the build has no pad', async () => {
    const result = await run([{ type: 'signature', key: 'sig', input: true }], { capabilities: ['files'] });

    expect(componentsOf(result.schema)[0]).toMatchObject({ type: 'file', image: true, key: 'sig' });
    expect(result.changes[0]?.rule).toBe('signature-to-file');
  });

  it('leaves it alone when the caller says nothing about capabilities', async () => {
    const result = await run([{ type: 'signature', key: 'sig', input: true }]);
    expect(componentsOf(result.schema)[0]?.type).toBe('signature');
  });
});

describe('banned types', () => {
  it('replaces a tree with a notice and keeps its value round-tripping', async () => {
    const result = await run([{ type: 'tree', key: 'hierarchy', label: 'Hierarchy', input: true }]);
    const output = componentsOf(result.schema);

    expect(output.map((item) => item.type)).toEqual(['content', 'hidden']);
    // The hidden field carries the original key, so saving on the phone cannot delete what was
    // entered on the web.
    expect(output[1]).toMatchObject({ key: 'hierarchy' });
    expect(result.changes[0]).toMatchObject({ rule: 'banned-to-notice', severity: 'warning' });
  });

  it('produces a form the renderer will actually submit', async () => {
    const result = await run([{ type: 'datamap', key: 'meta', input: true }]);
    const before = validateForm(parseForm({ components: [{ type: 'datamap', key: 'meta', input: true }] }), {});
    const after = validateForm(parseForm(result.schema), {});

    expect(before.blocked).toBe(true);
    expect(after.blocked).toBe(false);
  });
});

describe('custom JavaScript', () => {
  it('strips it so the form is submittable, and says so', async () => {
    const result = await run([
      {
        type: 'textfield',
        key: 'total',
        input: true,
        customConditional: 'show = data.x > 1',
        validate: { required: true, custom: 'valid = input.length > 3' },
      },
    ]);

    const field = componentsOf(result.schema)[0]!;
    expect(field.customConditional).toBeUndefined();
    expect(field.validate).toEqual({ required: true });
    expect(result.changes[0]).toMatchObject({ rule: 'strip-custom-javascript', severity: 'warning' });
    expect(validateForm(parseForm(result.schema), { total: 'x' }).blocked).toBe(false);
  });

  it('keeps a JSON Logic calculation, which the engine can run', async () => {
    const calculateValue = { '+': [{ var: 'a' }, { var: 'b' }] };
    const result = await run([{ type: 'number', key: 'total', input: true, calculateValue }]);

    expect(componentsOf(result.schema)[0]?.calculateValue).toEqual(calculateValue);
    expect(result.changes).toEqual([]);
  });

  it('keeps compilable rowIndex JavaScript for the device engine', async () => {
    const result = await run([
      { type: 'number', key: 'sNo', input: true, calculateValue: 'value = rowIndex + 1;' },
    ]);
    expect(componentsOf(result.schema)[0]?.calculateValue).toBe('value = rowIndex + 1;');
    expect(result.changes).toEqual([]);
    expect(validateForm(parseForm(result.schema), {}).blocked).toBe(false);
  });

  it('removes only the JavaScript-triggered logic rules', async () => {
    const result = await run([
      {
        type: 'textfield',
        key: 'a',
        input: true,
        logic: [
          { name: 'js', trigger: { type: 'javascript', javascript: 'result = true' } },
          { name: 'simple', trigger: { type: 'simple', simple: { when: 'b', eq: '1' } } },
        ],
      },
    ]);

    expect(componentsOf(result.schema)[0]?.logic).toEqual([
      { name: 'simple', trigger: { type: 'simple', simple: { when: 'b', eq: '1' } } },
    ]);
  });

  it('can be told to leave it in place', async () => {
    const result = await run([{ type: 'textfield', key: 'a', input: true, customConditional: 'x' }], {
      stripCustomJavaScript: false,
    });

    expect(componentsOf(result.schema)[0]?.customConditional).toBe('x');
    expect(result.changes).toEqual([]);
  });

  it('leaves a declarative conditional untouched', async () => {
    const conditional = { show: true, when: 'hasIncident', eq: 'yes' };
    const result = await run([{ type: 'textfield', key: 'a', input: true, conditional }]);

    expect(componentsOf(result.schema)[0]?.conditional).toEqual(conditional);
  });
});

describe('nesting', () => {
  it('reaches components inside panels, columns and table cells', async () => {
    const address = { type: 'address', key: 'a', input: true };
    const result = await run([
      { type: 'panel', key: 'p', components: [address] },
      { type: 'columns', key: 'c', columns: [{ width: 6, components: [{ ...address, key: 'b' }] }] },
      { type: 'table', key: 't', rows: [[{ components: [{ ...address, key: 'c2' }] }]] },
    ]);

    expect(result.changes.map((change) => change.rule)).toEqual([
      'address-to-fields',
      'address-to-fields',
      'address-to-fields',
    ]);
  });

  it('reports the path a form author would recognise', async () => {
    const result = await run([
      {
        type: 'datagrid',
        key: 'lines',
        input: true,
        components: [{ type: 'address', key: 'site', input: true }],
      },
    ]);

    expect(result.changes[0]?.path).toBe('lines.site');
  });
});

describe('version stamping', () => {
  it('takes the highest version any component needs', async () => {
    const result = await run(
      [
        { type: 'textfield', key: 'a', input: true },
        { type: 'signature', key: 's', input: true },
        { type: 'file', key: 'f', input: true },
      ],
      { minAppVersionByType: { signature: '2.10.0', file: '2.9.0' } }
    );

    expect(result.minAppVersion).toBe('2.10.0');
  });

  it('leaves it unset when nothing in the form needs a floor', async () => {
    const result = await run([{ type: 'textfield', key: 'a', input: true }], { minAppVersionByType: {} });
    expect(result.minAppVersion).toBeUndefined();
  });
});

describe('robustness', () => {
  it('returns an empty form rather than throwing on nonsense', async () => {
    for (const input of [null, undefined, 42, 'a schema', []]) {
      const result = await transformSchema(input);
      expect(result.schema).toEqual({ components: [] });
    }
  });

  it('skips entries that are not components', async () => {
    const result = await run([null, 7, { type: 'textfield', key: 'a', input: true }]);
    expect(componentsOf(result.schema)).toHaveLength(1);
  });

  it('keeps the original for reference and stamps the version', async () => {
    const source = { components: [{ type: 'address', key: 'a', input: true }] };
    const result = await transformSchema(source);

    expect(result.source).toBe(source);
    expect(result.transformVersion).toBe(TRANSFORM_VERSION);
    // The original must not be mutated — the backend stores it alongside the transformed copy.
    expect(source.components[0]?.type).toBe('address');
  });

  it('warns about a type it has never heard of and leaves it for the device fallback', async () => {
    const result = await run([{ type: 'quantumField', key: 'q', input: true }]);

    expect(result.changes[0]).toMatchObject({ rule: 'unknown-type', severity: 'warning' });
    expect(componentsOf(result.schema)[0]?.type).toBe('quantumField');
  });

  it('produces output the renderer parses back to the same shape', async () => {
    const result = await run([
      { type: 'address', key: 'site', label: 'Site', input: true },
      { type: 'tree', key: 'nested', input: true },
    ]);

    const form = parseForm(result.schema);
    expect(form.components.map((component) => component.key)).toEqual([
      'site',
      'site_lat',
      'site_lng',
      'nested_notice',
      'nested',
    ]);
    expect(form.issues.filter((entry) => entry.issue.severity === 'error')).toEqual([]);
  });
});
