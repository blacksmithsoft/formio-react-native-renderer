// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { COMPONENT_REGISTRY, describeCoverage, lookupControl } from '../../src/form/registry';
import type { FormComponent } from '../../src/engine/types';
import { hostNodes, styleOf } from '../support/render';
import { mount } from './support';

/** Layer 2 — the editable renderer. docs/FORMS.md §6 and §8. */

const textfield = (key: string, extra: Record<string, unknown> = {}) => ({
  type: 'textfield',
  key,
  label: key,
  input: true,
  ...extra,
});

describe('editing', () => {
  it('writes what the user types into the submission', () => {
    const view = mount({ components: [textfield('name')] });
    view.type(0, 'Ali');
    expect(view.handle().getData()).toEqual({ name: 'Ali' });
  });

  it('stores a number field as a number', () => {
    const view = mount({ components: [{ type: 'number', key: 'qty', label: 'Qty', input: true }] });
    view.type(0, '12');
    expect(view.handle().getData()).toEqual({ qty: 12 });
  });

  it('keeps the decimal point visible while it is being typed', () => {
    // Parsing on every keystroke makes a decimal impossible to enter: `1.` parses to `1`, the
    // value written back is `1`, and the point vanishes from under the cursor.
    const view = mount({ components: [{ type: 'number', key: 'qty', label: 'Qty', input: true }] });
    const input = view.inputs()[0];
    act(() => input?.props.onChangeText('1.'));
    expect(view.inputs()[0]?.props.value).toBe('1.');
    expect(view.handle().getData()).toEqual({});

    act(() => view.inputs()[0]?.props.onBlur());
    expect(view.handle().getData()).toEqual({ qty: 1 });
  });

  it('stores a value that is not a number as text, so validation can report it', () => {
    const view = mount({ components: [{ type: 'number', key: 'qty', label: 'Qty', input: true }] });
    view.type(0, 'twelve');
    expect(view.handle().getData()).toEqual({ qty: 'twelve' });
    expect(view.run((h) => h.submit())).toBeNull();
    expect(view.texts()).toContain('Qty must be a number.');
  });

  it('scopes a container field to its own path', () => {
    const view = mount({
      components: [
        { type: 'container', key: 'site', label: 'Site', input: true, components: [textfield('city')] },
      ],
    });
    view.type(0, 'Doha');
    expect(view.handle().getData()).toEqual({ site: { city: 'Doha' } });
  });

  it('takes no input when read-only', () => {
    const view = mount({ components: [textfield('name')] }, { readOnly: true });
    expect(view.inputs()[0]?.props.editable).toBe(false);
  });
});

describe('conditionals', () => {
  const schema = {
    components: [
      textfield('hasIncident'),
      textfield('detail', { conditional: { show: true, when: 'hasIncident', eq: 'yes' } }),
    ],
  };

  it('draws a conditionally hidden field only once its condition passes', () => {
    const view = mount(schema);
    expect(view.inputs()).toHaveLength(1);
    view.type(0, 'yes');
    expect(view.inputs()).toHaveLength(2);
  });

  it('clears the value of a field the user hides again', () => {
    const view = mount(schema);
    view.type(0, 'yes');
    view.type(1, 'a scaffold fell');
    expect(view.handle().getData()).toEqual({ hasIncident: 'yes', detail: 'a scaffold fell' });

    view.type(0, 'no');
    expect(view.handle().getData()).toEqual({ hasIncident: 'no' });
  });
});

