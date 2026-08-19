// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { transformSchema } from '../src/compat/transformSchema';
import { cacheSchema, loadCachedForm } from '../src/sync/schemaCache';
import { enqueueSubmission, listRejections, resubmit, runOutbox } from '../src/sync/outbox';
import type { CapturedFile } from '../src/form/context';
import { memoryOutbox, memorySchemas, poster, uploader } from './sync/support';
import { mount } from './form/support';

/**
 * One shift, end to end — docs/FORMS.md, definition of done.
 *
 * A form is prepared and cached while there is a connection. It is then filled in with no
 * connection at all, including a photo and a signature. It syncs when the device gets back to
 * town. The unit suites cover each of those steps in isolation; what this file checks is that
 * they still fit together, which is the part that quietly stops being true.
 */

const SCHEMA = {
  title: 'Daily inspection',
  path: 'inspection',
  components: [
    { type: 'textfield', key: 'inspector', label: 'Inspector', input: true, validate: { required: true } },
    {
      type: 'select',
      key: 'site',
      label: 'Site',
      input: true,
      dataSrc: 'url',
      data: { url: 'https://api.example.com/sites' },
    },
    { type: 'file', key: 'photo', label: 'Photo', input: true, multiple: true },
    { type: 'signature', key: 'sig', label: 'Signature', input: true },
    {
      type: 'textfield',
      key: 'incidentDetail',
      label: 'What happened',
      input: true,
      validate: { required: true },
      conditional: { show: true, when: 'inspector', eq: 'incident' },
    },
  ],
};

const photo: CapturedFile = {
  uri: 'file:///documents/photo-1.jpg',
  name: 'photo-1.jpg',
  size: 2048,
  type: 'image/jpeg',
};

async function prepareAndCache() {
  // On the server, while there is still a network: resolve the remote select and stamp a floor.
  const transformed = await transformSchema(SCHEMA, {
    resolveOptions: () => [
      { label: 'North Yard', value: 'north' },
      { label: 'South Yard', value: 'south' },
    ],
    capabilities: ['files', 'signature'],
    minAppVersionByType: { signature: '2.4.0' },
  });

  const schemas = memorySchemas();
  const outcome = await cacheSchema({
    formPath: 'inspection',
    version: '7',
    schema: transformed.schema,
    minAppVersion: transformed.minAppVersion,
    appVersion: '2.6.0',
    store: schemas,
  });

  return { transformed, schemas, outcome };
}

describe('a form filled in with no signal', () => {
  it('caches with its options baked in, so the select works offline', async () => {
    const { transformed, schemas, outcome } = await prepareAndCache();

    expect(outcome.status).toBe('cached');
    expect(transformed.minAppVersion).toBe('2.4.0');

    const loaded = await loadCachedForm('inspection', schemas);
    const select = loaded?.form.components.find((component) => component.key === 'site');
    expect(select?.field.options).toEqual([
      { label: 'North Yard', value: 'north' },
      { label: 'South Yard', value: 'south' },
    ]);
    // No longer a remote source, so nothing warns and nothing waits on a network.
    expect(select?.select?.dataSrc).toBe('values');
    expect(select?.issues).toEqual([]);
  });

  it('refuses to carry the form onto a build too old to render it', async () => {
    const { transformed } = await prepareAndCache();
    const outcome = await cacheSchema({
      formPath: 'inspection',
      version: '7',
      schema: transformed.schema,
      minAppVersion: transformed.minAppVersion,
      appVersion: '2.1.0',
      store: memorySchemas(),
    });

    // Caught here, on purpose: this is the last moment the device is known to be online and the
    // user can still be told to update.
    expect(outcome.status).toBe('needsUpdate');
  });

  it('captures a photo and a signature into the submission as local references', async () => {
    const { schemas } = await prepareAndCache();
    const cached = await loadCachedForm('inspection', schemas);

    const view = mount(cached!.entry.schema, {
      adapters: {
        pickFiles: async () => [photo],
        captureSignature: async () => 'data:image/png;base64,iVBORw0KGgo=',
      },
    });

    view.type(0, 'A. Rahman');
    view.press('Add file');
    await act(async () => undefined);
    view.press('Tap to sign');
    await act(async () => undefined);

    expect(view.handle().getData()).toMatchObject({
      inspector: 'A. Rahman',
      photo: [{ storage: 'local', name: 'photo-1.jpg', localUri: 'file:///documents/photo-1.jpg' }],
      sig: 'data:image/png;base64,iVBORw0KGgo=',
    });
  });

  it('does not demand a field the conditional is hiding', async () => {
    const { schemas } = await prepareAndCache();
    const cached = await loadCachedForm('inspection', schemas);

    const view = mount(cached!.entry.schema);
    view.type(0, 'A. Rahman');

    // `incidentDetail` is required and hidden. Validating it anyway would make the form
    // unsubmittable for every inspection that went fine.
    expect(view.run((handle) => handle.submit())).not.toBeNull();
  });
});

