// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import type { ReactTestInstance } from 'react-test-renderer';
import { parseForm } from '../../src/engine/parseForm';
import type { FormComponent } from '../../src/engine/types';
import { FormioRenderer } from '../../src/form/FormioRenderer';
import { defaultFormioTheme } from '../../src/theme/defaultTheme';
import { resolvePhoneTheme } from '../../src/theme/mergeTheme';
import { __setWindowSize } from '../mocks/react-native';
import { hostNodes, styleOf } from '../support/render';
import { mount, type Mounted } from './support';

/** The phone layout, drawn — docs/FORMS.md §8. The planning rules are in phoneLayout.test.ts. */

const PHONE = 390;
const TABLET = 1024;

const text = (key: string, extra: Record<string, unknown> = {}) => ({
  type: 'textfield',
  key,
  label: key,
  input: true,
  ...extra,
});
const number = (key: string, extra: Record<string, unknown> = {}) => ({
  type: 'number',
  key,
  label: key,
  input: true,
  ...extra,
});
const panel = (title: string, components: unknown[], extra: Record<string, unknown> = {}) => ({
  type: 'panel',
  key: `panel${title.replace(/\W/g, '')}`,
  title,
  components,
  ...extra,
});

const phone = (schema: unknown, options: Parameters<typeof mount>[1] = {}): Mounted => {
  const view = mount(schema, options);
  view.measure(PHONE);
  return view;
};

/** Rows of two, as the number of cells each holds. */
const pairs = (view: Mounted): number[] =>
  hostNodes(view.renderer, 'View')
    .filter((node) => {
      const style = styleOf(node);
      return style.flexDirection === 'row' && style.alignItems === 'flex-end';
    })
    .map((node) => node.children.length);

const sidewaysScrollers = (view: Mounted): ReactTestInstance[] =>
  hostNodes(view.renderer, 'ScrollView').filter((node) => node.props.horizontal);

const header = (view: Mounted, title: string): ReactTestInstance => {
  const found = view
    .pressables()
    .find((node) => node.props.accessibilityState?.expanded !== undefined && JSON.stringify(textsIn(node)).includes(title));
  if (!found) throw new Error(`no card titled ${title}`);
  return found;
};

const textsIn = (node: ReactTestInstance): unknown[] =>
  node.findAll((child) => (child.type as unknown as string) === 'Text').map((child) => child.props.children);

afterEach(() => {
  __setWindowSize();
  vi.useRealTimers();
});

describe('choosing the layout', () => {
  const schema = { components: [panel('Details', [text('inside')])] };
  // On a phone a titled panel starts closed, so whether its field is drawn tells the two apart.
  const isPhone = (view: Mounted) => view.inputs().length === 0;

  it('stays wide until it is measured, in a window that could hold a wide form', () => {
    expect(isPhone(mount(schema))).toBe(false);
  });

  it('switches to the phone layout below the breakpoint and back at it', () => {
    const view = mount(schema);
    view.measure(599);
    expect(isPhone(view)).toBe(true);
    view.measure(600);
    expect(isPhone(view)).toBe(false);
  });

  it('starts in the phone layout when the window itself is under the breakpoint', () => {
    // A container cannot be wider than its window, so there is nothing to wait for — and
    // waiting would mount the whole wide form first, for one frame, on every phone.
    __setWindowSize({ width: PHONE, height: 844 });
    expect(isPhone(mount(schema))).toBe(true);
  });

  it('follows the container, not the window, once the container has been measured', () => {
    // A form in one pane of a split view: the window is wide, the form is not.
    const view = mount(schema);
    view.measure(PHONE);
    expect(isPhone(view)).toBe(true);
  });

  it('can be pinned either way by the host', () => {
    expect(isPhone(mount(schema, { layout: 'phone' }))).toBe(true);
    const pinnedWide = mount(schema, { layout: 'wide' });
    pinnedWide.measure(PHONE);
    expect(isPhone(pinnedWide)).toBe(false);
  });

  it('draws with the phone metrics while the phone layout is active', () => {
    const labelSize = (view: Mounted) =>
      styleOf(hostNodes(view.renderer, 'Text').find((node) => textsIn(node).length && node.props.children?.[0] === 'name')!)
        .fontSize;
    const fields = { components: [text('name')] };

    const wide = mount(fields);
    wide.measure(TABLET);
    expect(labelSize(wide)).toBe(defaultFormioTheme.metrics.label.fontSize);
    expect(labelSize(phone(fields))).toBe(resolvePhoneTheme(defaultFormioTheme).metrics.label.fontSize);
  });
});