describe('unsupported components', () => {
  it('renders a visible warning and still captures the answer for an unknown simple type', () => {
    const view = mount({
      components: [{ type: 'somethingNew', key: 'novel', label: 'Novel', input: true }],
    });

    expect(view.texts().join(' ')).toContain('somethingNew');
    expect(view.texts().join(' ')).toContain('Field: novel');
    // Degraded, not blocked — a warning must not strand a worker who cannot edit the schema.
    expect(view.handle().getBlockingIssues()).toHaveLength(0);

    view.type(0, 'captured anyway');
    expect(view.handle().getData()).toEqual({ novel: 'captured anyway' });
  });

  it('blocks submission for a component carrying custom JavaScript', () => {
    const view = mount({
      components: [textfield('a', { customConditional: 'show = data.b === 1' })],
    });

    expect(view.texts().join(' ')).toContain('This form cannot be submitted');
    expect(view.handle().getBlockingIssues()).toHaveLength(1);
    expect(view.run((h) => h.submit())).toBeNull();
  });

  it('blocks and refuses to guess at a banned nesting type', () => {
    const view = mount({
      components: [{ type: 'tree', key: 'hierarchy', label: 'Hierarchy', input: true }],
    });
    expect(view.handle().getBlockingIssues()).toHaveLength(1);
    expect(view.inputs()).toHaveLength(0);
  });

  it('reports what it could not draw, so somebody learns about it', () => {
    const telemetry = vi.fn();
    mount(
      {
        components: [
          { type: 'somethingNew', key: 'novel', label: 'Novel', input: true },
          textfield('a', { customConditional: 'show = true' }),
        ],
      },
      { telemetry }
    );

    expect(telemetry.mock.calls.map(([event]) => [event.path, event.type])).toEqual([
      ['novel', 'unknown-type'],
      ['a', 'custom-javascript'],
    ]);
  });

  it('reports each form once, not once per keystroke', () => {
    const telemetry = vi.fn();
    const view = mount(
      { components: [{ type: 'somethingNew', key: 'novel', label: 'Novel', input: true }] },
      { telemetry }
    );

    view.type(0, 'a');
    view.type(0, 'ab');
    expect(telemetry).toHaveBeenCalledTimes(1);
  });

  it('never throws on a schema that is not a form at all', () => {
    expect(() => mount(null)).not.toThrow();
    expect(() => mount({ components: 'nonsense' })).not.toThrow();
    expect(() => mount({ components: [null, 42, { type: 'textfield' }] })).not.toThrow();
  });
});

describe('validation and the imperative handle', () => {
  const schema = {
    components: [
      textfield('name', { validate: { required: true } }),
      textfield('email', { type: 'email', validate: {} }),
    ],
  };

  it('shows no errors before the user has touched anything', () => {
    const view = mount(schema);
    expect(view.texts()).not.toContain('name is required');
  });

  it('reveals every error when validation fails, and refuses to submit', () => {
    const view = mount(schema);
    expect(view.run((h) => h.submit())).toBeNull();
    expect(view.texts()).toContain('name is required');
  });

  it('submits once the form is valid', () => {
    const view = mount(schema);
    view.type(0, 'Ali');
    const submission = view.run((h) => h.submit());
    expect(submission).toEqual({ data: { name: 'Ali' } });
  });

  it('resets to defaults', () => {
    const view = mount({ components: [textfield('name', { defaultValue: 'seed' })] });
    view.type(0, 'changed');
    view.run((h) => h.reset());
    expect(view.handle().getData()).toEqual({ name: 'seed' });
  });
});

