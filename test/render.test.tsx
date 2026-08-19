// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import {
  FormioThemeProvider,
  parseSchemaNodes,
  SchemaFieldControl,
  SchemaLayoutRenderer,
  defaultFormioTheme,
  type FormioIconProps,
  type SchemaField,
  type SchemaLayoutNode,
} from '../src/index';
import { ChevronDownIcon } from '../src/theme/icons';
import { hostNodes, measure, render, styleOf, texts } from './support/render';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

/**
 * Rendering behaviour, asserted against the drawing contract in docs/COMPONENTS.md and the
 * layout rules in docs/SPEC.md §7–8.
 */

const { colors, metrics } = defaultFormioTheme;

function nodesOf(components: unknown[]): SchemaLayoutNode[] {
  return parseSchemaNodes(components);
}

function firstField(components: unknown[]): SchemaField {
  const node = nodesOf(components)[0];
  if (!node || node.kind !== 'field') throw new Error('expected a field node');
  return node.field;
}

function controlBoxes(renderer: ReactTestRenderer): ReactTestInstance[] {
  return hostNodes(renderer, 'View').filter((node) => styleOf(node).minHeight !== undefined);
}

function checkedMarks(renderer: ReactTestRenderer): ReactTestInstance[] {
  return hostNodes(renderer, 'View').filter(
    (node) => styleOf(node).backgroundColor === colors.brand.primary
  );
}

describe('field layout', () => {
  it('stacks label, control and description, with the required asterisk', () => {
    const renderer = render(
      <SchemaLayoutRenderer
        nodes={nodesOf([
          {
            type: 'textfield',
            key: 'name',
            label: 'Name',
            description: 'As it appears on site',
            validate: { required: true },
          },
        ])}
        values={{ name: 'Ada' }}
      />
    );

    expect(texts(renderer)).toEqual(['Name', ' *', 'Ada', 'As it appears on site']);
  });

  it('puts a left label in its own column at the authored width', () => {
    const renderer = render(
      <SchemaLayoutRenderer
        nodes={nodesOf([
          { type: 'textfield', key: 'p', label: 'Project', labelPosition: 'left-left', labelWidth: 30 },
        ])}
        values={{}}
      />
    );

    const labelColumn = hostNodes(renderer, 'View').find(
      (node) => styleOf(node).minWidth === metrics.label.minWidth
    );

    expect(labelColumn).toBeDefined();
    expect(styleOf(labelColumn!)).toMatchObject({
      flexBasis: '30%',
      paddingTop: metrics.label.baselineOffset,
    });
  });

  it('lets a checkbox own its label instead of drawing one above', () => {
    const renderer = render(
      <SchemaLayoutRenderer
        nodes={nodesOf([{ type: 'custom_checkbox', key: 'agree', label: 'I agree' }])}
        values={{ agree: 'true' }}
      />
    );

    expect(texts(renderer)).toEqual(['I agree']);
    expect(checkedMarks(renderer)).toHaveLength(1);
  });

  it('draws a panel title above its children', () => {
    const renderer = render(
      <SchemaLayoutRenderer
        nodes={nodesOf([
          {
            type: 'panel',
            key: 'details',
            title: 'Details',
            components: [{ type: 'textfield', key: 'ref', label: 'Ref' }],
          },
        ])}
        values={{ ref: 'A-1' }}
      />
    );

    expect(texts(renderer)).toEqual(['Details', 'Ref', 'A-1']);
  });

  it('draws nothing for an unsupported node', () => {
    const renderer = render(
      <SchemaLayoutRenderer
        nodes={nodesOf([{ type: 'datagrid', key: 'lines', label: 'Lines' }])}
        values={{}}
      />
    );

    expect(texts(renderer)).toEqual([]);
    // Only the measurement root remains.
    expect(hostNodes(renderer, 'View')).toHaveLength(1);
  });
});