describe('rows of at most two', () => {
  const fourAcross = {
    components: [
      {
        type: 'columns',
        key: 'row',
        columns: ['a', 'b', 'c', 'd'].map((key) => ({ width: 3, size: 'md', components: [number(key)] })),
      },
    ],
  };

  it('folds four across into two rows of two', () => {
    const view = phone(fourAcross);
    expect(pairs(view)).toEqual([2, 2]);
    expect(view.inputs()).toHaveLength(4);
  });

  it('keeps the authored row on a tablet', () => {
    const view = mount(fourAcross);
    view.measure(TABLET);
    expect(pairs(view)).toEqual([]);
  });

  it('writes each field to the path it had in the authored layout', () => {
    const view = phone({
      components: [
        { type: 'container', key: 'site', input: true, components: [number('floors'), number('units')] },
      ],
    });
    expect(pairs(view)).toEqual([2]);
    view.type(1, '4');
    expect(view.handle().getData()).toMatchObject({ site: { units: 4 } });
  });

  it('re-pairs when a conditional field appears between two others', () => {
    const view = phone({
      components: [
        number('a'),
        number('b', { conditional: { show: true, when: 'a', eq: 1 } }),
        number('c'),
      ],
    });
    expect(pairs(view)).toEqual([2]);
    expect(view.inputs()).toHaveLength(2);

    view.type(0, '1');
    expect(view.inputs()).toHaveLength(3);
    // a|b, then c alone: still never three.
    expect(pairs(view)).toEqual([2]);
  });
});

describe('nothing scrolls sideways', () => {
  const schema = {
    components: [
      {
        type: 'tabs',
        key: 'tabs',
        components: [
          { key: 'one', label: 'One', components: [text('first')] },
          { key: 'two', label: 'Two', components: [text('second')] },
        ],
      },
      {
        type: 'datagrid',
        key: 'rows',
        label: 'Rows',
        input: true,
        displayAsTable: true,
        defaultValue: [{ a: '1', b: '2' }],
        components: [text('a'), text('b')],
      },
      {
        type: 'content',
        key: 'legend',
        html: '<table><tr><th>Code</th><th>Meaning</th></tr><tr><td>A</td><td>Approved</td></tr></table>',
      },
    ],
  };

  it('has three sideways scrollers on a tablet', () => {
    const view = mount(schema);
    view.measure(TABLET);
    expect(sidewaysScrollers(view).length).toBe(3);
  });

  it('has none on a phone, and still draws all three', () => {
    const view = phone(schema);
    expect(sidewaysScrollers(view)).toHaveLength(0);
    expect(hostNodes(view.renderer, 'ScrollView')).toHaveLength(0);

    const drawn = view.texts();
    expect(drawn).toEqual(expect.arrayContaining(['One', 'Two', 'Rows', 'Code', 'Approved']));
    expect(view.inputs().length).toBeGreaterThanOrEqual(3);
  });
});

describe('an HTML table of inputs', () => {
  const cell = (name: string) => `<td><input type="text" name="data[${name}]"></td>`;
  const schema = {
    components: [
      {
        type: 'content',
        key: 'readings',
        html: `<table>
          <tr><th>Up</th><th>Down</th><th>Mean</th><th>Error</th></tr>
          <tr>${cell('up')}${cell('down')}${cell('mean')}${cell('error')}</tr>
        </table>`,
      },
    ],
  };

  it('is drawn two inputs to a row, each under the column heading it had', () => {
    const view = phone(schema);
    expect(view.inputs()).toHaveLength(4);
    expect(pairs(view)).toEqual([2, 2]);
    expect(view.texts()).toEqual(['Up', 'Down', 'Mean', 'Error']);
  });

  it('still writes each input to the key it was bound to', () => {
    const view = phone(schema);
    act(() => view.inputs()[2]?.props.onChangeText('21.5'));
    expect(view.handle().getData()).toMatchObject({ mean: '21.5' });
  });
});