describe('choices', () => {
  it('ticks and unticks a checkbox', () => {
    const view = mount({
      components: [{ type: 'checkbox', key: 'agree', label: 'Agree', input: true }],
    });
    expect(view.handle().getData()).toEqual({ agree: false });
    view.press('Agree');
    expect(view.handle().getData()).toEqual({ agree: true });
    view.press('Agree');
    expect(view.handle().getData()).toEqual({ agree: false });
  });

  it('writes the whole selectboxes map, including the unticked options', () => {
    const view = mount({
      components: [
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
      ],
    });
    view.press('Hat');
    expect(view.handle().getData()).toEqual({ ppe: { hat: true, vest: false } });
  });

  it('opens a select inline and picks an option when the host has no picker', () => {
    const view = mount({
      components: [
        {
          type: 'select',
          key: 'status',
          label: 'Status',
          input: true,
          data: {
            values: [
              { label: 'Open', value: 'open' },
              { label: 'Closed', value: 'closed' },
            ],
          },
        },
      ],
    });

    expect(view.texts()).not.toContain('Closed');
    view.press(0);
    expect(view.texts()).toContain('Closed');
    view.press('Closed');
    expect(view.handle().getData()).toEqual({ status: 'closed' });
  });

  it('uses the host picker when one is supplied', async () => {
    const pickOption = vi.fn().mockResolvedValue('closed');
    const view = mount(
      {
        components: [
          {
            type: 'select',
            key: 'status',
            label: 'Status',
            input: true,
            data: { values: [{ label: 'Closed', value: 'closed' }] },
          },
        ],
      },
      { adapters: { pickOption } }
    );

    view.press(0);
    await act(async () => undefined);
    expect(pickOption).toHaveBeenCalled();
    expect(view.handle().getData()).toEqual({ status: 'closed' });
  });
});

describe('data grid', () => {
  const schema = {
    components: [
      {
        type: 'datagrid',
        key: 'lines',
        label: 'Lines',
        input: true,
        components: [textfield('qty')],
      },
    ],
  };

  it('opens with one row and adds another on demand', () => {
    const view = mount(schema);
    expect(view.inputs()).toHaveLength(1);
    view.press('Add Another');
    expect(view.inputs()).toHaveLength(2);
  });

  it('keeps every row value at its own path', () => {
    const view = mount(schema);
    view.press('Add Another');
    view.type(0, 'first');
    view.type(1, 'second');
    expect(view.handle().getData()).toEqual({ lines: [{ qty: 'first' }, { qty: 'second' }] });
  });

  it('renumbers the rows after a removal', () => {
    const view = mount(schema);
    view.press('Add Another');
    view.type(0, 'first');
    view.type(1, 'second');
    view.press('Remove 1');
    expect(view.handle().getData()).toEqual({ lines: [{ qty: 'second' }] });
  });

  it('draws a datagrid as a table even without the flag', () => {
    const view = mount({
      components: [
        {
          type: 'datagrid',
          key: 'lines',
          label: 'Lines',
          input: true,
          components: [textfield('qty'), textfield('length')],
        },
      ],
    });
    expect(view.texts()).not.toContain('1 of 1');
    expect(view.texts().filter((text) => text === 'qty')).toHaveLength(1);
  });

  it('hides add and remove when the rows are locked', () => {
    const view = mount({
      components: [
        {
          type: 'datagrid',
          key: 'lines',
          label: 'Lines',
          input: true,
          addAnother: false,
          editable: false,
          defaultValue: [{ qty: '1' }],
          components: [textfield('qty')],
        },
      ],
    });
    expect(view.texts()).not.toContain('Add Another');
    expect(view.pressables().some((node) => node.props.accessibilityLabel?.startsWith('Remove'))).toBe(
      false
    );
    expect(view.inputs()).toHaveLength(1);
  });

  it('validates each row independently', () => {
    const view = mount({
      components: [
        {
          type: 'datagrid',
          key: 'lines',
          label: 'Lines',
          input: true,
          components: [textfield('qty', { validate: { required: true } })],
        },
      ],
    });
    view.press('Add Another');
    view.type(0, 'filled');
    expect(view.run((h) => h.submit())).toBeNull();
    expect(view.texts().filter((text) => text === 'qty is required')).toHaveLength(1);
  });
});

