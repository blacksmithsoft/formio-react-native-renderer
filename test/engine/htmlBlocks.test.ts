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

/** A header with the size we want to read back out of it. Only the first 24 bytes are parsed. */
function pngUri(width: number, height: number): string {
  const bytes = Buffer.alloc(24);
  bytes.writeUInt8(0x89, 0);
  bytes.write('PNG', 1, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

describe('parseHtmlBlocks', () => {
  it('draws an embedded image and skips a remote one', () => {
    const uri = pngUri(300, 100);
    const blocks = parseHtmlBlocks(`<img src="${uri}"/><img src="https://example.com/logo.png"/>`);
    expect(blocks).toEqual([{ kind: 'image', imageUri: uri, imageWidth: 300, imageHeight: 100 }]);
    expect(htmlBlocksHaveChrome(blocks)).toBe(true);
  });

  it('reads the pixel size out of a JPEG header, so width: auto has an aspect ratio', () => {
    // SOI, then a SOF0 frame header declaring 40 rows by 90 columns.
    const jpeg = Buffer.concat([
      Buffer.from([
        0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x28, 0x00, 0x5a, 0x03, 0x01, 0x22, 0x00,
      ]),
      Buffer.alloc(16),
    ]);
    const blocks = parseHtmlBlocks(
      `<img src="data:image/jpeg;base64,${jpeg.toString('base64')}" style="height: 80px; width: auto;"/>`
    );
    expect(blocks[0]).toMatchObject({ imageWidth: 90, imageHeight: 40, style: { height: 80 } });
    expect(blocks[0]?.style?.width).toBeUndefined();
  });

  it('keeps a coloured banner: the box paints, the line inside it carries the type', () => {
    const blocks = parseHtmlBlocks(
      `<div style="background-color: #F5821F; color: white; text-align: center; font-weight: bold; padding: 15px; font-size: 24px;">AL TASNIM</div>`
    );
    expect(blocks).toEqual([
      {
        kind: 'box',
        style: {
          background: '#F5821F',
          padding: { top: 15, right: 15, bottom: 15, left: 15 },
        },
        children: [
          {
            kind: 'text',
            text: 'AL TASNIM',
            style: {
              color: '#FFFFFF',
              align: 'center',
              bold: true,
              fontSize: 24,
              lineHeight: 31.2,
            },
          },
        ],
      },
    ]);
  });

  it('sizes a flex letterhead the way the author asked: logo to its contents, banners to the rest', () => {
    const blocks = parseHtmlBlocks(`
      <div style="display: flex; align-items: stretch;">
        <div style="background-color: white; padding: 10px;"><img src="${pngUri(100, 80)}" style="height: 80px; width: auto;"/></div>
        <div style="flex: 1;">
          <div style="background-color: #F5821F; color: white; text-align: center; font-weight: bold;">AL TASNIM</div>
          <div style="background-color: #1E3A8A; color: white; text-align: center;">Inspection</div>
        </div>
      </div>
    `);

    expect(blocks).toHaveLength(1);
    const row = blocks[0];
    expect(row?.style).toMatchObject({ row: true, alignItems: 'stretch' });

    const [logo, banners] = row?.children ?? [];
    // The logo cell asked for nothing, so it must not be given half the row.
    expect(logo?.style?.grow).toBeUndefined();
    expect(logo?.style).toMatchObject({ background: '#FFFFFF' });
    expect(logo?.children?.[0]).toMatchObject({ kind: 'image', style: { height: 80 } });

    expect(banners?.style).toMatchObject({ grow: 1 });
    expect(banners?.children?.map((child) => child.children?.[0]?.text)).toEqual([
      'AL TASNIM',
      'Inspection',
    ]);
  });

  it('keeps a stray character beside the image it follows instead of under it', () => {
    const blocks = parseHtmlBlocks(
      `<div style="display: flex; align-items: center;"><img src="${pngUri(10, 10)}"/>></div>`
    );
    expect(blocks[0]?.style).toMatchObject({ row: true, alignItems: 'center' });
    expect(blocks[0]?.children?.map((child) => child.kind)).toEqual(['image', 'text']);
    expect(blocks[0]?.children?.[1]?.text).toBe('>');
  });

  it('keeps inline content on one line, with the bold run marked', () => {
    const blocks = parseHtmlBlocks(
      `<div style="background: #EEE;"><strong>Note:</strong> SE-Site Engineer</div>`
    );
    expect(blocks[0]?.children).toEqual([
      {
        kind: 'text',
        text: 'Note: SE-Site Engineer',
        spans: [{ text: 'Note:', style: { bold: true } }, { text: ' SE-Site Engineer' }],
      },
    ]);
  });

  it('breaks the line where the author put a block, and only there', () => {
    const blocks = parseHtmlBlocks(`<div>one <span>and a half</span><div>two</div>three</div>`);
    expect(blocks[0]?.children?.map((block) => block.text)).toEqual([
      'one and a half',
      'two',
      'three',
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
    const head = blocks[0]?.rows?.[0] ?? [];
    expect(head.map((cell) => cell.header)).toEqual([true, true]);
    expect(head.map((cell) => cell.children?.[0]?.style?.bold)).toEqual([true, true]);

    const body = (blocks[0]?.rows?.[1] ?? []).map((cell) => cell.children?.[0]);
    expect(body.map((field) => field?.bindPath)).toEqual(['calibratedName', 'calibratedDate']);
    expect(body.map((field) => field?.fieldType)).toEqual(['text', 'date']);
  });

  it('closes a cell the author left open rather than swallowing the rest of the table', () => {
    const blocks = parseHtmlBlocks(`<table><tr><td>a<td>b</tr><tr><td>c</td><td>d</td></tr></table>`);
    expect(blocks[0]?.rows?.map((row) => row.map((cell) => cell.children?.[0]?.text))).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('honours the cell styles the author set', () => {
    const blocks = parseHtmlBlocks(
      `<table><tr><td colspan="2" style="border: 1px solid black; padding: 4px 8px; background: #EEE;">a</td></tr></table>`
    );
    expect(blocks[0]?.rows?.[0]?.[0]).toMatchObject({
      colspan: 2,
      style: {
        background: '#EEEEEE',
        padding: { top: 4, right: 8, bottom: 4, left: 8 },
        borderWidth: { top: 1, right: 1, bottom: 1, left: 1 },
        borderColor: { top: '#000000', right: '#000000', bottom: '#000000', left: '#000000' },
      },
    });
  });

  it('recovers a Form.io radio assignment without running the onclick', () => {
    const blocks = parseHtmlBlocks(
      `<input type="radio" name="q1_radio" onclick="Formio.getForm().submission.data.q1='yes'"/>`
    );
    expect(blocks).toEqual([{ kind: 'radio', bindPath: 'q1', radioValue: 'yes' }]);
  });

  it('assigns a stable path to an unnamed input under the owning key', () => {
    const blocks = assignHtmlBindPaths(
      parseHtmlBlocks(`<div><input type="text"></div><div><input type="text"></div>`),
      'readings'
    );
    expect(blocks.map((block) => block.bindPath)).toEqual(['readings__f1', 'readings__f2']);
  });

  it('lets a control on a shared line take the space that is left', () => {
    const blocks = parseHtmlBlocks(`<div>Name: <input type="text" name="who"></div>`);
    expect(blocks[0]?.style).toMatchObject({ row: true });
    expect(blocks[0]?.children?.[1]).toMatchObject({ kind: 'field', style: { grow: 1 } });
  });

  it('drops what the author hid', () => {
    expect(parseHtmlBlocks(`<div style="display: none;">secret</div>`)).toEqual([]);
  });

  it('reads a tag whose attribute value contains an angle bracket', () => {
    const blocks = parseHtmlBlocks(
      `<div onclick="if (a > b) drop()" style="background: navy;">kept</div>`
    );
    expect(blocks[0]).toMatchObject({ style: { background: '#000080' } });
    expect(blocks[0]?.children?.[0]?.text).toBe('kept');
  });

  it('decodes the entities an author actually types', () => {
    const blocks = parseHtmlBlocks(`<div style="background: navy;">25&deg;C &amp; rising&hellip;</div>`);
    expect(blocks[0]?.children?.[0]?.text).toBe('25\u00B0C & rising\u2026');
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