describe('responsive columns', () => {
  const columns = nodesOf([
    {
      type: 'columns',
      key: 'row',
      columns: [
        { width: 4, components: [{ type: 'textfield', key: 'qty', label: 'Qty' }] },
        { width: 8, components: [{ type: 'textfield', key: 'unit', label: 'Unit' }] },
      ],
    },
  ]);

  function spans(renderer: ReactTestRenderer): unknown[] {
    return hostNodes(renderer, 'View')
      .map((node) => styleOf(node).flexBasis)
      .filter((basis) => basis !== undefined);
  }

  it('collapses below the breakpoint, pairing narrow columns two per row', () => {
    const renderer = render(<SchemaLayoutRenderer nodes={columns} values={{}} />);
    measure(renderer, metrics.grid.breakpoint - 1);

    expect(spans(renderer)).toEqual(['50%', '100%']);
  });

  it('keeps the authored spans at or above the breakpoint', () => {
    const renderer = render(<SchemaLayoutRenderer nodes={columns} values={{}} />);
    measure(renderer, metrics.grid.breakpoint);

    const [narrow, wide] = spans(renderer) as string[];
    expect(narrow?.startsWith('33.33')).toBe(true);
    expect(wide?.startsWith('66.66')).toBe(true);
  });

  it('assumes the narrow layout before the first measurement', () => {
    const renderer = render(<SchemaLayoutRenderer nodes={columns} values={{}} />);
    expect(spans(renderer)).toEqual(['50%', '100%']);
  });

  it('measures the container, not the window', () => {
    const renderer = render(<SchemaLayoutRenderer nodes={columns} values={{}} />);
    measure(renderer, 1280);
    measure(renderer, 500);

    expect(spans(renderer)).toEqual(['50%', '100%']);
  });
});

