// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { htmlBlocksHaveChrome, htmlToText, parseHtmlBlocks, assignHtmlBindPaths } from '../../src/engine/htmlBlocks';
import { parseForm } from '../../src/engine/parseForm';

describe('htmlToText', () => {
  it('keeps instructional copy and drops tags', () => {
    expect(htmlToText('<p>Wear <b>gloves</b>.</p>')).toBe('Wear gloves.');
  });
});

describe('parseHtmlBlocks', () => {
  it('draws an embedded image and skips a remote one', () => {
    const blocks = parseHtmlBlocks(
      `<img src="data:image/png;base64,abc"/><img src="https://example.com/logo.png"/>`
    );
    expect(blocks).toEqual([{ kind: 'image', imageUri: 'data:image/png;base64,abc' }]);
    expect(htmlBlocksHaveChrome(blocks)).toBe(true);
  });

  it('keeps a coloured banner', () => {
    const blocks = parseHtmlBlocks(
      `<div style="background-color: #F5821F; color: white; text-align: center; font-weight: bold;">AL TASNIM</div>`
    );
    expect(blocks).toEqual([
      {
        kind: 'banner',
        text: 'AL TASNIM',
        background: '#F5821F',
        color: '#FFFFFF',
        align: 'center',
        bold: true,
      },
    ]);
  });

  it('lays a flex letterhead out as a row: image beside stacked banners', () => {
    const blocks = parseHtmlBlocks(`
      <div style="display: flex;">
        <div style="background-color: white;"><img src="data:image/jpeg;base64,abc" alt="logo"/></div>
        <div>
          <div style="background-color: #F5821F; color: white; text-align: center; font-weight: bold;">AL TASNIM</div>
          <div style="background-color: #1E3A8A; color: white; text-align: center;">Inspection</div>
        </div>
      </div>
    `);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.kind).toBe('row');
    expect(blocks[0]?.children?.map((child) => child.kind)).toEqual(['image', 'stack']);
    expect(blocks[0]?.children?.[1]?.children?.map((child) => child.text)).toEqual([
      'AL TASNIM',
      'Inspection',
    ]);
  });

  it('does not treat a note as chrome, so the renderer can keep the flattened text', () => {
    const html = `<div style="margin-top:10px;font-size:12px;"><strong>Note:</strong> SE-Site Engineer</div>`;
    expect(htmlBlocksHaveChrome(parseHtmlBlocks(html))).toBe(false);
    expect(htmlToText(html)).toContain('Note:');
  });

  it('draws an HTML table with named inputs as native fields', () => {
    const blocks = parseHtmlBlocks(`
      <table>
        <tr><th>Name</th><th>Date</th></tr>
        <tr>
          <td><input name="data[calibratedName]" placeholder="Name"></td>
          <td><input type="date" name="data[calibratedDate]"></td>
        </tr>
      </table>
    `);
    expect(htmlBlocksHaveChrome(blocks)).toBe(true);
    expect(blocks[0]?.kind).toBe('table');
    const body = blocks[0]?.rows?.[1] ?? [];
    expect(body.map((cell) => cell.bindPath)).toEqual(['calibratedName', 'calibratedDate']);
    expect(body.map((cell) => cell.fieldType)).toEqual(['text', 'date']);
  });

  it('recovers a Form.io radio assignment without running the onclick', () => {
    const blocks = parseHtmlBlocks(
      `<input type="radio" name="q1_radio" onclick="Formio.getForm().submission.data.q1='yes'"/>`
    );
    expect(blocks).toEqual([{ kind: 'radio', bindPath: 'q1', radioValue: 'yes' }]);
  });

  it('assigns a stable path to an unnamed input under the owning key', () => {
    const blocks = assignHtmlBindPaths(
      parseHtmlBlocks(`<input type="text"><input type="text">`),
      'readings'
    );
    expect(blocks.map((block) => block.bindPath)).toEqual(['readings__f1', 'readings__f2']);
  });
});

describe('grid flags', () => {
  it('defaults a datagrid to a table and an editgrid to cards', () => {
    const form = parseForm({
      components: [
        { type: 'datagrid', key: 'lines', input: true, components: [] },
        { type: 'editgrid', key: 'entries', input: true, components: [] },
        { type: 'datagrid', key: 'cards', input: true, displayAsTable: false, components: [] },
      ],
    });
    expect(form.components.map((component) => component.grid?.displayAsTable)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('hides add and remove when the author locked the rows', () => {
    const locked = parseForm({
      components: [
        {
          type: 'datagrid',
          key: 'lines',
          input: true,
          addAnother: false,
          editable: false,
          components: [],
        },
      ],
    }).components[0]?.grid;

    expect(locked).toMatchObject({ allowAdd: false, allowRemove: false, addLabel: 'Add Another' });
  });

  it('hides only add when addAnother is false', () => {
    const grid = parseForm({
      components: [{ type: 'datagrid', key: 'lines', input: true, addAnother: false, components: [] }],
    }).components[0]?.grid;

    expect(grid).toMatchObject({ allowAdd: false, allowRemove: true });
  });
});
