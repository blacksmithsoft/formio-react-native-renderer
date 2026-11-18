// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * An authored HTML `<table>` of inputs, re-flowed for a phone — docs/FORMS.md §8.
 *
 * A table whose cells are text shrinks to the width it is given and wraps. A table whose cells
 * are *inputs* cannot: six text boxes across 360dp are six boxes nobody can type in. So when a
 * row holds more than two of them, the table stops being a table. Each body row becomes a card,
 * and each input in it is labelled with the column headings it used to sit under — the only
 * thing that said what it was for.
 *
 * Pure, like `phoneLayout.ts`: it decides the shape and `HtmlContent.tsx` draws it.
 */

import type { HtmlBlock } from '../engine/htmlBlocks';

/** A phone row holds two fields. A table row with more inputs than that is re-flowed. */
const MAX_FIELDS_PER_ROW = 2;

function some(block: HtmlBlock, test: (block: HtmlBlock) => boolean): boolean {
  if (test(block)) return true;
  if ((block.children ?? []).some((child) => some(child, test))) return true;
  return (block.rows ?? []).some((row) => row.some((cell) => some(cell, test)));
}

/** A text control. A radio is a mark: three of them across a row are one question, not three. */
const holdsField = (cell: HtmlBlock): boolean => some(cell, (block) => block.kind === 'field');
const holdsControl = (cell: HtmlBlock): boolean =>
  some(cell, (block) => block.kind === 'field' || block.kind === 'radio');
const holdsLongField = (cell: HtmlBlock): boolean =>
  some(cell, (block) => block.kind === 'field' && block.fieldType === 'textarea');

/** Everything a cell says, on one line. */
export function htmlPlainText(block: HtmlBlock): string {
  const parts = [
    block.text ?? '',
    ...(block.children ?? []).map(htmlPlainText),
    ...(block.rows ?? []).flatMap((row) => row.map(htmlPlainText)),
  ];
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Whether any row of the table holds more inputs than a phone row may. */
export function isCrowdedHtmlTable(rows: HtmlBlock[][]): boolean {
  return rows.some((row) => row.filter(holdsField).length > MAX_FIELDS_PER_ROW);
}

interface PlacedCell {
  cell: HtmlBlock;
  start: number;
  span: number;
}

/** The column each cell starts in, once `colspan` and `rowspan` have taken the room they ask for. */
function placeCells(rows: HtmlBlock[][]): PlacedCell[][] {
  const taken: boolean[][] = [];
  return rows.map((row, rowIndex) => {
    let column = 0;
    return row.map((cell) => {
      while (taken[rowIndex]?.[column]) column += 1;
      const span = Math.max(1, cell.colspan ?? 1);
      const depth = Math.max(1, cell.rowspan ?? 1);
      for (let down = 0; down < depth; down += 1) {
        const line = (taken[rowIndex + down] ??= []);
        for (let across = 0; across < span; across += 1) line[column + across] = true;
      }
      const placed = { cell, start: column, span };
      column += span;
      return placed;
    });
  });
}

/** One input of a re-flowed row, under the heading it had as a column. */
export interface PhoneHtmlField {
  label: string;
  cell: HtmlBlock;
  /** A multi-line input keeps a row to itself. */
  wide: boolean;
}

export type PhoneHtmlLine =
  | { kind: 'single'; field: PhoneHtmlField }
  | { kind: 'pair'; left: PhoneHtmlField; right: PhoneHtmlField };

export interface PhoneHtmlCard {
  /** The row's own heading: the text cell it began with — `Name:`, `Signature:`. */
  title: string;
  /** Text cells that sat among the inputs. Drawn above them, in order. */
  notes: HtmlBlock[];
  lines: PhoneHtmlLine[];
}

/** A body row with no input in it is not a record; it is drawn as the text it is. */
export type PhoneHtmlRow = { kind: 'card'; card: PhoneHtmlCard } | { kind: 'text'; cells: HtmlBlock[] };

function pairFields(fields: PhoneHtmlField[]): PhoneHtmlLine[] {
  const lines: PhoneHtmlLine[] = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (!field) continue;
    const next = fields[index + 1];
    if (next && !field.wide && !next.wide) {
      lines.push({ kind: 'pair', left: field, right: next });
      index += 1;
    } else {
      lines.push({ kind: 'single', field });
    }
  }
  return lines;
}

/**
 * Turn the rows of a crowded table into cards.
 *
 * The header is every leading row made only of `<th>` cells with no control in them — there can
 * be two, a group heading over its sub-headings. An input's label is the heading above it in
 * each of those rows, outermost first: `Temperature Deg. C · Up`.
 */
export function planPhoneHtmlTable(rows: HtmlBlock[][]): PhoneHtmlRow[] {
  const placed = placeCells(rows);

  let headerRows = 0;
  while (
    headerRows < placed.length &&
    (placed[headerRows] ?? []).length > 0 &&
    (placed[headerRows] ?? []).every(({ cell }) => cell.header && !holdsControl(cell))
  ) {
    headerRows += 1;
  }
  const headers = placed.slice(0, headerRows);

  const labelFor = (column: number): string => {
    const parts: string[] = [];
    for (const row of headers) {
      const over = row.find(({ start, span }) => column >= start && column < start + span);
      const text = over ? htmlPlainText(over.cell) : '';
      if (text && !parts.includes(text)) parts.push(text);
    }
    return parts.join(' · ');
  };

  const out: PhoneHtmlRow[] = [];
  for (const row of placed.slice(headerRows)) {
    if (!row.some(({ cell }) => holdsControl(cell))) {
      const cells = row.map(({ cell }) => cell).filter((cell) => htmlPlainText(cell) !== '');
      if (cells.length > 0) out.push({ kind: 'text', cells });
      continue;
    }

    const titles: string[] = [];
    const notes: HtmlBlock[] = [];
    const fields: PhoneHtmlField[] = [];
    for (const { cell, start } of row) {
      if (holdsControl(cell)) {
        fields.push({ label: labelFor(start), cell, wide: holdsLongField(cell) });
        continue;
      }
      const text = htmlPlainText(cell);
      if (!text) continue;
      // Text before the first input names the row. Text after one is a remark about it.
      if (fields.length === 0) titles.push(text);
      else notes.push(cell);
    }
    out.push({ kind: 'card', card: { title: titles.join(' '), notes, lines: pairFields(fields) } });
  }
  return out;
}
