// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * Offline schema caching — docs/FORMS.md §9.
 *
 * A form must be fully renderable from cache with no network. That is not a nicety: a renderer
 * that needs a round trip to draw itself is broken by definition in a field app.
 *
 * Pure rules over the injected `SchemaCacheStore`; the host owns the actual database.
 */

import { parseForm } from '../engine/parseForm';
import type { HostCapability } from '../form/registry';
import { assessSchema, type SchemaUsability } from './version';
import type { CachedSchema, Clock, SchemaCacheStore } from './types';

/**
 * A stable, order-insensitive hash of a schema.
 *
 * FNV-1a over a key-sorted serialisation. Not cryptographic — it only has to answer "did this
 * change", and it has to give the same answer on two devices, which is why the key sort matters:
 * `JSON.stringify` preserves insertion order, and a backend that rebuilds the document can emit
 * the same schema with the keys in a different sequence.
 */
export function hashSchema(schema: unknown): string {
  const serialized = stableStringify(schema);
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    // FNV prime, via shifts, because Hermes has no 64-bit integers and `Math.imul` is clearer
    // than the multiply-and-truncate dance.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
  return `{${entries.join(',')}}`;
}

export type CacheOutcome =
  /** Stored. */
  | { status: 'cached'; entry: CachedSchema }
  /** Byte-identical to what is already stored; nothing was written. */
  | { status: 'unchanged'; entry: CachedSchema }
  /**
   * Refused. The installed app cannot render this form, and the previously cached copy — if any —
   * is left alone, because a form the user can partly fill beats no form at all.
   */
  | { status: 'needsUpdate'; entry: CachedSchema | null; minAppVersion: string; assessment: SchemaUsability };

export interface CacheSchemaOptions {
  formPath: string;
  version: string;
  /** The schema *after* the server-side compatibility transform — §7. */
  schema: unknown;
  minAppVersion?: string;
  appVersion: string;
  hostCapabilities?: HostCapability[];
  store: SchemaCacheStore;
  now?: Clock;
}

/**
 * Store a transformed schema for offline use, refusing forms this build cannot render.
 *
 * The version check happens here, at sync time, on purpose. This is the last moment the device is
 * known to be online and the user can still be told to update.
 */
export async function cacheSchema(options: CacheSchemaOptions): Promise<CacheOutcome> {
  const { formPath, version, schema, minAppVersion, appVersion, store } = options;
  const now = options.now ?? Date.now;
  const existing = await store.get(formPath);

  const assessment = assessSchema({
    appVersion,
    minAppVersion,
    form: parseForm(schema),
    hostCapabilities: options.hostCapabilities,
  });

  if (assessment.needsUpdate) {
    return { status: 'needsUpdate', entry: existing, minAppVersion: minAppVersion!, assessment };
  }

  const hash = hashSchema(schema);
  if (existing && existing.hash === hash && existing.version === version) {
    return { status: 'unchanged', entry: existing };
  }

  const entry: CachedSchema = { formPath, version, hash, schema, cachedAt: now(), minAppVersion };
  await store.put(entry);
  return { status: 'cached', entry };
}

/**
 * Read a cached schema back, parsed and ready to render.
 *
 * Returns `null` only when nothing is cached. A cached schema that has since become unrenderable
 * is still returned — refusing to draw a form the worker is standing in front of helps nobody,
 * and every unsupported component in it already renders its own visible fallback.
 */
export async function loadCachedForm(
  formPath: string,
  store: SchemaCacheStore
): Promise<{ entry: CachedSchema; form: ReturnType<typeof parseForm> } | null> {
  const entry = await store.get(formPath);
  if (!entry) return null;
  return { entry, form: parseForm(entry.schema) };
}
