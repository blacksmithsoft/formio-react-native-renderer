// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { act } from 'react';
import { Text } from 'react-native';
import { describe, expect, it } from 'vitest';
import { FormioWindowedRows, useFormioContainerWidth } from '../../src/index';
import type { FormioControlProps, FormScrollWindow } from '../../src/form/context';
import { render, texts } from '../support/render';
import { mount } from './support';

const ROWS = 100;
const ROW_HEIGHT = 40;

function CrewTable() {
  return (
    <FormioWindowedRows
      count={ROWS}
      estimatedRowHeight={ROW_HEIGHT}
      keyForRow={(index) => `crew-${index}`}
      renderRow={(index) => <Text>{`row-${index}`}</Text>}
    />
  );
}

const crewSchema = {
  components: [{ type: 'textfield', key: 'crew', label: 'Crew', input: true }],
};

/** A host scroller whose position the test moves by hand. */
function scrollStore(initial: FormScrollWindow) {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    metrics: {
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getSnapshot: () => snapshot,
    },
    scrollTo: (next: FormScrollWindow) => {
      snapshot = next;
      act(() => listeners.forEach((listener) => listener()));
    },
  };
}

const drawnRows = (strings: string[]) =>
  strings.filter((text) => /^row-\d+$/.test(text)).map((text) => Number(text.slice(4)));

describe('FormioWindowedRows', () => {
  it('draws every row outside a form, where there is no scroller to window against', () => {
    const renderer = render(<CrewTable />);
    expect(drawnRows(texts(renderer))).toHaveLength(ROWS);
  });

  it('draws every row inside a form whose host publishes no scroll metrics', () => {
    const view = mount(crewSchema, { overrides: { byKey: { crew: CrewTable } } });
    expect(drawnRows(view.texts())).toHaveLength(ROWS);
  });

  it('mounts only the rows near the visible window of the host scroller', () => {
    const scroll = scrollStore({ y: 0, height: 200 });
    const view = mount(crewSchema, {
      overrides: { byKey: { crew: CrewTable } },
      scrollMetrics: scroll.metrics,
    });

    const rows = drawnRows(view.texts());
    expect(rows[0]).toBe(0);
    expect(rows.length).toBeGreaterThan(200 / ROW_HEIGHT);
    expect(rows.length).toBeLessThan(ROWS / 4);
  });

  it('moves the mounted slice as the host scrolls, keeping the count flat', () => {
    const scroll = scrollStore({ y: 0, height: 200 });
    const view = mount(crewSchema, {
      overrides: { byKey: { crew: CrewTable } },
      scrollMetrics: scroll.metrics,
    });
    // The viewport's rows plus four of overscan on each side, wherever the window sits.
    const ceiling = 200 / ROW_HEIGHT + 2 * 4 + 1;

    scroll.scrollTo({ y: 50 * ROW_HEIGHT, height: 200 });
    const rows = drawnRows(view.texts());
    expect(rows).toContain(50);
    expect(rows).not.toContain(0);
    expect(rows).not.toContain(ROWS - 1);
    expect(rows.length).toBeLessThanOrEqual(ceiling);

    scroll.scrollTo({ y: ROWS * ROW_HEIGHT, height: 200 });
    expect(drawnRows(view.texts())).toContain(ROWS - 1);
  });
});

describe('container width', () => {
  it('re-renders only the readers of the width when the form is re-measured', () => {
    let fieldRenders = 0;
    function CountingField(_props: FormioControlProps) {
      fieldRenders += 1;
      return null;
    }

    const view = mount(
      {
        components: [
          { type: 'textfield', key: 'a', label: 'A', input: true },
          { type: 'textfield', key: 'b', label: 'B', input: true },
        ],
      },
      { overrides: { byKey: { a: CountingField } } }
    );
    const settled = fieldRenders;

    view.measure(800);
    view.measure(1280);
    view.measure(800);

    expect(fieldRenders).toBe(settled);
  });

  it('hands the measured width to a reader', () => {
    let widthSeen: number | undefined;
    function WidthReader(_props: FormioControlProps) {
      widthSeen = useFormioContainerWidth();
      return null;
    }
    const view = mount(
      { components: [{ type: 'textfield', key: 'w', label: 'W', input: true }] },
      { overrides: { byKey: { w: WidthReader } } }
    );
    expect(widthSeen).toBeUndefined();
    view.measure(1280);
    expect(widthSeen).toBe(1280);
    view.measure(1280.4);
    expect(widthSeen).toBe(1280);
  });
});
