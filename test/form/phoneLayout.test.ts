// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { parseHtmlBlocks, type HtmlBlock } from '../../src/engine/htmlBlocks';
import { parseFormComponents } from '../../src/engine/parseForm';
import type { FormComponent } from '../../src/engine/types';
import { htmlPlainText, isCrowdedHtmlTable, planPhoneHtmlTable } from '../../src/form/phoneHtmlTable';
import {
  flattenPhoneFlow,
  groupPhoneBlocks,
  isPhoneWidth,
  pairPhoneItems,
  phoneComponent,
  phoneFit,
  phoneRecordFields,
  phoneRecordHeading,
  subtreeOwnsPath,
  type PhoneLine,
  type PhonePlanOptions,
} from '../../src/form/phoneLayout';

/** The phone layout as data — docs/FORMS.md §8. What goes where, with no view tree involved. */

const text = (key: string, extra: Record<string, unknown> = {}) => ({
  type: 'textfield',
  key,
  label: key,
  input: true,
  ...extra,
});
const number = (key: string, extra: Record<string, unknown> = {}) => ({
  type: 'number',
  key,
  label: key,
  input: true,
  ...extra,
});
const columns = (key: string, width: number, children: unknown[]) => ({
  type: 'columns',
  key,
  columns: children.map((child) => ({ width, size: 'md', components: [child] })),
});

const plain: PhonePlanOptions = {
  data: {},
  isHostDrawn: () => false,
  hasOverride: () => false,
};

const one = (schema: unknown): FormComponent => {
  const [component] = parseFormComponents([schema]);
  if (!component) throw new Error('schema parsed to nothing');
  return component;
};

const flow = (schema: unknown[], options: PhonePlanOptions = plain) =>
  flattenPhoneFlow(parseFormComponents(schema), { parentPath: '' }, options);

/** Each row of the layout as the keys it holds: `['a', 'b']` is a pair, `['c']` a full row. */
const rowsOf = (lines: PhoneLine[]): string[][] =>
  lines.map((line) =>
    line.kind === 'pair' ? [line.left.component.key, line.right.component.key] : [line.item.component.key]
  );

const layout = (schema: unknown[], options?: PhonePlanOptions) =>
  rowsOf(pairPhoneItems(flow(schema, options)));

describe('the breakpoint', () => {
  it('is exclusive: the phone layout ends where the breakpoint starts', () => {
    expect(isPhoneWidth(599, 600)).toBe(true);
    expect(isPhoneWidth(600, 600)).toBe(false);
  });
});

describe('how much of a row a field may share', () => {
  it('calls a field short when its answer always is', () => {
    expect(phoneFit(one(number('qty')))).toBe('short');
    expect(phoneFit(one({ type: 'datetime', key: 'when', label: 'When', input: true }))).toBe('short');
    expect(phoneFit(one({ type: 'time', key: 'at', label: 'At', input: true }))).toBe('short');
  });

  it('lets single-line text share a row only where the author made room', () => {
    expect(phoneFit(one(text('name')))).toBe('row');
  });

  it('keeps long-form input on a row of its own', () => {
    expect(phoneFit(one({ type: 'textarea', key: 'notes', label: 'Notes', input: true }))).toBe('wide');
    expect(phoneFit(one({ type: 'signature', key: 'sig', label: 'Sign', input: true }))).toBe('wide');
    expect(phoneFit(one(number('qty', { multiple: true })))).toBe('wide');
  });

  it('judges a select by its longest choice', () => {
    const select = (labels: string[]) =>
      one({
        type: 'select',
        key: 'pick',
        label: 'Pick',
        input: true,
        data: { values: labels.map((label) => ({ label, value: label })) },
      });
    expect(phoneFit(select(['Yes', 'No', 'N/A']))).toBe('short');
    expect(phoneFit(select(['Yes', 'Not applicable to this permit']))).toBe('wide');
    // Choices that come from a URL or a resource have no length to judge.
    expect(phoneFit(select([]))).toBe('wide');
  });

  it('gives a field a full row when its label would not fit half of one', () => {
    const label = 'Number of personnel working inside the confined space';
    expect(phoneFit(one(number('crew', { label })))).toBe('wide');
  });
});

