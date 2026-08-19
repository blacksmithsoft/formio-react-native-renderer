// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { formatFieldValue, parseSchemaNodes, parseSchemaTabLayout } from '../src/index';
import type { SchemaField } from '../src/index';
import { firstDifference, toComparable } from './support/compare';
import {
  hasCaseFile,
  readCaseJson,
  readManifest,
  type FixtureEntry,
  type ManifestCase,
} from './support/fixtures';

/**
 * The shared conformance suite — docs/CONFORMANCE.md.
 *
 * Reads the repository-root `fixtures/` directory, which the Flutter runner reads too. A case
 * listed in the manifest but missing from disk is a failure, not a skip: a fixture that silently
 * does not run makes the parity matrix claim coverage that does not exist.
 */

interface FormatCase {
  id: string;
  field: SchemaField;
  value?: unknown;
  expected: string;
}

const manifest = readManifest();

const REQUIRED_FILES: Record<FixtureEntry, string[]> = {
  parseSchemaTabLayout: ['schema.json', 'options.json', 'expected-tree.json'],
  parseSchemaNodes: ['schema.json', 'expected-tree.json'],
  formatFieldValue: ['cases.json'],
};

function runParseCase(fixture: ManifestCase): unknown {
  const schema = readCaseJson<unknown>(fixture.name, 'schema.json');
  if (fixture.entry === 'parseSchemaNodes') return parseSchemaNodes(schema);
  const { tabKey } = readCaseJson<{ tabKey: string }>(fixture.name, 'options.json');
  return parseSchemaTabLayout(schema, tabKey);
}

describe('conformance fixtures', () => {
  it('declares at least one case', () => {
    expect(manifest.cases.length).toBeGreaterThan(0);
  });

  describe.each(manifest.cases)('$name ($entry)', (fixture) => {
    it('has every input the entry point needs', () => {
      for (const file of REQUIRED_FILES[fixture.entry]) {
        expect(hasCaseFile(fixture.name, file), `${fixture.name}/${file} is missing`).toBe(true);
      }
    });

    if (fixture.entry === 'formatFieldValue') {
      it('formats every value', () => {
        const cases = readCaseJson<FormatCase[]>(fixture.name, 'cases.json');
        expect(cases.length).toBeGreaterThan(0);
        for (const testCase of cases) {
          expect(
            formatFieldValue(testCase.value, testCase.field),
            `case "${testCase.id}"`
          ).toBe(testCase.expected);
        }
      });
      return;
    }

    it('parses to the expected tree', () => {
      const expected = readCaseJson<unknown>(fixture.name, 'expected-tree.json');
      const actual = toComparable(runParseCase(fixture));
      const diff = firstDifference(actual, expected);
      expect(diff, diff ?? 'trees match').toBeNull();
      expect(actual).toEqual(expected);
    });
  });
});
