// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { mount } from './support';

describe('datamap', () => {
  const schema = {
    components: [
      {
        type: 'datamap',
        key: 'extraMeta',
        label: 'Extra Metadata',
        input: true,
        keyLabel: 'Key',
        valueComponent: { type: 'textfield', key: 'value', label: 'Value', input: true },
      },
    ],
  };

  it('stores a Record of values, not an array of rows', () => {
    const view = mount(schema);
    expect(view.handle().getBlockingIssues()).toEqual([]);
    view.press('Add Another');
    // First input is the key (defaults to "key"), second is the value.
    view.type(1, 'NY-1');
    expect(view.handle().getData()).toEqual({ extraMeta: { key: 'NY-1' } });
  });

  it('renames a key on blur without dropping the value', () => {
    const view = mount(schema);
    view.press('Add Another');
    view.type(0, 'siteCode');
    view.type(1, 'NY-1');
    expect(view.handle().getData()).toEqual({ extraMeta: { siteCode: 'NY-1' } });
  });
});

describe('tree', () => {
  const schema = {
    components: [
      {
        type: 'tree',
        key: 'wbsTree',
        label: 'WBS Tree',
        input: true,
        components: [
          { type: 'textfield', key: 'nodeName', label: 'Node', input: true },
          { type: 'textfield', key: 'nodeCode', label: 'Code', input: true },
        ],
      },
    ],
  };

  it('writes the Form.io { data, children } node shape', () => {
    const view = mount(schema);
    expect(view.handle().getBlockingIssues()).toEqual([]);
    view.type(0, 'Foundation');
    view.type(1, 'WBS-01');
    expect(view.handle().getData()).toEqual({
      wbsTree: { data: { nodeName: 'Foundation', nodeCode: 'WBS-01' }, children: [] },
    });
  });

  it('adds a child node under children', () => {
    const view = mount(schema);
    view.press('Add Child');
    view.type(2, 'Piles');
    view.type(3, 'WBS-01.1');
    expect(view.handle().getData()).toEqual({
      wbsTree: {
        data: {},
        children: [{ data: { nodeName: 'Piles', nodeCode: 'WBS-01.1' }, children: [] }],
      },
    });
  });
});
