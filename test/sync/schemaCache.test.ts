// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { cacheSchema, hashSchema, loadCachedForm } from '../../src/sync/schemaCache';
import { assessSchema, compareVersions, requiredCapabilities, satisfiesMinVersion } from '../../src/sync/version';
import { parseForm } from '../../src/engine/parseForm';
import { memorySchemas } from './support';

const schema = {
  title: 'Inspection',
  path: 'inspection',
  components: [{ type: 'textfield', key: 'name', label: 'Name', input: true }],
};

describe('hashing', () => {
  it('gives the same hash regardless of key order', () => {
    expect(hashSchema({ a: 1, b: 2 })).toBe(hashSchema({ b: 2, a: 1 }));
  });

  it('changes when the schema changes', () => {
    expect(hashSchema(schema)).not.toBe(hashSchema({ ...schema, title: 'Other' }));
  });

  it('does not confuse an array with an object', () => {
    expect(hashSchema([1, 2])).not.toBe(hashSchema({ 0: 1, 1: 2 }));
  });
});

describe('caching a schema', () => {
  const options = { formPath: 'inspection', version: '1', schema, appVersion: '2.0.0' };

  it('stores a schema this build can render', async () => {
    const store = memorySchemas();
    const result = await cacheSchema({ ...options, store, now: () => 5 });

    expect(result.status).toBe('cached');
    expect((await store.get('inspection'))?.cachedAt).toBe(5);
  });

  it('does not rewrite an unchanged schema', async () => {
    const store = memorySchemas();
    await cacheSchema({ ...options, store });
    const second = await cacheSchema({ ...options, store });

    expect(second.status).toBe('unchanged');
  });

  it('rewrites when the backend bumps the version even if the body matches', async () => {
    const store = memorySchemas();
    await cacheSchema({ ...options, store });
    const second = await cacheSchema({ ...options, version: '2', store });

    expect(second.status).toBe('cached');
  });

  it('refuses a form the installed app is too old to render', async () => {
    const store = memorySchemas();
    const result = await cacheSchema({ ...options, minAppVersion: '3.1.0', store });

    expect(result.status).toBe('needsUpdate');
    expect(await store.get('inspection')).toBeNull();
  });

  it('keeps the previously cached copy when a newer one is refused', async () => {
    const store = memorySchemas();
    await cacheSchema({ ...options, store });
    await cacheSchema({ ...options, version: '2', minAppVersion: '9.0.0', store });

    expect((await store.get('inspection'))?.version).toBe('1');
  });

  it('caches a form whose capabilities the host has not wired, and says which are missing', async () => {
    const store = memorySchemas();
    const result = await cacheSchema({
      ...options,
      schema: { components: [{ type: 'signature', key: 'sig', label: 'Sign', input: true }] },
      store,
    });

    expect(result.status).toBe('cached');
    expect(assessSchema({ appVersion: '2.0.0', form: parseForm(schema) }).missingCapabilities).toEqual([]);
  });
});

describe('reading a cached schema back', () => {
  it('returns a parsed form with no network', async () => {
    const store = memorySchemas();
    await cacheSchema({ formPath: 'inspection', version: '1', schema, appVersion: '2.0.0', store });

    const loaded = await loadCachedForm('inspection', store);
    expect(loaded?.form.components[0]?.key).toBe('name');
  });

  it('returns null when nothing is cached', async () => {
    expect(await loadCachedForm('missing', memorySchemas())).toBeNull();
  });
});

describe('version comparison', () => {
  it('compares numerically, not alphabetically', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
  });

  it('pads a shorter version with zeros', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
  });

  it('ignores a pre-release suffix so testers are not locked out', () => {
    expect(satisfiesMinVersion('1.4.0-beta.2', '1.4.0')).toBe(true);
  });

  it('treats a missing minimum as no constraint', () => {
    expect(satisfiesMinVersion('0.0.1', undefined)).toBe(true);
  });

  it('blocks an app older than the minimum', () => {
    expect(satisfiesMinVersion('1.3.9', '1.4.0')).toBe(false);
  });
});

describe('capability requirements', () => {
  it('reports what a form needs from the host', () => {
    const form = parseForm({
      components: [
        { type: 'signature', key: 'sig', input: true },
        { type: 'file', key: 'photo', input: true },
        { type: 'datetime', key: 'when', input: true },
        { type: 'textfield', key: 'name', input: true },
      ],
    });

    expect(requiredCapabilities(form)).toEqual(['datetime', 'files', 'signature']);
  });

  it('looks inside nested layout and grids', () => {
    const form = parseForm({
      components: [
        {
          type: 'panel',
          key: 'p',
          components: [
            { type: 'datagrid', key: 'lines', input: true, components: [{ type: 'file', key: 'proof', input: true }] },
          ],
        },
      ],
    });

    expect(requiredCapabilities(form)).toEqual(['files']);
  });

  it('flags a capability the host never wired', () => {
    const form = parseForm({ components: [{ type: 'signature', key: 'sig', input: true }] });
    const assessment = assessSchema({ appVersion: '1.0.0', form, hostCapabilities: ['files'] });

    // Degraded, not refused: the rest of the form is still worth carrying into the field.
    expect(assessment.usable).toBe(true);
    expect(assessment.missingCapabilities).toEqual(['signature']);
  });
});
