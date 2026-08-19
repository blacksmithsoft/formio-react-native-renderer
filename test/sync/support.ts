// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import type {
  BinaryUploader,
  CachedSchema,
  OutboxEntry,
  OutboxStore,
  PostResult,
  SchemaCacheStore,
  SubmissionPoster,
} from '../../src/sync/types';

/** In-memory ports. The real ones are WatermelonDB and fetch; the rules are the same. */

export function memoryOutbox(seed: OutboxEntry[] = []): OutboxStore & { entries: Map<string, OutboxEntry> } {
  const entries = new Map(seed.map((entry) => [entry.id, entry]));
  return {
    entries,
    list: async () => [...entries.values()],
    save: async (entry) => {
      entries.set(entry.id, entry);
    },
    remove: async (id) => {
      entries.delete(id);
    },
  };
}

export function memorySchemas(seed: CachedSchema[] = []): SchemaCacheStore {
  const entries = new Map(seed.map((entry) => [entry.formPath, entry]));
  return {
    get: async (formPath) => entries.get(formPath) ?? null,
    put: async (entry) => {
      entries.set(entry.formPath, entry);
    },
    list: async () => [...entries.values()],
    remove: async (formPath) => {
      entries.delete(formPath);
    },
  };
}

export function uploader(
  behaviour: (index: number) => Promise<{ url: string }> = async (index) => ({
    url: `https://cdn.example.com/${index}`,
  })
): BinaryUploader & { calls: number } {
  const state = {
    calls: 0,
    upload: async () => {
      const index = state.calls;
      state.calls += 1;
      return behaviour(index);
    },
  };
  return state;
}

export function poster(...results: PostResult[]): SubmissionPoster & { sent: unknown[] } {
  const queue = [...results];
  const state = {
    sent: [] as unknown[],
    post: async (_formPath: string, submission: unknown) => {
      state.sent.push(submission);
      return queue.shift() ?? ({ ok: true } as PostResult);
    },
  };
  return state;
}

export function entry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    id: 'e1',
    formPath: 'inspection',
    data: {},
    status: 'pending',
    attempts: 0,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

export const localFile = (name = 'photo.jpg') => ({
  storage: 'local' as const,
  name,
  localUri: `file:///docs/${name}`,
  size: 1024,
  type: 'image/jpeg',
});
