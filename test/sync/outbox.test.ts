// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import {
  backoffMs,
  enqueueSubmission,
  listRejections,
  MAX_ATTEMPTS,
  resubmit,
  runOutbox,
  syncSubmission,
} from '../../src/sync/outbox';
import { collectPendingBinaries, isReadyToPost, uploadBinaries } from '../../src/sync/binaryUpload';
import { entry, localFile, memoryOutbox, memorySchemas, poster, uploader } from './support';

const clock = () => 1_000;

describe('finding binaries in a submission', () => {
  it('finds one at the top level', () => {
    expect(collectPendingBinaries({ photo: [localFile()] })).toEqual([
      { path: 'photo[0]', file: localFile() },
    ]);
  });

  it('finds one nested inside a data grid row', () => {
    const data = { lines: [{ qty: 1 }, { qty: 2, proof: [localFile('b.jpg')] }] };
    expect(collectPendingBinaries(data).map((item) => item.path)).toEqual(['lines[1].proof[0]']);
  });

  it('ignores a file that has already been uploaded', () => {
    const data = { photo: [{ storage: 'url', name: 'a.jpg', url: 'https://cdn/a.jpg' }] };
    expect(collectPendingBinaries(data)).toEqual([]);
    expect(isReadyToPost(data)).toBe(true);
  });

  it('does not mistake an ordinary object for a file', () => {
    expect(collectPendingBinaries({ site: { storage: 'yard', name: 'North' } })).toEqual([]);
  });
});

describe('uploading binaries', () => {
  it('rewrites each reference to the returned URL', async () => {
    const data = await uploadBinaries({
      data: { photo: [localFile('a.jpg')], sig: [localFile('s.png')] },
      formPath: 'inspection',
      entryId: 'e1',
      uploader: uploader(),
    });

    expect(data).toEqual({
      photo: [
        {
          storage: 'url',
          name: 'a.jpg',
          originalName: 'a.jpg',
          size: 1024,
          type: 'image/jpeg',
          url: 'https://cdn.example.com/0',
        },
      ],
      sig: [
        {
          storage: 'url',
          name: 's.png',
          originalName: 's.png',
          size: 1024,
          type: 'image/jpeg',
          url: 'https://cdn.example.com/1',
        },
      ],
    });
  });

  it('reports partial progress so an interrupted upload can resume', async () => {
    const seen: number[] = [];
    const failing = uploader(async (index) => {
      if (index === 1) throw new Error('connection lost');
      return { url: `https://cdn/${index}` };
    });

    await expect(
      uploadBinaries({
        data: { a: [localFile('a.jpg')], b: [localFile('b.jpg')], c: [localFile('c.jpg')] },
        formPath: 'inspection',
        entryId: 'e1',
        uploader: failing,
        onProgress: (_data, done) => {
          seen.push(done);
        },
      })
    ).rejects.toThrow('connection lost');

    expect(seen).toEqual([1]);
  });
});