describe('sections as cards', () => {
  it('starts every titled section closed, whatever the schema says about collapsing', () => {
    const view = phone({
      components: [
        panel('Plain', [text('a')]),
        panel('Open in a browser', [text('b')], { collapsible: true, collapsed: false }),
        { type: 'fieldset', key: 'set', legend: 'Fieldset', components: [text('c')] },
      ],
    });
    expect(view.inputs()).toHaveLength(0);
    expect(view.texts()).toEqual(expect.arrayContaining(['Plain', 'Open in a browser', 'Fieldset']));
  });

  it('opens and closes a card from its header, and says which it is', () => {
    const view = phone({ components: [panel('Details', [text('inside')])] });
    expect(header(view, 'Details').props.accessibilityState).toEqual({ expanded: false });

    view.press('Details');
    expect(view.inputs()).toHaveLength(1);
    expect(header(view, 'Details').props.accessibilityState).toEqual({ expanded: true });

    view.press('Details');
    expect(view.inputs()).toHaveLength(0);
  });

  it('keeps what was typed when a card is closed and opened again', () => {
    const view = phone({ components: [panel('Details', [text('inside')])] });
    view.press('Details');
    view.type(0, 'kept');
    view.press('Details');
    view.press('Details');
    expect(view.inputs()[0]?.props.value).toBe('kept');
    expect(view.handle().getData()).toEqual({ inside: 'kept' });
  });

  it('leaves an untitled section open, since it has no header to open it with', () => {
    const view = phone({ components: [{ type: 'panel', key: 'bare', components: [text('inside')] }] });
    expect(view.inputs()).toHaveLength(1);
    expect(view.pressables()).toHaveLength(0);
  });

  it('gathers fields outside any section into a card that is always open', () => {
    const view = phone({ components: [text('before'), panel('Details', [text('inside')]), text('after')] });
    expect(view.inputs()).toHaveLength(2);
    // before-card, Details, after-card: three cards with the card's own border.
    const cards = hostNodes(view.renderer, 'View').filter(
      (node) => styleOf(node).borderRadius === resolvePhoneTheme(defaultFormioTheme).metrics.panel.radius
    );
    expect(cards).toHaveLength(3);
  });

  it('nests a titled section as a closed card inside its parent', () => {
    const view = phone({ components: [panel('Outer', [text('top'), panel('Inner', [text('deep')])])] });
    view.press('Outer');
    expect(view.inputs()).toHaveLength(1);
    expect(view.texts()).toContain('Inner');

    view.press('Inner');
    expect(view.inputs()).toHaveLength(2);
  });

  it('draws a table of several rows as one card per row', () => {
    const view = phone({
      components: [
        {
          type: 'table',
          key: 'crew',
          rows: [
            [{ components: [text('name1')] }, { components: [number('hours1')] }],
            [{ components: [text('name2')] }, { components: [number('hours2')] }],
          ],
        },
      ],
    });
    expect(view.inputs()).toHaveLength(4);
    expect(pairs(view)).toEqual([2, 2]);
  });
});

describe('a data grid as record cards', () => {
  const certificates = (extra: Record<string, unknown> = {}) => ({
    type: 'datagrid',
    key: 'certificates',
    label: 'Certificates',
    input: true,
    addAnother: 'Add Certificate',
    defaultValue: [{ type: 'Hot Work' }, { type: 'Confined Space' }],
    components: [
      { type: 'checkbox', key: 'required', label: ' ', input: true },
      text('type', { label: 'Type', disabled: true }),
      number('validFor', { label: 'Valid for' }),
      number('copies', { label: 'Copies' }),
    ],
    ...extra,
  });

  it('heads the section with the grid label and a count of its rows', () => {
    const view = phone({ components: [certificates()] });
    expect(view.texts()).toEqual(expect.arrayContaining(['Certificates', '2']));
  });

  it('names each card after the column that identifies the row', () => {
    const view = phone({ components: [certificates()] });
    const drawn = view.texts();
    expect(drawn).toEqual(expect.arrayContaining(['Hot Work', 'Confined Space']));
    // The column that became the heading is its caption, once per card, and not a field as well.
    expect(drawn.filter((entry) => entry === 'Type')).toHaveLength(2);
    expect(view.inputs()).toHaveLength(4);
  });

  it('lays a card’s fields out by the same rules as any other card', () => {
    const view = phone({ components: [certificates()] });
    expect(pairs(view)).toEqual([2, 2]);
  });

  it('edits the row the card belongs to', () => {
    const view = phone({ components: [certificates()] });
    view.type(2, '7');
    expect(view.handle().getData()).toMatchObject({
      certificates: [{ type: 'Hot Work' }, { type: 'Confined Space', validFor: 7 }],
    });
  });

  it('adds a card, numbered when it has nothing to be named after', () => {
    const view = phone({ components: [certificates()] });
    view.press('Add Certificate');
    expect(view.texts()).toEqual(expect.arrayContaining(['3', 'Certificate #3']));
  });

  it('removes the card whose bin was pressed', () => {
    const view = phone({ components: [certificates()] });
    view.press('Remove Hot Work');
    expect(view.handle().getData()).toMatchObject({ certificates: [{ type: 'Confined Space' }] });
    expect(view.texts()).not.toContain('Hot Work');
  });

  it('offers neither add nor remove on a locked form, and keeps the cards', () => {
    const view = phone({ components: [certificates()] }, { readOnly: true });
    expect(view.pressables()).toHaveLength(0);
    expect(view.texts()).toEqual(expect.arrayContaining(['Hot Work', 'Confined Space']));
    expect(view.inputs().every((input) => input.props.editable === false)).toBe(true);
  });

  it('says so when there are no rows', () => {
    const view = phone({ components: [certificates({ defaultValue: [] })] });
    expect(view.texts()).toEqual(expect.arrayContaining(['0', 'No entries yet.']));
  });

  it('is a labelled list of sub-cards when it sits inside a section', () => {
    const view = phone({ components: [panel('Permits', [certificates()])] });
    view.press('Permits');
    expect(view.texts()).toEqual(expect.arrayContaining(['Certificates', 'Hot Work', 'Confined Space']));
    // No count badge inside a card: the section header is the top-level treatment.
    expect(view.texts()).not.toContain('2');
  });
});