describe('controls', () => {
  it('shows the option label of a branded select, with a chevron', () => {
    const field = firstField([
      {
        type: 'custom_select',
        key: 'status',
        label: 'Status',
        data: { values: [{ label: 'Open', value: 'open' }] },
      },
    ]);
    const renderer = render(<SchemaFieldControl field={field} value="open" />);

    expect(texts(renderer)).toEqual(['Open']);
    expect(renderer.root.findAll((node) => node.type === ChevronDownIcon)).toHaveLength(1);
  });

  it('shows a placeholder, and never a stand-in, when empty', () => {
    const field = firstField([
      { type: 'textfield', key: 'a', label: 'A', placeholder: 'Enter a value' },
    ]);
    const renderer = render(<SchemaFieldControl field={field} value={undefined} />);

    expect(texts(renderer)).toEqual(['Enter a value']);
  });

  it('masks a password that is set and shows nothing when it is not', () => {
    const field = firstField([{ type: 'password', key: 'pw', label: 'Password' }]);

    expect(texts(render(<SchemaFieldControl field={field} value="hunter2" />))).toEqual([
      '••••••••',
    ]);
    expect(texts(render(<SchemaFieldControl field={field} value="" />))).toEqual(['']);
  });

  it('greys a disabled control', () => {
    const field = firstField([{ type: 'textfield', key: 'a', disabled: true }]);
    const renderer = render(<SchemaFieldControl field={field} value="x" />);

    expect(styleOf(controlBoxes(renderer)[0]!)).toMatchObject({
      backgroundColor: colors.surface.input,
      borderColor: colors.border.default,
    });
  });

  it('gives a textarea the taller box', () => {
    const field = firstField([{ type: 'custom_textarea', key: 'notes' }]);
    const renderer = render(<SchemaFieldControl field={field} value="long" />);

    expect(styleOf(controlBoxes(renderer)[0]!).minHeight).toBe(metrics.control.textareaMinHeight);
  });

  it('draws a currency prefix from the currency code', () => {
    const field = firstField([{ type: 'currency', key: 'cost', currency: 'USD' }]);
    expect(texts(render(<SchemaFieldControl field={field} value={1234.5} />))).toEqual([
      'USD',
      '1234.5',
    ]);
  });

  it('splits tags into chips and drops the empties', () => {
    const field = firstField([{ type: 'tags', key: 'tags' }]);
    const renderer = render(<SchemaFieldControl field={field} value="alpha, beta ,," />);

    expect(texts(renderer)).toEqual(['alpha', 'beta']);
  });

  it('reads a day value as month-first however it is displayed', () => {
    const field = firstField([
      {
        type: 'day',
        key: 'when',
        dayFirst: true,
        fields: { year: { hide: true } },
      },
    ]);
    const renderer = render(<SchemaFieldControl field={field} value="07/31/2026" />);

    expect(texts(renderer)).toEqual(['Day', '31', 'Month', '07']);
  });

  it('marks one radio per answered survey question', () => {
    const field = firstField([
      {
        type: 'survey',
        key: 'feedback',
        questions: [
          { label: 'Tidiness', value: 'tidy' },
          { label: 'Punctuality', value: 'punctual' },
        ],
        values: [
          { label: 'Poor', value: 'poor' },
          { label: 'Good', value: 'good' },
        ],
      },
    ]);
    const renderer = render(<SchemaFieldControl field={field} value={{ tidy: 'good' }} />);

    expect(texts(renderer)).toEqual(['Poor', 'Good', 'Tidiness', 'Punctuality']);
    expect(checkedMarks(renderer)).toHaveLength(1);
  });

  it('treats a non-data-url signature as unsigned', () => {
    const field = firstField([{ type: 'signature', key: 'sig', footer: 'Signed by' }]);

    const unsigned = render(<SchemaFieldControl field={field} value="not-an-image" />);
    expect(hostNodes(unsigned, 'Image')).toHaveLength(0);
    expect(texts(unsigned)).toEqual(['Signed by']);

    const signed = render(<SchemaFieldControl field={field} value="data:image/png;base64,AAA" />);
    expect(hostNodes(signed, 'Image')).toHaveLength(1);
  });

  it('selects the radio whose value matches the submission', () => {
    const field = firstField([
      {
        type: 'custom_radio',
        key: 'size',
        values: [
          { label: 'Small', value: 's' },
          { label: 'Large', value: 'l' },
        ],
      },
    ]);
    const renderer = render(<SchemaFieldControl field={field} value="l" />);

    expect(texts(renderer)).toEqual(['Small', 'Large']);
    expect(checkedMarks(renderer)).toHaveLength(1);
  });

  it('checks only the true entries of a selectboxes map', () => {
    const field = firstField([
      {
        type: 'selectboxes',
        key: 'flags',
        inline: true,
        values: [
          { label: 'Alpha', value: 'a' },
          { label: 'Beta', value: 'b' },
          { label: 'Charlie', value: 'c' },
        ],
      },
    ]);
    const renderer = render(
      <SchemaFieldControl field={field} value={{ a: true, b: false, c: true }} />
    );

    expect(checkedMarks(renderer)).toHaveLength(2);
  });
});

describe('theming', () => {
  const field = firstField([{ type: 'checkbox', key: 'agree', label: 'Agree' }]);

  it('merges a partial theme over the defaults', () => {
    const renderer = render(
      <FormioThemeProvider theme={{ colors: { brand: { primary: '#FF0000' } } }}>
        <SchemaFieldControl field={field} value />
      </FormioThemeProvider>
    );

    const mark = hostNodes(renderer, 'View').find(
      (node) => styleOf(node).backgroundColor === '#FF0000'
    );

    expect(mark).toBeDefined();
    // Untouched tokens keep their defaults.
    expect(styleOf(mark!).width).toBe(metrics.tick.size);
  });

  it('takes host icons through the theme', () => {
    function HostChevron({ size, color }: FormioIconProps) {
      return <>{`${size}:${color}`}</>;
    }
    const select = firstField([{ type: 'select', key: 's' }]);

    const renderer = render(
      <FormioThemeProvider theme={{ icons: { chevronDown: HostChevron } }}>
        <SchemaFieldControl field={select} value="" />
      </FormioThemeProvider>
    );

    expect(renderer.root.findAll((node) => node.type === HostChevron)).toHaveLength(1);
    expect(renderer.root.findAll((node) => node.type === ChevronDownIcon)).toHaveLength(0);
  });
});
