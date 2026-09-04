// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { parseForm } from '../../src/engine/parseForm';
import { validateForm } from '../../src/engine/formState';
import { mount } from './support';

describe('compat types that used to warn', () => {
  it('draws assignable_panel as a titled panel with no warning', () => {
    const view = mount({
      components: [
        {
          type: 'assignable_panel',
          key: '_vAssignablePanel',
          title: 'Site checks',
          input: false,
          collapsible: true,
          components: [
            { type: 'custom_textfield', key: 'inspector', label: 'Inspector', input: true },
            { type: 'custom_number', key: 'headcount', label: 'Headcount', input: true },
          ],
        },
      ],
    });

    expect(view.texts().join(' ')).toContain('Site checks');
    expect(view.texts().join(' ')).not.toContain('Shown differently on mobile');
    expect(view.handle().getBlockingIssues()).toEqual([]);
    view.type(0, 'A. Rahman');
    expect(view.handle().getData()).toEqual({ inspector: 'A. Rahman' });
  });

  it('edits a location as address plus coordinates', () => {
    const view = mount({
      components: [{ type: 'location', key: 'mapLocation', label: 'Map Location', input: true }],
    });

    expect(view.texts().join(' ')).not.toContain('Shown differently on mobile');
    view.type(0, 'North Yard');
    view.type(1, '24.7');
    view.type(2, '46.7');
    expect(view.handle().getData()).toEqual({
      mapLocation: { address: 'North Yard', lat: 24.7, lng: 46.7 },
    });
  });

  it('captures a custom JSON field as multiline text', () => {
    const view = mount({
      components: [{ type: 'custom', key: 'jsonCustom', label: 'Custom JSON field', input: true }],
    });

    expect(view.texts().join(' ')).not.toContain('Shown differently on mobile');
    view.type(0, '{"ok":true}');
    expect(view.handle().getData()).toEqual({ jsonCustom: '{"ok":true}' });
  });

  it('summarises reviewpage fields from the live submission', () => {
    const view = mount({
      components: [
        { type: 'textfield', key: 'siteName', label: 'Site Name', input: true },
        {
          type: 'reviewpage',
          key: 'reviewPage',
          label: 'Review Page',
          input: true,
          fields: ['siteName'],
        },
      ],
    });

    view.type(0, 'North Yard');
    const text = view.texts().join(' ');
    expect(text).not.toContain('Shown differently on mobile');
    expect(text).toContain('Review Page');
    expect(text).toContain('Site Name');
    expect(text).toContain('North Yard');
    expect(view.handle().getData()).toEqual({ siteName: 'North Yard' });
  });

  it('edits edittable and datatable as data grids', () => {
    const view = mount({
      components: [
        {
          type: 'edittable',
          key: 'editTable',
          label: 'Edit Table',
          input: true,
          components: [{ type: 'textfield', key: 'colA', label: 'Column A', input: true }],
        },
      ],
    });

    expect(view.texts().join(' ')).not.toContain('Shown differently on mobile');
    view.type(0, 'alpha');
    expect(view.handle().getData()).toEqual({ editTable: [{ colA: 'alpha' }] });
  });

  it('edits dynamicWizard as an edit grid', () => {
    const view = mount({
      components: [
        {
          type: 'dynamicWizard',
          key: 'dynamicWizard',
          label: 'Dynamic Wizard',
          input: true,
          components: [{ type: 'textfield', key: 'stepName', label: 'Name', input: true }],
        },
      ],
    });

    expect(view.texts().join(' ')).not.toContain('Shown differently on mobile');
    view.press('Add Another');
    view.type(0, 'Owner');
    expect(view.handle().getData()).toEqual({ dynamicWizard: [{ stepName: 'Owner' }] });
  });

  it('does not draw remote selects or other network-only widgets', () => {
    const view = mount({
      components: [
        {
          type: 'select',
          key: 'trades',
          label: 'Trades (multi)',
          input: true,
          multiple: true,
          data: { values: [{ label: 'Welding', value: 'welding' }] },
        },
        {
          type: 'select',
          key: 'resourceSelect',
          label: 'Linked Resource (select dataSrc)',
          input: true,
          dataSrc: 'resource',
          data: { resource: 'users' },
        },
        {
          type: 'select',
          key: 'urlSelect',
          label: 'URL-backed Select',
          input: true,
          dataSrc: 'url',
          data: { url: 'https://example.com/api/options' },
        },
        { type: 'resource', key: 'relatedResource', label: 'Linked Resource component', input: true },
      ],
    });

    const text = view.texts().join(' ');
    expect(text).toContain('Trades (multi)');
    expect(text).not.toContain('Shown differently on mobile');
    expect(text).not.toContain('Linked Resource (select dataSrc)');
    expect(text).not.toContain('URL-backed Select');
    expect(text).not.toContain('Linked Resource component');
    expect(view.handle().getBlockingIssues()).toEqual([]);
  });

  it('does not block a form that only uses these types', () => {
    const parsed = parseForm({
      components: [
        { type: 'location', key: 'mapLocation', input: true },
        { type: 'assignable_panel', key: 'p', input: false, components: [] },
        { type: 'custom', key: 'jsonCustom', input: true },
        { type: 'reviewpage', key: 'reviewPage', input: true, fields: ['mapLocation'] },
        { type: 'edittable', key: 'editTable', input: true, components: [] },
        { type: 'datatable', key: 'departmentTable', input: true, components: [] },
        { type: 'dynamicWizard', key: 'dynamicWizard', input: true, components: [] },
        { type: 'resource', key: 'relatedResource', input: true },
      ],
    });
    expect(parsed.issues).toEqual([]);
    expect(validateForm(parsed, {}).blocked).toBe(false);
  });
});