describe('every real template, on a phone', () => {
  const TEMPLATES = join(process.cwd(), 'test-templates');
  const files = readdirSync(TEMPLATES).filter((file) => file.endsWith('.json'));

  const isView = (node: ReactTestInstance | string): node is ReactTestInstance =>
    typeof node !== 'string' && (node.type as unknown as string) === 'View';
  // A field of its own, that is. The day, month and year boxes of one `day` field are a single
  // value typed in three short parts, and they are the only inputs with a length limit.
  const holdsInput = (node: ReactTestInstance): boolean =>
    node.findAll(
      (child) => (child.type as unknown as string) === 'TextInput' && child.props.maxLength === undefined
    ).length > 0;

  /** Open every card, including the ones that only exist once their parent is open. */
  const openAll = (view: Mounted): void => {
    for (let pass = 0; pass < 10; pass += 1) {
      const closed = view.pressables().filter((node) => node.props.accessibilityState?.expanded === false);
      if (closed.length === 0) return;
      for (const node of closed) act(() => node.props.onPress());
    }
    throw new Error('cards kept appearing closed');
  };

  it('has templates to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s fits: nothing sideways, no row over two', (file) => {
    const schema = JSON.parse(readFileSync(join(TEMPLATES, file), 'utf8')) as unknown;
    const view = mount(schema, { layout: 'phone' });
    openAll(view);

    expect(sidewaysScrollers(view)).toHaveLength(0);
    expect(pairs(view).every((cells) => cells === 2)).toBe(true);

    // Any row at all, whoever drew it: no more than two of its cells may hold a field.
    const crowded = hostNodes(view.renderer, 'View').filter(
      (node) =>
        styleOf(node).flexDirection === 'row' &&
        node.children.filter((child) => isView(child) && holdsInput(child)).length > 2
    );
    // Styles, not nodes: a failure should name the row, not print the tree under it.
    expect(crowded.map((node) => JSON.stringify(styleOf(node)))).toEqual([]);
  });

  /** Open every card and visit every Form.io tab; collect every string the tree drew. */
  const drawnText = (view: Mounted): Set<string> => {
    const seen = new Set<string>();
    const harvest = () => {
      for (const entry of view.texts()) {
        if (entry.trim()) seen.add(entry.trim());
      }
    };
    openAll(view);
    harvest();
    for (const tab of view.pressables().filter((node) => node.props.accessibilityRole === 'tab')) {
      act(() => tab.props.onPress());
      openAll(view);
      harvest();
    }
    return seen;
  };

  /**
   * Labels of leaf inputs the schema expects on screen.
   * Skips hidden fields, containers (wide tables reuse their label as a column header; phone
   * shows the children instead), unlabeled checkboxes, and conditional fields (wide table
   * headers can still name a column the phone correctly hides until the condition passes).
   */
  const expectedFieldLabels = (schema: unknown): string[] => {
    const labels = new Set<string>();
    const walk = (components: FormComponent[]) => {
      for (const component of components) {
        if (component.hidden) continue;
        const label = component.field.label.trim();
        const blankTick = component.base === 'checkbox' && label === '';
        if (
          component.role === 'input' &&
          label &&
          !blankTick &&
          !component.conditional
        ) {
          labels.add(label);
        }
        walk(component.children);
        for (const column of component.columns ?? []) walk(column.children);
        for (const tab of component.tabs ?? []) walk(tab.children);
        for (const row of component.tableRows ?? []) {
          for (const cell of row) walk(cell.children);
        }
      }
    };
    walk(parseForm(schema).components);
    return [...labels].sort();
  };

  it.each(files)('%s phone reaches every field label the wide layout reaches', (file) => {
    const schema = JSON.parse(readFileSync(join(TEMPLATES, file), 'utf8')) as unknown;
    const expected = expectedFieldLabels(schema);
    const phoneHit = drawnText(mount(schema, { layout: 'phone' }));
    const wideView = mount(schema, { layout: 'wide' });
    wideView.measure(TABLET);
    const wideHit = drawnText(wideView);

    // Chrome / row-count text may differ; a field the tablet can show must also appear on phone.
    const missingOnPhone = expected.filter((label) => wideHit.has(label) && !phoneHit.has(label));
    expect(missingOnPhone, file).toEqual([]);
  });

  it('keeps kitchen-sink Presence/Media/Nested as in-form tabs, not only those panes', () => {
    const schema = JSON.parse(readFileSync(join(TEMPLATES, 'mixed-formio-components.json'), 'utf8'));
    const view = mount(schema, { layout: 'phone' });
    openAll(view);
    // Sibling fields outside mixTabs must still be on screen (UID / Site Name), not sliced away.
    expect(view.texts()).toEqual(expect.arrayContaining(['Site Name', 'Contact Email', 'Presence', 'Media']));
    const tabs = view.pressables().filter((node) => node.props.accessibilityRole === 'tab');
    expect(tabs.map((node) => JSON.stringify(textsIn(node))).join(' ')).toMatch(/Presence/);
    expect(tabs.map((node) => JSON.stringify(textsIn(node))).join(' ')).toMatch(/Media/);
  });
});