describe('data grid as a table', () => {
  const tableSchema = (extra: Record<string, unknown> = {}) => ({
    components: [
      {
        type: 'datagrid',
        key: 'lines',
        label: 'Quantities Table',
        input: true,
        displayAsTable: true,
        components: [textfield('qty'), textfield('length')],
        ...extra,
      },
    ],
  });

  /** Every column's rendered width: the header cells and the body cells alike. */
  const columnWidths = (view: ReturnType<typeof mount>): number[] =>
    hostNodes(view.renderer, 'View')
      .map((node) => styleOf(node))
      .filter((style) => typeof style.width === 'number' && style.paddingHorizontal !== undefined)
      .map((style) => style.width as number);

  it('labels the columns once in a header instead of once per row', () => {
    const view = mount(tableSchema());
    view.press('Add Another');

    expect(view.inputs()).toHaveLength(4);
    expect(view.texts().filter((text) => text === 'qty')).toHaveLength(1);
    expect(view.texts().filter((text) => text === 'length')).toHaveLength(1);
    // The per-row "1 of 2" heading belongs to the card layout, not to a table.
    expect(view.texts()).not.toContain('1 of 2');
  });

  it('still writes each row to its own path', () => {
    const view = mount(tableSchema());
    view.press('Add Another');
    view.type(0, '3');
    view.type(3, '12');

    expect(view.handle().getData()).toEqual({
      lines: [{ qty: '3' }, { length: '12' }],
    });
  });

  it('removes the row its button sits on', () => {
    const view = mount(tableSchema());
    view.press('Add Another');
    view.type(0, 'first');
    view.type(2, 'second');
    view.press('Remove 1');

    expect(view.handle().getData()).toEqual({ lines: [{ qty: 'second' }] });
  });

  it('shares the measured width between the columns when there is room for them', () => {
    const view = mount(tableSchema());
    view.measureTable(600);

    // (600 - the 44dp remove column) / 2, on the header cell and the body cell of each column.
    expect(columnWidths(view)).toEqual([278, 278, 278, 278]);
  });

  it('stays a table at any width, scrolling rather than falling back to cards', () => {
    const view = mount(tableSchema());
    view.measureTable(200);

    // Two columns at the 128dp floor plus the remove column overflow 200dp. The table keeps its
    // shape and lets the scroller deal with it — the card layout's row heading never appears.
    expect(columnWidths(view)).toEqual([128, 128, 128, 128]);
    expect(view.texts()).not.toContain('1 of 1');
    expect(view.texts().filter((text) => text === 'qty')).toHaveLength(1);
  });

  it('scrolls the errored column into view when a submit fails', () => {
    const view = mount(
      tableSchema({ components: [textfield('qty'), textfield('length', { validate: { required: true } })] })
    );
    view.measureTable(200);
    expect(view.scrolls()).toEqual([]);

    expect(view.run((h) => h.submit())).toBeNull();
    // The second column starts one clamped column-width in, and the vertical scroll alone would
    // have left it off the right edge.
    expect(view.scrolls()).toEqual([{ x: 128, animated: true }]);
  });

  it('leaves a grid without the flag as a stack of cards at any width', () => {
    const view = mount(tableSchema({ displayAsTable: false }));
    view.measure(900);

    expect(view.texts()).toContain('1 of 1');
  });

  it('draws a locked table as plain text rather than disabled inputs', () => {
    const view = mount(
      tableSchema({
        defaultValue: [{ qty: '4', length: 'a long note about this row' }],
      }),
      { readOnly: true }
    );

    expect(view.inputs()).toHaveLength(0);
    expect(view.texts()).toContain('4');
    expect(view.texts()).toContain('a long note about this row');
  });

  it('mounts only the on-screen rows of a long locked table', () => {
    const snapshot = { y: 0, height: 160 };
    const view = mount(
      tableSchema({
        defaultValue: Array.from({ length: 20 }, (_, index) => ({ qty: `r${index}` })),
      }),
      {
        readOnly: true,
        scrollMetrics: {
          subscribe: () => () => undefined,
          getSnapshot: () => snapshot,
        },
      }
    );
    view.measureTable(400);

    const values = view.texts().filter((text) => /^r\d+$/.test(text));
    expect(values.length).toBeGreaterThan(0);
    expect(values.length).toBeLessThan(20);
    expect(values).toContain('r0');
    expect(values).not.toContain('r19');
  });
});

