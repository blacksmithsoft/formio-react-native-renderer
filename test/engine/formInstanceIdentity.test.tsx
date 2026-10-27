// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { act, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useFormioForm, type FormioFormInstance } from '../../src/index';
import { render } from '../support/render';

const schema = { components: [{ type: 'textfield', key: 'name', label: 'Name', input: true }] };

describe('form instance identity', () => {
  it('stays the same across host renders that change nothing, even with an inline onChange', () => {
    const seen: FormioFormInstance[] = [];
    let rerenderHost: () => void = () => undefined;

    function Host() {
      const [, setTick] = useState(0);
      rerenderHost = () => setTick((tick) => tick + 1);
      seen.push(useFormioForm(schema, undefined, { onChange: () => undefined }));
      return null;
    }

    render(<Host />);
    act(() => rerenderHost());
    act(() => rerenderHost());

    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(new Set(seen).size).toBe(1);
  });

  it('changes when the data changes, and reports the change to the latest onChange', () => {
    const seen: FormioFormInstance[] = [];
    const reports: string[] = [];
    let label = 'first';
    let rerenderHost: () => void = () => undefined;

    function Host() {
      const [, setTick] = useState(0);
      rerenderHost = () => setTick((tick) => tick + 1);
      const current = label;
      seen.push(useFormioForm(schema, undefined, { onChange: () => reports.push(current) }));
      return null;
    }

    render(<Host />);
    label = 'second';
    act(() => rerenderHost());
    act(() => seen[seen.length - 1]!.setValue('name', 'Ada'));

    expect(seen[seen.length - 1]!.data).toMatchObject({ name: 'Ada' });
    expect(new Set(seen).size).toBe(2);
    expect(reports).toEqual(['second']);
  });
});
