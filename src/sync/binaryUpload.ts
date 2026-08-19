// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * Phase one of the two-phase binary sync — docs/FORMS.md §9.
 *
 * On the web, Form.io posts a file to storage the moment it is chosen and stores the resulting
 * URL in the submission. Offline that is impossible, so a captured file lands in the submission
 * as `{ storage: 'local', localUri }` and this module resolves it later:
 *
 *   1. upload each binary, 2. rewrite its entry to `{ storage: 'url', url }`, 3. *then* post.
 *
 * The order is the whole point. Post first and the server stores a submission pointing at a
 * `file://` path on one particular phone — a reference that is meaningless everywhere else and
 * looks, in the database, exactly like a successful submission.
 */

import { getAtPath, setAtPath } from '../engine/dataPaths';
import type { SubmissionData } from '../engine/formState';
import type { FormioFileValue } from '../form/context';
import type { BinaryUploader } from './types';

/** A binary still living on the device, and where in the submission it sits. */
export interface PendingBinary {
  /** Absolute path to the file entry, including its index: `photos[1]`. */
  path: string;
  file: FormioFileValue;
}

/**
 * A file entry whose binary is still on the device.
 *
 * Deliberately defined as "not yet a URL" rather than as an allowlist of offline markers. Hosts
 * label the offline state differently — this package writes `'local'`, the Vise backend's upload
 * endpoint uses `'mobile'` — and a marker the sync layer does not recognise is not an error
 * anybody sees. It is a submission that posts looking complete while the photo it refers to never
 * leaves the phone.
 */
function isLocalFile(value: unknown): value is FormioFileValue {
  if (typeof value !== 'object' || value === null) return false;
  const file = value as FormioFileValue;
  return typeof file.storage === 'string' && file.storage !== 'url' && typeof file.localUri === 'string';
}

/**
 * Find every un-uploaded binary in a submission.
 *
 * Walks the data rather than the schema. A file can be nested inside a datagrid row, inside a
 * container, inside another grid, and the data already knows exactly where it ended up — whereas
 * re-deriving those paths from the schema means duplicating the engine's row expansion and being
 * wrong the first time somebody nests a grid.
 */
export function collectPendingBinaries(data: SubmissionData): PendingBinary[] {
  const found: PendingBinary[] = [];

  const walk = (value: unknown, path: string): void => {
    if (isLocalFile(value)) {
      found.push({ path, file: value });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    if (typeof value === 'object' && value !== null) {
      for (const [key, item] of Object.entries(value)) {
        walk(item, path ? `${path}.${key}` : key);
      }
    }
  };

  walk(data, '');
  return found;
}

/** True when nothing in this submission still points at the device's filesystem. */
export function isReadyToPost(data: SubmissionData): boolean {
  return collectPendingBinaries(data).length === 0;
}

export interface UploadBinariesOptions {
  data: SubmissionData;
  formPath: string;
  entryId: string;
  uploader: BinaryUploader;
  /**
   * Called after each successful upload with the partially rewritten data.
   *
   * The caller persists it. That is what makes an interrupted upload resumable: five photos that
   * got three of the way through resume at the fourth instead of starting over on a connection
   * that already proved it cannot hold.
   */
  onProgress?: (data: SubmissionData, done: number, total: number) => Promise<void> | void;
}

/**
 * Upload every pending binary and return the submission with its references rewritten.
 *
 * Uploads run one at a time. Parallel uploads on a saturated field connection are slower in
 * practice and make partial progress much harder to reason about.
 */
export async function uploadBinaries(options: UploadBinariesOptions): Promise<SubmissionData> {
  const pending = collectPendingBinaries(options.data);
  let data = options.data;

  for (const [index, binary] of pending.entries()) {
    const result = await options.uploader.upload(binary.file, {
      formPath: options.formPath,
      entryId: options.entryId,
    });

    // Re-read the entry rather than reusing the captured one: an earlier rewrite may have
    // replaced the array that holds it.
    const current = getAtPath(data, binary.path);
    const source = isLocalFile(current) ? current : binary.file;

    const uploaded: FormioFileValue =
      'file' in result
        ? result.file
        : {
            storage: 'url',
            name: source.name,
            originalName: source.originalName ?? source.name,
            size: source.size,
            type: source.type,
            url: result.url,
          };

    data = setAtPath(data, binary.path, uploaded);
    await options.onProgress?.(data, index + 1, pending.length);
  }

  return data;
}