describe('rows of at most two', () => {
  it('pairs two short neighbours and never a third', () => {
    expect(layout([number('a'), number('b'), number('c')])).toEqual([['a', 'b'], ['c']]);
  });

  it('never moves a field to find it a partner', () => {
    expect(layout([number('a'), text('name'), number('b')])).toEqual([['a'], ['name'], ['b']]);
  });

  it('keeps loose text fields on rows of their own', () => {
    expect(layout([text('first'), text('last')])).toEqual([['first'], ['last']]);
  });

  it('folds a four-across row into two rows of two', () => {
    const row = columns('row', 3, [text('a'), text('b'), text('c'), text('d')]);
    expect(layout([row])).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('folds a three-across row into a pair and a single', () => {
    expect(layout([columns('row', 4, [text('a'), text('b'), text('c')])])).toEqual([['a', 'b'], ['c']]);
  });

  it('stacks text from half-width columns, which held more than half a phone row does', () => {
    expect(layout([columns('row', 6, [text('a'), text('b')])])).toEqual([['a'], ['b']]);
  });

  it('still pairs short fields from half-width columns', () => {
    expect(layout([columns('row', 6, [number('a'), number('b')])])).toEqual([['a', 'b']]);
  });

  it('does not pair a loose field into an authored row', () => {
    const row = columns('row', 4, [number('b'), number('c'), number('d')]);
    expect(layout([number('a'), row])).toEqual([['a'], ['b', 'c'], ['d']]);
  });

  it('plans around a field that is not drawn', () => {
    const row = columns('row', 4, [number('a'), number('gone', { hidden: true }), number('c')]);
    expect(layout([row])).toEqual([['a', 'c']]);
  });

  it('plans around a field whose condition fails, and brings it back when it passes', () => {
    const schema = [
      number('a'),
      number('b', { conditional: { show: true, when: 'a', eq: 1 } }),
      number('c'),
    ];
    expect(layout(schema)).toEqual([['a', 'c']]);
    expect(layout(schema, { ...plain, data: { a: 1 } })).toEqual([['a', 'b'], ['c']]);
  });

  it('gives a host-drawn field a full row, since its size is the host’s business', () => {
    const options = { ...plain, isHostDrawn: (component: FormComponent) => component.key === 'b' };
    expect(layout([number('a'), number('b')], options)).toEqual([['a'], ['b']]);
  });

  it('hoists a one-row table into the flow as an authored row', () => {
    const table = {
      type: 'table',
      key: 'grid',
      rows: [[{ components: [text('a')] }, { components: [text('b')] }, { components: [text('c')] }]],
    };
    expect(layout([table])).toEqual([['a', 'b'], ['c']]);
  });

  it('keeps a table of several rows whole, to be drawn as one card per row', () => {
    const table = {
      type: 'table',
      key: 'grid',
      rows: [
        [{ components: [text('a')] }, { components: [text('b')] }],
        [{ components: [text('c')] }, { components: [text('d')] }],
      ],
    };
    expect(layout([table])).toEqual([['grid']]);
  });

  it('leaves out a component that draws nothing', () => {
    expect(layout([number('a'), { type: 'button', key: 'submit', label: 'Submit' }, number('b')])).toEqual([
      ['a', 'b'],
    ]);
  });
});

describe('data scope', () => {
  it('hoists a container’s fields with the path they had inside it', () => {
    const items = flow([{ type: 'container', key: 'site', input: true, components: [text('city')] }]);
    expect(items.map((item) => [item.component.key, item.scope.parentPath])).toEqual([['city', 'site']]);
  });

  it('leaves the scope alone through layout, which owns no data', () => {
    const items = flow([columns('row', 6, [text('a'), text('b')])]);
    expect(items.map((item) => item.scope.parentPath)).toEqual(['', '']);
  });
});

describe('cards', () => {
  const panel = { type: 'panel', key: 'details', title: 'Details', components: [text('inside')] };
  const dataGrid = { type: 'datagrid', key: 'rows', label: 'Rows', input: true, components: [text('cell')] };
  const editGrid = { type: 'editgrid', key: 'crew', label: 'Crew', input: true, components: [text('name')] };

  const blocks = (schema: unknown[], options: PhonePlanOptions = plain) =>
    groupPhoneBlocks(flow(schema, options)).map((block) =>
      block.kind === 'standalone' ? block.item.component.key : rowsOf(block.lines)
    );

  it('gathers each run of loose fields into one untitled card', () => {
    expect(blocks([text('a'), text('b'), panel, text('c')])).toEqual([[['a'], ['b']], 'details', [['c']]]);
  });

  it('lets a data grid stand alone, as a section of record cards', () => {
    expect(blocks([text('a'), dataGrid])).toEqual([[['a']], 'rows']);
  });

  it('keeps an edit grid inside a card: its rows are one-line summaries, not cards', () => {
    expect(blocks([text('a'), editGrid])).toEqual([[['a'], ['crew']]]);
  });

  it('lets a host-drawn grid stand alone with whatever chrome the host gave it', () => {
    const options = { ...plain, hasOverride: (component: FormComponent) => component.key === 'crew' };
    expect(blocks([text('a'), editGrid], options)).toEqual([[['a']], 'crew']);
  });
});

describe('the component a phone draws', () => {
  it('moves every label above its control', () => {
    const authored = one(text('name', { labelPosition: 'left-left' }));
    expect(authored.field.labelPosition).not.toBe('top');
    expect(phoneComponent(authored).field.labelPosition).toBe('top');
  });

  it('hands back the same object each time, so a control is not re-rendered for nothing', () => {
    const authored = one(text('name', { labelPosition: 'left-left' }));
    expect(phoneComponent(authored)).toBe(phoneComponent(authored));
  });

  it('runs short radio options inline and stacks long ones', () => {
    const radio = (labels: string[]) =>
      one({
        type: 'radio',
        key: 'pick',
        label: 'Pick',
        input: true,
        values: labels.map((label) => ({ label, value: label })),
      });
    expect(phoneComponent(radio(['Yes', 'No', 'N/A'])).field.inline).toBe(true);
    expect(phoneComponent(radio(['Yes', 'Only with a supervisor present'])).field.inline).toBe(false);
  });

  it('always stacks select boxes', () => {
    const boxes = one({
      type: 'selectboxes',
      key: 'ppe',
      label: 'PPE',
      input: true,
      inline: true,
      values: [
        { label: 'Helmet', value: 'helmet' },
        { label: 'Gloves', value: 'gloves' },
      ],
    });
    expect(phoneComponent(boxes).field.inline).toBe(false);
  });
});

describe('record cards', () => {
  const certificates = one({
    type: 'datagrid',
    key: 'certificates',
    label: 'Certificates',
    input: true,
    addAnother: 'Add Certificate',
    components: [
      { type: 'checkbox', key: 'required', label: ' ', input: true },
      text('type', { label: 'Type', disabled: true }),
      { type: 'datetime', key: 'issued', label: 'Date and Time', input: true },
    ],
  });

  it('names a record after the read-only text column that identifies it', () => {
    expect(phoneRecordHeading(certificates, { type: 'Hot Work' }, 0)).toEqual({
      caption: 'Type',
      title: 'Hot Work',
      titleKey: 'type',
    });
  });

  it('numbers a record that has nothing to be named after, using the noun from the add label', () => {
    expect(phoneRecordHeading(certificates, { type: '' }, 1)).toEqual({ title: 'Certificate #2' });
  });

  it('falls back to the grid label when the add label names nothing', () => {
    const grid = one({
      type: 'datagrid',
      key: 'quantities',
      label: 'Quantities',
      input: true,
      components: [number('qty')],
    });
    expect(phoneRecordHeading(grid, {}, 0)).toEqual({ title: 'Quantities #1' });
  });

  it('does not repeat the heading column in the body, and drops the unlabelled tick column', () => {
    const heading = phoneRecordHeading(certificates, { type: 'Hot Work' }, 0);
    expect(phoneRecordFields(certificates, heading).map((child) => child.key)).toEqual(['issued']);
  });

  it('keeps the heading column as a field when the row has no value to be named after', () => {
    const heading = phoneRecordHeading(certificates, {}, 0);
    expect(phoneRecordFields(certificates, heading).map((child) => child.key)).toEqual(['type', 'issued']);
  });

  it('keeps an unlabelled tick box the form cannot be submitted without', () => {
    const grid = one({
      type: 'datagrid',
      key: 'checks',
      label: 'Checks',
      input: true,
      components: [
        { type: 'checkbox', key: 'done', label: ' ', input: true, validate: { required: true } },
        number('qty'),
      ],
    });
    const heading = phoneRecordHeading(grid, {}, 0);
    expect(phoneRecordFields(grid, heading).map((child) => child.key)).toEqual(['done', 'qty']);
  });
});

describe('an HTML table of inputs', () => {
  const tableRows = (html: string): HtmlBlock[][] => {
    const table = parseHtmlBlocks(html).find((block) => block.kind === 'table');
    if (!table?.rows) throw new Error('no table parsed');
    return table.rows;
  };
  const input = (name: string) => `<td><input type="text" name="data[${name}]"></td>`;

  const readings = tableRows(`
    <table>
      <tr><th colspan="2">Temperature</th><th colspan="2">Deviation</th></tr>
      <tr><th>Up</th><th>Down</th><th>Up</th><th>Down</th></tr>
      <tr>${input('tu1')}${input('td1')}${input('du1')}${input('dd1')}</tr>
      <tr>${input('tu2')}${input('td2')}${input('du2')}${input('dd2')}</tr>
    </table>`);

  const signOff = tableRows(`
    <table>
      <tr><th></th><th>Inspector</th><th>Supervisor</th><th>Client</th></tr>
      <tr><td>Name:</td>${input('n1')}${input('n2')}${input('n3')}</tr>
      <tr><td>Remarks:</td><td><textarea name="data[r1]"></textarea></td><td><textarea name="data[r2]"></textarea></td><td><textarea name="data[r3]"></textarea></td></tr>
    </table>`);

  const shape = (rows: HtmlBlock[][]) =>
    planPhoneHtmlTable(rows).map((row) =>
      row.kind === 'text'
        ? row.cells.map(htmlPlainText)
        : {
            title: row.card.title,
            lines: row.card.lines.map((line) =>
              line.kind === 'pair' ? [line.left.label, line.right.label] : [line.field.label]
            ),
          }
    );

  it('is left as a table while no row holds more than two inputs', () => {
    expect(
      isCrowdedHtmlTable(tableRows(`<table><tr><td>Name</td>${input('a')}<td>Date</td>${input('b')}</tr></table>`))
    ).toBe(false);
    expect(isCrowdedHtmlTable(readings)).toBe(true);
  });

  it('does not count radios: a row of them is one question, not several fields', () => {
    const radio = (value: string) => `<td><input type="radio" name="data[q1]" value="${value}"></td>`;
    expect(
      isCrowdedHtmlTable(tableRows(`<table><tr><td>Safe?</td>${radio('yes')}${radio('no')}${radio('na')}</tr></table>`))
    ).toBe(false);
  });

  it('turns each body row into a card of rows of two', () => {
    expect(shape(readings)).toEqual([
      {
        title: '',
        lines: [
          ['Temperature · Up', 'Temperature · Down'],
          ['Deviation · Up', 'Deviation · Down'],
        ],
      },
      {
        title: '',
        lines: [
          ['Temperature · Up', 'Temperature · Down'],
          ['Deviation · Up', 'Deviation · Down'],
        ],
      },
    ]);
  });

  it('names a card after the text its row began with, and gives long inputs a row each', () => {
    expect(shape(signOff)).toEqual([
      { title: 'Name:', lines: [['Inspector', 'Supervisor'], ['Client']] },
      { title: 'Remarks:', lines: [['Inspector'], ['Supervisor'], ['Client']] },
    ]);
  });

  it('keeps a row of plain text as text', () => {
    const rows = tableRows(`
      <table>
        <tr><th>A</th><th>B</th><th>C</th></tr>
        <tr><td colspan="3">Readings taken at ambient temperature</td></tr>
        <tr>${input('a')}${input('b')}${input('c')}</tr>
      </table>`);
    expect(shape(rows)).toEqual([
      ['Readings taken at ambient temperature'],
      { title: '', lines: [['A', 'B'], ['C']] },
    ]);
  });

  it('finds the heading over an input that sits beside a heading spanning two rows', () => {
    const rows = tableRows(`
      <table>
        <tr><th rowspan="2">Point</th><th colspan="2">Reading</th></tr>
        <tr><th>Up</th><th>Down</th></tr>
        <tr>${input('p')}${input('u')}${input('d')}</tr>
      </table>`);
    expect(shape(rows)).toEqual([{ title: '', lines: [['Point', 'Reading · Up'], ['Reading · Down']] }]);
  });
});

describe('finding the card that holds a path', () => {
  const tree = parseFormComponents([
    columns('row', 6, [text('a'), text('b')]),
    { type: 'container', key: 'site', input: true, components: [text('city')] },
    { type: 'datagrid', key: 'rows', label: 'Rows', input: true, components: [text('cell')] },
  ]);

  it('finds a field through layout that owns no data', () => {
    expect(subtreeOwnsPath(tree, '', ['b'])).toBe(true);
  });

  it('finds a field inside a container and a cell inside a grid row', () => {
    expect(subtreeOwnsPath(tree, '', ['site.city'])).toBe(true);
    expect(subtreeOwnsPath(tree, '', ['rows[3].cell'])).toBe(true);
  });

  it('is not fooled by a key that merely starts the same', () => {
    expect(subtreeOwnsPath(tree, '', ['rowsExtra'])).toBe(false);
    expect(subtreeOwnsPath(tree, '', ['elsewhere'])).toBe(false);
    expect(subtreeOwnsPath(tree, '', [])).toBe(false);
  });
});
