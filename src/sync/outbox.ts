// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * The submission outbox — docs/FORMS.md §9.
 *
 * A worker fills a form in a plant with no signal, drives home, and the phone syncs overnight.
 * Everything that can go wrong between those two moments goes wrong here, and the worst outcome
 * in the whole system is the one where they find out three days later and cannot do anything
 * about it. Two rules follow from that, and they are why this file is more than a retry loop:
 *
 * - **Nothing is ever dropped or retried forever.** A submission that cannot be sent ends in
 *   `rejected` with the reason attached, where a person can see it, fix it and resend it.
 * - **Binaries go up before the JSON.** See `binaryUpload.ts`.
 *
 * Pure orchestration over injected ports. No network, no storage, no timers — the host decides
 * when to call `runOutbox`, which is also what makes all of this testable.
 */

import { validateForm, type SubmissionData } from '../engine/formState';
import { parseForm } from '../engine/parseForm';
import { uploadBinaries } from './binaryUpload';
import type {
  BinaryUploader,
  Clock,
  OutboxEntry,
  OutboxStore,
  SchemaCacheStore,
  SubmissionPoster,
  SubmissionRejection,
} from './types';

/** Give up after this many attempts and ask a human. */
export const MAX_ATTEMPTS = 6;

/**
 * Exponential backoff, capped at an hour.
 *
 * A field device moves in and out of coverage all day; retrying every few seconds drains the
 * battery it needs for the rest of the shift and does not make the tower any closer.
 */
export function backoffMs(attempts: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 3_600_000);
}

export interface EnqueueOptions {
  formPath: string;
  data: SubmissionData;
  schemaVersion?: string;
  id: string;
  store: OutboxStore;
  now?: Clock;
}

export async function enqueueSubmission(options: EnqueueOptions): Promise<OutboxEntry> {
  const timestamp = (options.now ?? Date.now)();
  const entry: OutboxEntry = {
    id: options.id,
    formPath: options.formPath,
    schemaVersion: options.schemaVersion,
    data: options.data,
    status: 'pending',
    attempts: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await options.store.save(entry);
  return entry;
}

export interface SyncDeps {
  outbox: OutboxStore;
  schemas: SchemaCacheStore;
  uploader: BinaryUploader;
  poster: SubmissionPoster;
  now?: Clock;
}

/**
 * Push one queued submission through both phases.
 *
 * Every intermediate state is persisted, because the process can be killed at any point — the OS
 * reclaims backgrounded apps without asking, and a submission stuck half-uploaded with no record
 * of it is the same as a lost one.
 */
export async function syncSubmission(entry: OutboxEntry, deps: SyncDeps): Promise<OutboxEntry> {
  const now = deps.now ?? Date.now;
  let current = entry;

  const persist = async (patch: Partial<OutboxEntry>): Promise<OutboxEntry> => {
    current = { ...current, ...patch, updatedAt: now() };
    await deps.outbox.save(current);
    return current;
  };

  const reject = (
    kind: SubmissionRejection['kind'],
    message: string,
    extra: Partial<SubmissionRejection> = {}
  ): Promise<OutboxEntry> =>
    persist({ status: 'rejected', rejection: { kind, message, at: now(), ...extra } });

  // Re-validate against the cached schema before spending a connection on it. The schema may have
  // been updated since the form was filled in, and catching that here — with the data still on
  // the device and the field still editable — is better than a server rejection days later.
  const cached = await deps.schemas.get(entry.formPath);
  if (cached) {
    const result = validateForm(parseForm(cached.schema), entry.data);

    if (result.blocked) {
      return reject('validation', 'This form now contains a component this app version cannot handle.');
    }
    if (Object.keys(result.errors).length > 0) {
      return reject('validation', 'This submission is no longer valid and needs to be corrected.', {
        fields: result.errors,
      });
    }
  }

  try {
    await persist({ status: 'uploading', attempts: current.attempts + 1 });

    const data = await uploadBinaries({
      data: current.data,
      formPath: current.formPath,
      entryId: current.id,
      uploader: deps.uploader,
      onProgress: async (partial) => {
        await persist({ data: partial });
      },
    });

    await persist({ status: 'posting', data });

    const result = await deps.poster.post(current.formPath, { data });
    if (result.ok) return persist({ status: 'synced', rejection: undefined });

    if (!result.retryable || current.attempts >= MAX_ATTEMPTS) {
      return reject(result.rejection.kind, result.rejection.message, result.rejection);
    }

    return persist({
      status: 'pending',
      rejection: { ...result.rejection, at: now() },
      nextAttemptAt: now() + backoffMs(current.attempts),
    });
  } catch (error) {
    // A thrown error is almost always the transport giving up. Retry it until the attempt cap,
    // then surface it — an unbounded retry is how a broken submission stays invisible.
    const message = error instanceof Error ? error.message : String(error);
    if (current.attempts >= MAX_ATTEMPTS) return reject('network', message);

    return persist({
      status: 'pending',
      rejection: { kind: 'network', message, at: now() },
      nextAttemptAt: now() + backoffMs(current.attempts),
    });
  }
}

/**
 * Drain the queue, oldest first.
 *
 * Oldest first so a submission cannot be starved by newer ones, and sequentially so a device that
 * just regained a weak signal is not asked to run ten uploads at once.
 */
export async function runOutbox(deps: SyncDeps): Promise<OutboxEntry[]> {
  const now = deps.now ?? Date.now;
  const timestamp = now();

  const due = (await deps.outbox.list())
    .filter((entry) => entry.status !== 'synced' && entry.status !== 'rejected')
    .filter((entry) => (entry.nextAttemptAt ?? 0) <= timestamp)
    .sort((a, b) => a.createdAt - b.createdAt);

  const results: OutboxEntry[] = [];
  for (const entry of due) results.push(await syncSubmission(entry, deps));
  return results;
}

/** Everything waiting on a person — the queue behind the "needs attention" screen. */
export async function listRejections(store: OutboxStore): Promise<OutboxEntry[]> {
  const entries = await store.list();
  return entries.filter((entry) => entry.status === 'rejected').sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Put a corrected submission back in the queue.
 *
 * The attempt count resets: the corrections are the whole reason to try again, and carrying the
 * old failures forward would let a fixed submission fall straight back out of the queue.
 */
export async function resubmit(
  id: string,
  data: SubmissionData,
  store: OutboxStore,
  now: Clock = Date.now
): Promise<OutboxEntry | null> {
  const entry = (await store.list()).find((item) => item.id === id);
  if (!entry) return null;

  const updated: OutboxEntry = {
    ...entry,
    data,
    status: 'pending',
    attempts: 0,
    rejection: undefined,
    nextAttemptAt: undefined,
    updatedAt: now(),
  };
  await store.save(updated);
  return updated;
}