describe('and synced when the device gets back to town', () => {
  async function fillAndQueue() {
    const { schemas } = await prepareAndCache();
    const cached = await loadCachedForm('inspection', schemas);

    const view = mount(cached!.entry.schema, {
      adapters: { pickFiles: async () => [photo] },
    });
    view.type(0, 'A. Rahman');
    view.press('Add file');
    await act(async () => undefined);

    const submission = view.run((handle) => handle.submit());
    const outbox = memoryOutbox();
    await enqueueSubmission({
      id: 'shift-1',
      formPath: 'inspection',
      data: submission!.data,
      schemaVersion: '7',
      store: outbox,
    });

    return { outbox, schemas };
  }

  it('uploads the photo, rewrites the reference, and only then posts', async () => {
    const { outbox, schemas } = await fillAndQueue();
    const sent = poster();

    const [result] = await runOutbox({ outbox, schemas, uploader: uploader(), poster: sent });

    expect(result?.status).toBe('synced');
    const posted = sent.sent[0] as { data: { photo: Array<{ storage: string; url: string }> } };
    expect(posted.data.photo[0]).toMatchObject({
      storage: 'url',
      url: 'https://cdn.example.com/0',
      originalName: 'photo-1.jpg',
    });
  });

  it('leaves the submission queued, with the photo still local, when the upload fails', async () => {
    const { outbox, schemas } = await fillAndQueue();
    const sent = poster();
    const broken = uploader(async () => {
      throw new Error('no route to host');
    });

    const [result] = await runOutbox({ outbox, schemas, uploader: broken, poster: sent });

    expect(sent.sent).toHaveLength(0);
    expect(result?.status).toBe('pending');
    expect(result?.data.photo).toMatchObject([{ storage: 'local' }]);
  });

  it('surfaces a server rejection to a person, and takes the correction', async () => {
    const { outbox, schemas } = await fillAndQueue();

    await runOutbox({
      outbox,
      schemas,
      uploader: uploader(),
      poster: poster({
        ok: false,
        retryable: false,
        rejection: { kind: 'server', message: 'Inspector is not assigned to this site.', statusCode: 422 },
      }),
    });

    const [rejected] = await listRejections(outbox);
    expect(rejected?.rejection?.message).toBe('Inspector is not assigned to this site.');

    // The photo is already uploaded, so the correction does not re-upload it.
    const corrected = { ...rejected!.data, inspector: 'S. Haddad' };
    await resubmit('shift-1', corrected, outbox);

    const retry = uploader();
    const sent = poster();
    const [result] = await runOutbox({ outbox, schemas, uploader: retry, poster: sent });

    expect(result?.status).toBe('synced');
    expect(retry.calls).toBe(0);
    expect((sent.sent[0] as { data: { inspector: string } }).data.inspector).toBe('S. Haddad');
  });
});