describe('layout', () => {
  const columns = {
    components: [
      {
        type: 'columns',
        key: 'row',
        columns: [
          { width: 6, size: 'md', components: [textfield('left')] },
          { width: 6, size: 'md', components: [textfield('right')] },
        ],
      },
    ],
  };

  const spansOf = (view: ReturnType<typeof mount>) =>
    view.renderer.root
      .findAll((node) => (node.type as unknown as string) === 'View')
      .map((node) => styleOf(node).flexBasis)
      .filter(Boolean);

  it('honours the authored widths on a phone-width container', () => {
    const view = mount(columns);
    view.measure(390);
    expect(spansOf(view)).toEqual(['50%', '50%']);
  });

  it('honours them on a wide container too', () => {
    const view = mount(columns);
    view.measure(1024);
    expect(spansOf(view)).toEqual(['50%', '50%']);
  });

  it('puts four quarter-width columns on one row', () => {
    const view = mount({
      components: [
        {
          type: 'columns',
          key: 'row',
          columns: [
            { width: 3, size: 'md', components: [textfield('a')] },
            { width: 3, size: 'md', components: [textfield('b')] },
            { width: 3, size: 'md', components: [textfield('c')] },
            { width: 3, size: 'md', components: [textfield('d')] },
          ],
        },
      ],
    });
    view.measure(390);
    expect(spansOf(view)).toEqual(['25%', '25%', '25%', '25%']);
  });

  it('collapses a panel and hides its contents', () => {
    const view = mount({
      components: [
        {
          type: 'panel',
          key: 'details',
          title: 'Details',
          collapsible: true,
          components: [textfield('inside')],
        },
      ],
    });
    expect(view.inputs()).toHaveLength(1);
    view.press('Details');
    expect(view.inputs()).toHaveLength(0);
  });

  it('shows one tab at a time and marks the tab holding an error', () => {
    const view = mount({
      components: [
        {
          type: 'tabs',
          key: 'sections',
          components: [
            { key: 'one', label: 'One', components: [textfield('a')] },
            { key: 'two', label: 'Two', components: [textfield('b', { validate: { required: true } })] },
          ],
        },
      ],
    });

    expect(view.inputs()).toHaveLength(1);
    expect(view.run((h) => h.submit())).toBeNull();

    // The error is on the tab that is not open, so the only signal is the dot.
    const dots = view.renderer.root
      .findAll((node) => (node.type as unknown as string) === 'View')
      .filter((node) => styleOf(node).backgroundColor === '#DC3545');
    expect(dots.length).toBeGreaterThan(0);
  });

  it('omits mobile-hidden fields and tabs', () => {
    const view = mount({
      components: [
        textfield('visible'),
        textfield('webOnly', { mobileHidden: true }),
        {
          type: 'tabs',
          key: 'sections',
          components: [
            { key: 'shown', label: 'Shown', components: [textfield('inside')] },
            {
              key: 'webTab',
              label: 'Web tab',
              mobileHidden: true,
              components: [textfield('insideWebTab')],
            },
          ],
        },
      ],
    });

    expect(view.inputs()).toHaveLength(2);
    expect(
      view.renderer.root.findAllByProps({ accessibilityRole: 'tab' })
    ).toHaveLength(1);
  });

  it('stacks a table into cards rather than scrolling sideways', () => {
    const view = mount({
      components: [
        {
          type: 'table',
          key: 'grid',
          rows: [
            [{ components: [textfield('a')] }, { components: [textfield('b')] }],
            [{ components: [textfield('c')] }, { components: [textfield('d')] }],
          ],
        },
      ],
    });
    expect(view.inputs()).toHaveLength(4);
    const horizontal = view.renderer.root.findAll(
      (node) => (node.type as unknown as string) === 'ScrollView' && node.props.horizontal === true
    );
    expect(horizontal).toHaveLength(0);
  });

  it('draws instructional content as text', () => {
    const view = mount({
      components: [{ type: 'content', key: 'note', html: '<p>Wear <b>gloves</b>.</p>' }],
    });
    expect(view.texts()).toContain('Wear gloves.');
  });

  it('draws an embedded letterhead without a WebView', () => {
    const view = mount({
      components: [
        {
          type: 'htmlelement',
          key: 'header',
          content: `
            <div style="display: flex;">
              <div><img src="data:image/png;base64,abc" alt="logo"/></div>
              <div>
                <div style="background-color: #F5821F; color: white; text-align: center; font-weight: bold;">AL TASNIM</div>
                <div style="background-color: #1E3A8A; color: white; text-align: center;">Inspection</div>
              </div>
            </div>
          `,
        },
      ],
    });

    const images = hostNodes(view.renderer, 'Image');
    expect(images).toHaveLength(1);
    expect(images[0]?.props.source).toEqual({ uri: 'data:image/png;base64,abc' });
    expect(view.texts()).toContain('AL TASNIM');
    expect(view.texts()).toContain('Inspection');
    const backgrounds = hostNodes(view.renderer, 'View')
      .map((node) => styleOf(node).backgroundColor)
      .filter(Boolean);
    expect(backgrounds).toContain('#F5821F');
    expect(backgrounds).toContain('#1E3A8A');
  });

  it('draws an HTML signature table as native fields and writes their values', () => {
    const view = mount({
      components: [
        {
          type: 'htmlelement',
          key: 'signatureSection',
          content: `
            <table>
              <tr><th></th><th>ATNM QCI</th></tr>
              <tr>
                <td>Name:</td>
                <td><input name="data[qciName]" placeholder="Name" /></td>
              </tr>
            </table>
          `,
        },
      ],
    });
    expect(view.texts()).toContain('ATNM QCI');
    expect(view.inputs()).toHaveLength(1);
    view.type(0, 'Sara');
    expect(view.handle().getData()).toMatchObject({ qciName: 'Sara' });
  });

  it('writes a hidden key from an HTML radio that used a Form.io onclick', () => {
    const view = mount({
      components: [
        {
          type: 'htmlelement',
          key: 'yes',
          content: `<input type="radio" name="q1_radio" onclick="Formio.getForm().submission.data.q1='yes'"/>`,
        },
        { type: 'hidden', key: 'q1' },
      ],
    });
    view.press('yes');
    expect(view.handle().getData()).toMatchObject({ q1: 'yes' });
  });
});