describe('syncing one submission', () => {
  const deps = (overrides: Partial<Parameters<typeof syncSubmission>[1]> = {}) => ({
    outbox: memoryOutbox(),
    schemas: memorySchemas(),
    uploader: uploader(),
    poster: poster(),
    now: clock,
    ...overrides,
  });

  it('uploads the binaries before posting the JSON', async () => {
    const sent = poster();
    const result = await syncSubmission(
      entry({ data: { photo: [localFile()] } }),
      deps({ poster: sent })
    );

    expect(result.status).toBe('synced');
    const posted = sent.sent[0] as { data: { photo: Array<{ storage: string; url: string }> } };
    expect(posted.data.photo[0]!.storage).toBe('url');
    expect(posted.data.photo[0]!.url).toBe('https://cdn.example.com/0');
  });

  it('never posts a submission still pointing at the device filesystem', async () => {
    const sent = poster();
    const broken = uploader(async () => {
      throw new Error('storage unreachable');
    });

    const result = await syncSubmission(
      entry({ data: { photo: [localFile()] } }),
      deps({ poster: sent, uploader: broken })
    );

    expect(sent.sent).toHaveLength(0);
    expect(result.status).toBe('pending');
    expect(result.rejection?.kind).toBe('network');
  });

  it('re-validates against the cached schema and refuses a submission that no longer passes', async () => {
    const schemas = memorySchemas([
      {
        formPath: 'inspection',
        version: '2',
        hash: 'x',
        cachedAt: 0,
        schema: {
          components: [
            { type: 'textfield', key: 'name', label: 'Name', input: true, validate: { required: true } },
          ],
        },
      },
    ]);
    const sent = poster();

    const result = await syncSubmission(entry({ data: {} }), deps({ schemas, poster: sent }));

    expect(result.status).toBe('rejected');
    expect(result.rejection?.kind).toBe('validation');
    expect(result.rejection?.fields).toEqual({ name: ['Name is required'] });
    expect(sent.sent).toHaveLength(0);
  });

  it('backs off and stays queued after a retryable failure', async () => {
    const result = await syncSubmission(
      entry(),
      deps({
        poster: poster({
          ok: false,
          retryable: true,
          rejection: { kind: 'network', message: 'timeout' },
        }),
      })
    );

    expect(result.status).toBe('pending');
    expect(result.nextAttemptAt).toBe(1_000 + backoffMs(1));
  });

  it('gives the submission to a person after a rejection that will not fix itself', async () => {
    const result = await syncSubmission(
      entry(),
      deps({
        poster: poster({
          ok: false,
          retryable: false,
          rejection: { kind: 'server', message: 'Site is closed', statusCode: 422 },
        }),
      })
    );

    expect(result.status).toBe('rejected');
    expect(result.rejection?.message).toBe('Site is closed');
    expect(result.rejection?.statusCode).toBe(422);
  });

  it('stops retrying at the attempt cap rather than looping forever', async () => {
    const result = await syncSubmission(
      entry({ attempts: MAX_ATTEMPTS }),
      deps({
        poster: poster({ ok: false, retryable: true, rejection: { kind: 'network', message: 'timeout' } }),
      })
    );

    expect(result.status).toBe('rejected');
  });

  it('backs off further with each attempt, up to an hour', () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(60_000);
    expect(backoffMs(20)).toBe(3_600_000);
  });
});

describe('draining the queue', () => {
  it('sends the oldest first and leaves finished work alone', async () => {
    const store = memoryOutbox([
      entry({ id: 'new', createdAt: 20, data: { n: 2 } }),
      entry({ id: 'old', createdAt: 10, data: { n: 1 } }),
      entry({ id: 'done', createdAt: 5, status: 'synced' }),
      entry({ id: 'stuck', createdAt: 1, status: 'rejected' }),
    ]);
    const sent = poster();

    await runOutbox({
      outbox: store,
      schemas: memorySchemas(),
      uploader: uploader(),
      poster: sent,
      now: clock,
    });

    expect(sent.sent).toEqual([{ data: { n: 1 } }, { data: { n: 2 } }]);
  });

  it('skips an entry that is still backing off', async () => {
    const store = memoryOutbox([entry({ nextAttemptAt: 9_999 })]);
    const sent = poster();

    await runOutbox({
      outbox: store,
      schemas: memorySchemas(),
      uploader: uploader(),
      poster: sent,
      now: clock,
    });

    expect(sent.sent).toHaveLength(0);
  });
});

describe('rejection reconciliation', () => {
  it('lists what needs a person, oldest first', async () => {
    const store = memoryOutbox([
      entry({ id: 'b', createdAt: 20, status: 'rejected' }),
      entry({ id: 'a', createdAt: 10, status: 'rejected' }),
      entry({ id: 'fine', createdAt: 1, status: 'synced' }),
    ]);

    expect((await listRejections(store)).map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('requeues a corrected submission with a clean slate', async () => {
    const store = memoryOutbox([
      entry({
        status: 'rejected',
        attempts: 6,
        rejection: { kind: 'server', message: 'nope', at: 1 },
        data: { name: '' },
      }),
    ]);

    const updated = await resubmit('e1', { name: 'Ali' }, store, clock);

    expect(updated).toMatchObject({ status: 'pending', attempts: 0, data: { name: 'Ali' } });
    expect(updated?.rejection).toBeUndefined();
  });

  it('returns null for an id that is not queued', async () => {
    expect(await resubmit('ghost', {}, memoryOutbox(), clock)).toBeNull();
  });
});

describe('enqueueing', () => {
  it('stores a new submission as pending', async () => {
    const store = memoryOutbox();
    const queued = await enqueueSubmission({
      id: 'e9',
      formPath: 'inspection',
      data: { name: 'Ali' },
      schemaVersion: '3',
      store,
      now: clock,
    });

    expect(queued).toMatchObject({ status: 'pending', attempts: 0, schemaVersion: '3' });
    expect(await store.list()).toHaveLength(1);
  });
});