describe('a failed submit', () => {
  const required = (key: string) => text(key, { validate: { required: true } });

  const scrollable = (schema: unknown): Mounted =>
    mount(schema, {
      element: (ref) => <FormioRenderer ref={ref} schema={schema} scrollable layout="phone" />,
    });

  it('opens the card that holds the first error and scrolls to it', () => {
    vi.useFakeTimers();
    const view = scrollable({ components: [panel('Site', [text('city')]), panel('Crew', [required('lead')])] });
    expect(view.inputs()).toHaveLength(0);

    expect(view.run((h) => h.submit())).toBeNull();
    expect(header(view, 'Crew').props.accessibilityState).toEqual({ expanded: true });
    expect(header(view, 'Site').props.accessibilityState).toEqual({ expanded: false });
    expect(view.texts()).toContain('lead is required');

    // The field did not exist when the submit failed; the scroll follows once it has mounted.
    expect(view.scrolls()).toEqual([]);
    act(() => {
      vi.runAllTimers();
    });
    expect(view.scrolls()).toHaveLength(1);
    expect(view.scrolls()[0]).toMatchObject({ animated: true });
  });

  it('opens every card on the way down to a nested error', () => {
    vi.useFakeTimers();
    const view = scrollable({ components: [panel('Outer', [panel('Inner', [required('deep')])])] });

    expect(view.run((h) => h.submit())).toBeNull();
    expect(view.inputs()).toHaveLength(1);
    act(() => {
      vi.runAllTimers();
    });
    expect(view.scrolls()).toHaveLength(1);
  });

  it('marks a card that is still closed over an error', () => {
    const view = scrollable({
      components: [panel('Site', [required('city')]), panel('Crew', [required('lead')]), panel('Notes', [text('note')])],
    });
    const dots = (title: string) =>
      header(view, title).findAll(
        (node) =>
          (node.type as unknown as string) === 'View' &&
          styleOf(node).backgroundColor === defaultFormioTheme.colors.status.danger
      ).length;

    expect(view.run((h) => h.submit())).toBeNull();
    // Site was opened for the first error, so its errors are on screen. Crew's are not.
    expect(dots('Site')).toBe(0);
    expect(dots('Crew')).toBe(1);
    expect(dots('Notes')).toBe(0);
  });

  it('scrolls straight to an error whose card is already open', () => {
    const view = scrollable({ components: [panel('Crew', [required('lead')])] });
    view.press('Crew');
    expect(view.run((h) => h.submit())).toBeNull();
    expect(view.scrolls()).toHaveLength(1);
  });
});
