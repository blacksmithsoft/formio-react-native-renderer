// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { parseForm } from '../src/engine/parseForm';
import { transformSchema } from '../src/compat/transformSchema';
import { collectPendingBinaries, isReadyToPost, uploadBinaries } from '../src/sync/binaryUpload';
import { mount } from './form/support';

/**
 * The types the Vise backend actually emits.
 *
 * The package is vendor-neutral and must stay that way, but "renders any schema" is a claim that
 * has to be checked against a real one. These are the distinct types found in the Vise form
 * builder and its stored templates: `custom_*` branded primitives, and `assignable_panel`, which
 * is a Vise invention with no Form.io equivalent.
 */

describe('branded custom_ types', () => {
  it('resolves to the stock type behind the prefix', () => {
    const form = parseForm({
      components: [
        { type: 'custom_textfield', key: 'note', label: 'Note', input: true },
        { type: 'custom_number', key: 'qty', label: 'Qty', input: true },
        { type: 'custom_textarea', key: 'detail', label: 'Detail', input: true },
        { type: 'custom_datagrid', key: 'lines', label: 'Lines', input: true, components: [] },
      ],
    });

    expect(form.components.map((component) => component.base)).toEqual([
      'textfield',
      'number',
      'textarea',
      'datagrid',
    ]);
    expect(form.issues).toEqual([]);
  });

  it('edits a custom_datagrid exactly like a datagrid', () => {
    const view = mount({
      components: [
        {
          type: 'custom_datagrid',
          key: 'lines',
          label: 'Lines',
          input: true,
          components: [{ type: 'custom_textfield', key: 'qty', label: 'Qty', input: true }],
        },
      ],
    });

    view.press('Add Another');
    view.type(0, 'first');
    view.type(1, 'second');
    expect(view.handle().getData()).toEqual({ lines: [{ qty: 'first' }, { qty: 'second' }] });
  });
});

describe('assignable_panel', () => {
  /** As the Vise builder emits it: a layout wrapper that happens to carry a key. */
  const schema = {
    components: [
      {
        type: 'assignable_panel',
        key: '_vAssignablePanel',
        label: 'Site checks',
        input: false,
        components: [
          { type: 'custom_textfield', key: 'inspector', label: 'Inspector', input: true },
          { type: 'custom_number', key: 'headcount', label: 'Headcount', input: true },
        ],
      },
    ],
  };

  it('keeps its children at the top level rather than scoping them under its key', () => {
    const view = mount(schema);
    view.type(0, 'A. Rahman');
    view.type(1, '12');

    // The wrapper is not a data scope. Scoping these under `_vAssignablePanel` would send the
    // server a shape it has never seen, for every Vise form that uses one.
    expect(view.handle().getData()).toEqual({ inspector: 'A. Rahman', headcount: 12 });
  });

  it('still draws everything inside it', () => {
    const view = mount(schema);
    expect(view.inputs()).toHaveLength(2);
  });

  it('warns rather than blocking, so the form stays submittable', () => {
    const view = mount(schema);
    expect(view.handle().getBlockingIssues()).toEqual([]);
    expect(view.run((handle) => handle.submit())).not.toBeNull();
  });

  it('is treated as a panel by the transform, and the branded primitives beside it are not flagged', async () => {
    const result = await transformSchema(schema);

    expect(result.changes).toEqual([]);
    expect(result.schema).toMatchObject({
      components: [{ type: 'assignable_panel', key: '_vAssignablePanel' }],
    });
  });
});

describe('the system field keys Vise fills in', () => {
  it('round-trips a value on a key the renderer never draws', () => {
    const view = mount({
      components: [
        { type: 'hidden', key: '_vProjectName', input: true },
        { type: 'custom_textfield', key: 'note', label: 'Note', input: true },
      ],
    });

    view.run((handle) => handle.reset({ _vProjectName: 'North Yard', note: '' }));
    view.type(0, 'checked');

    expect(view.handle().getData()).toEqual({ _vProjectName: 'North Yard', note: 'checked' });
  });
});

describe('a Vise image placeholder', () => {
  // The Vise upload flow writes `{ storage: 'mobile' }` into the submission and the server swaps
  // it for a URL when the file arrives. A submission still holding one has not finished syncing,
  // exactly like a `'local'` entry — and failing to notice that is not a visible error, it is a
  // submission that posts looking complete while the photo never leaves the phone.
  const data = { _vImage: [{ storage: 'mobile' as const, name: 'photo-1.jpg', localUri: 'file:///p/1.jpg' }] };

  it('is recognised as a binary that has not been uploaded yet', () => {
    expect(collectPendingBinaries(data).map((item) => item.path)).toEqual(['_vImage[0]']);
    expect(isReadyToPost(data)).toBe(false);
  });

  it('takes the finished entry from a backend that rewrites it server-side', async () => {
    const uploaded = await uploadBinaries({
      data,
      formPath: 'dwo',
      entryId: 'e1',
      uploader: {
        upload: async () => ({
          file: {
            storage: 'url',
            name: 'photo-1.jpg',
            url: 'https://vise.example.com/p1/forms/images/e1/photo-1.jpg',
            // The server decides these; rebuilding the entry from a bare URL would guess.
            originalName: 'IMG_0421.HEIC',
            type: 'image/jpeg',
          },
        }),
      },
    });

    expect(uploaded._vImage).toEqual([
      {
        storage: 'url',
        name: 'photo-1.jpg',
        url: 'https://vise.example.com/p1/forms/images/e1/photo-1.jpg',
        originalName: 'IMG_0421.HEIC',
        type: 'image/jpeg',
      },
    ]);
    expect(isReadyToPost(uploaded)).toBe(true);
  });
});
