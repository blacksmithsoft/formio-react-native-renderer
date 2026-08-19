// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * The ports the sync layer runs on — docs/FORMS.md §9.
 *
 * This package cannot ship a sync engine. Storage is WatermelonDB in one host and SQLite in the
 * next, uploads go to whatever the backend exposes, and every field app already has an outbox it
 * is not going to replace. What *is* portable is the ordering — re-validate, upload the binaries,
 * rewrite the references, then post — and getting that ordering wrong is what loses a day's work.
 *
 * So the rules live here as pure functions over injected ports, and the host supplies the four
 * boring implementations. Everything below is an interface the host satisfies; nothing here
 * touches the network or the filesystem.
 */

import type { SubmissionData } from '../engine/formState';
import type { FormioFileValue } from '../form/context';

/** Where a queued submission is in its life. */
export type OutboxStatus =
  /** Waiting for a connection. */
  | 'pending'
  /** Binaries are going up. Interrupted uploads resume from here. */
  | 'uploading'
  /** Binaries are up; the JSON is going up. */
  | 'posting'
  /** Accepted by the server. */
  | 'synced'
  /**
   * Refused, and it will not be retried on its own. It needs a person. This state exists so that
   * a failure cannot be silently swallowed by a retry loop — docs/FORMS.md §9.
   */
  | 'rejected';

export interface SubmissionRejection {
  kind: 'validation' | 'server' | 'network' | 'conflict';
  message: string;
  /** Server-reported field errors, keyed by absolute data path, when it gave any. */
  fields?: Record<string, string[]>;
  statusCode?: number;
  at: number;
}

export interface OutboxEntry {
  id: string;
  /** Form.io form path, used both to post and to find the cached schema to re-validate against. */
  formPath: string;
  /** The schema version the answers were given against — see the note in `syncSubmission`. */
  schemaVersion?: string;
  data: SubmissionData;
  status: OutboxStatus;
  attempts: number;
  createdAt: number;
  updatedAt: number;
  /** Epoch millis before which no attempt should be made. Backoff, not a timer. */
  nextAttemptAt?: number;
  rejection?: SubmissionRejection;
}

export interface OutboxStore {
  list: () => Promise<OutboxEntry[]>;
  save: (entry: OutboxEntry) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export interface BinaryUploader {
  /**
   * Upload one captured binary and say what to put in the submission in its place.
   *
   * Return `{ url }` for the common case. Return `{ file }` when the backend builds the entry
   * itself — the Vise upload endpoint, for one, replaces the placeholder server-side and hands
   * back the finished blob, and reconstructing it on the device from a URL would guess at fields
   * the server has already decided.
   *
   * Called once per file, and the entry is persisted after each one, so a connection that drops
   * halfway through a five-photo submission resumes rather than restarting.
   */
  upload: (
    file: FormioFileValue,
    context: { formPath: string; entryId: string }
  ) => Promise<{ url: string } | { file: FormioFileValue }>;
}

export type PostResult =
  | { ok: true }
  | { ok: false; retryable: boolean; rejection: Omit<SubmissionRejection, 'at'> };

export interface SubmissionPoster {
  post: (formPath: string, submission: { data: SubmissionData }) => Promise<PostResult>;
}

/** A cached, already-transformed schema — docs/FORMS.md §9. */
export interface CachedSchema {
  formPath: string;
  /** Whatever the backend calls a version. Compared as an opaque string. */
  version: string;
  /** Content hash, so a refresh with an unchanged body is a no-op. */
  hash: string;
  /** The schema itself, after the server-side compatibility transform — §7. */
  schema: unknown;
  cachedAt: number;
  /**
   * The lowest app version that can render this form, stamped by the backend — §10.
   *
   * Checked *before* caching, while the device is still online and can be told to update.
   * Discovering it in the field is the failure this field exists to prevent.
   */
  minAppVersion?: string;
}

export interface SchemaCacheStore {
  get: (formPath: string) => Promise<CachedSchema | null>;
  put: (entry: CachedSchema) => Promise<void>;
  list: () => Promise<CachedSchema[]>;
  remove: (formPath: string) => Promise<void>;
}

/** Injectable so tests are deterministic and a device with a wrong clock stays debuggable. */
export type Clock = () => number;
