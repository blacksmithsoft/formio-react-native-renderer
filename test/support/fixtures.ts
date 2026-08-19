// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Access to the repository-root `fixtures/` directory, which is shared with the Flutter package
 * and belongs to neither. Nothing here writes to it.
 */

export const FIXTURES_DIR = fileURLToPath(new URL('../../../fixtures', import.meta.url));

export type FixtureEntry = 'parseSchemaTabLayout' | 'parseSchemaNodes' | 'formatFieldValue';

export interface ManifestCase {
  name: string;
  entry: FixtureEntry;
  tags?: string[];
  render?: boolean;
}

export interface Manifest {
  version: number;
  cases: ManifestCase[];
}

export function readManifest(): Manifest {
  return readJson<Manifest>(join(FIXTURES_DIR, 'manifest.json'));
}

export function caseDir(name: string): string {
  return join(FIXTURES_DIR, name);
}

export function caseFile(name: string, file: string): string {
  return join(caseDir(name), file);
}

export function hasCaseFile(name: string, file: string): boolean {
  return existsSync(caseFile(name, file));
}

export function readCaseJson<T>(name: string, file: string): T {
  return readJson<T>(caseFile(name, file));
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}
