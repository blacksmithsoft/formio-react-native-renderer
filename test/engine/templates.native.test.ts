// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyDefaults, reconcile, validateForm } from '../../src/engine/formState';
import { parseForm } from '../../src/engine/parseForm';
import type { HtmlBlock } from '../../src/engine/htmlBlocks';

/**
 * Every schema in `test-templates/` must parse as a native-submittable form: no custom-JS
 * blocker, and HTML tables/radios compiled into bindable blocks rather than left for a WebView.
 */

const TEMPLATES = join(process.cwd(), 'test-templates');

function load(name: string): unknown {
  const file = readdirSync(TEMPLATES).find((entry) => entry.startsWith(name));
  if (!file) throw new Error(`no template starting with ${name}`);
  return JSON.parse(readFileSync(join(TEMPLATES, file), 'utf8')) as unknown;
}

function htmlFields(blocks: HtmlBlock[] | undefined): HtmlBlock[] {
  const found: HtmlBlock[] = [];
  const walk = (block: HtmlBlock): void => {
    if (block.kind === 'field' || block.kind === 'radio') found.push(block);
    for (const child of block.children ?? []) walk(child);
    for (const row of block.rows ?? []) for (const cell of row) walk(cell);
  };
  for (const block of blocks ?? []) walk(block);
  return found;
}

describe('test-templates native coverage', () => {
  it('parses every template without an engine blocker', () => {
    const files = readdirSync(TEMPLATES).filter((file) => file.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const parsed = parseForm(JSON.parse(readFileSync(join(TEMPLATES, file), 'utf8')));
      const errors = parsed.issues.filter((entry) => entry.issue.severity === 'error');
      expect(errors, file).toEqual([]);
      expect(validateForm(parsed, applyDefaults(parsed, {})).blocked, file).toBe(false);
    }
  });

  it('numbers HDPE lining rows and does not block on calculateValue', () => {
    const parsed = parseForm(load('atnm-odc-mf-059'));
    const data = reconcile(parsed, applyDefaults(parsed, {})) as {
      activityTable?: Array<{ slNo?: number }>;
    };
    expect(data.activityTable?.[0]?.slNo).toBe(1);
  });

  it('fills the dynamic-change checklist questions from the compiled list', () => {
    const parsed = parseForm(load('atnm-odc-hse-dcg-004'));
    const data = reconcile(parsed, applyDefaults(parsed, {})) as {
      checklist?: Array<{ sno?: number; description?: string }>;
    };
    expect(data.checklist).toHaveLength(14);
    expect(data.checklist?.[0]).toMatchObject({
      sno: 1,
      description: 'Has anything changed since the job started?',
    });
  });

  it('binds the thermometer HTML table to named submission keys', () => {
    const parsed = parseForm(load('atnm-odc-gf-077'));
    const remarks = parsed.components.find((component) => component.key === 'finalRemarksBlock');
    const paths = htmlFields(remarks?.htmlBlocks).map((block) => block.bindPath);
    expect(paths).toEqual(
      expect.arrayContaining([
        'calibratedName',
        'approvedName',
        'calibratedDesignation',
        'approvedDesignation',
        'calibratedSignature',
        'approvedSignature',
        'calibratedDate',
        'approvedDate',
      ])
    );
  });

  it('binds the ten-point Yes/No radios to the hidden q1…q10 keys', () => {
    const parsed = parseForm(load('atnm-odc-hse-ten-006'));
    const radios = parsed.components.flatMap((component) => {
      const nested = (component.columns ?? []).flatMap((column) => column.children);
      return htmlFields([component, ...nested].flatMap((entry) => entry.htmlBlocks ?? []));
    });
    const yes = radios.filter((block) => block.kind === 'radio' && block.radioValue === 'yes');
    expect(yes.map((block) => block.bindPath)).toEqual([
      'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10',
    ]);
  });
});