describe('host overrides', () => {
  it('prefers an override by key over one by type', () => {
    const ByType = () => null;
    const ByKey = () => null;
    const component = {
      type: 'textfield',
      key: 'special',
      base: 'textfield',
      issues: [],
    } as unknown as FormComponent;

    expect(lookupControl(component, { byType: { textfield: ByType }, byKey: { special: ByKey } })).toBe(
      ByKey
    );
    expect(lookupControl(component, { byType: { textfield: ByType } })).toBe(ByType);
  });
});

describe('registry', () => {
  it('tags every entry with a release path', () => {
    for (const entry of describeCoverage()) {
      expect(typeof entry.otaSafe, entry.type).toBe('boolean');
    }
  });

  it('covers every Tier A type named in the spec', () => {
    const tierA = [
      'textfield',
      'textarea',
      'number',
      'currency',
      'checkbox',
      'radio',
      'selectboxes',
      'select',
      'email',
      'phoneNumber',
      'url',
      'datetime',
      'day',
      'time',
      'hidden',
      'button',
      'panel',
      'fieldset',
      'well',
      'columns',
      'container',
    ];
    for (const type of tierA) {
      expect(COMPONENT_REGISTRY[type], type).toBeDefined();
    }
  });

  it('covers every Tier B type named in the spec', () => {
    for (const type of ['datagrid', 'editgrid', 'file', 'signature', 'content', 'htmlelement', 'tabs', 'survey']) {
      expect(COMPONENT_REGISTRY[type], type).toBeDefined();
    }
  });
});
