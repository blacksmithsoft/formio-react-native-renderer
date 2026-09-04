// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { evaluateConditional } from '../engine/conditionals';
import { walkComponents } from '../engine/parseForm';
import { joinPath } from '../engine/dataPaths';
import type { FormComponent } from '../engine/types';
import { formatFieldValue } from '../render/formatFieldValue';
import { useFormioTheme } from '../theme/FormioThemeProvider';
import { resolveFormColumnSpan } from './columnLayout';
import { useFormioRender } from './context';
import { EditGrid, DataGrid } from './complex/Grids';
import { DataMap, Tree } from './complex/Nested';
import { FieldShell } from './FieldShell';
import { useFormStyles } from './formStyles';
import { HtmlBlocks } from './HtmlContent';
import { Notices } from './Notice';
import { lookupControl } from './registry';

/**
 * Registry lookup, conditional evaluation and layout dispatch — Layer 2's centre.
 *
 * Every component in the tree passes through here exactly once, which is what makes the two
 * guarantees in §6 enforceable in one place: nothing is ever skipped silently, and nothing an
 * unrecognised schema can contain reaches a control that was not written for it.
 */

export interface NodeProps {
  component: FormComponent;
  /** Path of the enclosing data scope: `''` at the root, `lines[2]` inside a grid row. */
  parentPath: string;
  /** The enclosing grid row, so a conditional inside a grid reads its own row first. */
  row?: Record<string, unknown>;
}

export function NodeList({
  components,
  parentPath,
  row,
}: {
  components: FormComponent[];
  parentPath: string;
  row?: Record<string, unknown>;
}) {
  return (
    <>
      {components.map((component, index) => (
        <ComponentRenderer
          key={`${component.type}-${component.key}-${index}`}
          component={component}
          parentPath={parentPath}
          row={row}
        />
      ))}
    </>
  );
}

export function ComponentRenderer({ component, parentPath, row }: NodeProps) {
  const { form, readOnly, overrides } = useFormioRender();

  // Evaluated here rather than read from `form.visibleComponents`, because the renderer needs
  // the row-scoped answer for the specific row it is drawing, and the same pure function
  // produces both.
  const scope = row ? { root: form.data, row } : { root: form.data };
  if (!evaluateConditional(component.conditional, scope)) return null;

  // A schema-hidden component keeps its value and its default; it simply is not drawn.
  if (component.hidden) return null;

  const path = component.input ? joinPath(parentPath, component.key) : parentPath;

  switch (component.role) {
    case 'layout':
      return <LayoutNode component={component} path={path} row={row} />;
    case 'container':
      return <ContainerNode component={component} path={path} row={row} />;
    case 'grid': {
      // Grids skip the input registry, so host overrides have to be applied here. Key still
      // beats type so one table can be swapped without forking every datagrid.
      const GridOverride =
        overrides.byKey?.[component.key] ??
        overrides.byType?.[component.type] ??
        overrides.byType?.[component.base];
      if (GridOverride) {
        const errors = form.errorsFor(path);
        return (
          <>
            <Notices issues={component.issues} componentKey={component.key} />
            <FieldShell component={component} path={path} errors={errors}>
              <GridOverride
                component={component}
                path={path}
                value={form.getValue(path)}
                onChange={(value) => form.setValue(path, value)}
                onBlur={() => form.touch(path)}
                errors={errors}
                readOnly={readOnly || form.readOnly}
              />
            </FieldShell>
          </>
        );
      }
      return component.base === 'editgrid' ? (
        <EditGrid component={component} path={path} />
      ) : (
        <DataGrid component={component} path={path} />
      );
    }
    case 'datamap':
    case 'tree': {
      const NestedOverride =
        overrides.byKey?.[component.key] ??
        overrides.byType?.[component.type] ??
        overrides.byType?.[component.base];
      if (NestedOverride) {
        const errors = form.errorsFor(path);
        return (
          <>
            <Notices issues={component.issues} componentKey={component.key} />
            <FieldShell component={component} path={path} errors={errors}>
              <NestedOverride
                component={component}
                path={path}
                value={form.getValue(path)}
                onChange={(value) => form.setValue(path, value)}
                onBlur={() => form.touch(path)}
                errors={errors}
                readOnly={readOnly || form.readOnly}
              />
            </FieldShell>
          </>
        );
      }
      return component.role === 'tree' ? (
        <Tree component={component} path={path} />
      ) : (
        <DataMap component={component} path={path} />
      );
    }
    case 'display':
      return <DisplayNode component={component} />;
    case 'input':
      return <InputNode component={component} path={path} />;
  }
}

/** A value-carrying component: its notices, then its control, inside the shared field frame. */
function InputNode({ component, path }: { component: FormComponent; path: string }) {
  const { form, readOnly, overrides } = useFormioRender();
  const Control = lookupControl(component, overrides);
  const errors = form.errorsFor(path);

  return (
    <>
      <Notices issues={component.issues} componentKey={component.key} />
      <FieldShell component={component} path={path} errors={errors}>
        <Control
          component={component}
          path={path}
          value={form.getValue(path)}
          onChange={(value) => form.setValue(path, value)}
          onBlur={() => form.touch(path)}
          errors={errors}
          readOnly={readOnly || form.readOnly}
        />
      </FieldShell>
    </>
  );
}

/** `container` — an object scope with no chrome of its own. */
function ContainerNode({ component, path, row }: { component: FormComponent; path: string; row?: Record<string, unknown> }) {
  return (
    <View>
      <Notices issues={component.issues} componentKey={component.key} />
      <NodeList components={component.children} parentPath={path} row={row} />
    </View>
  );
}

function LayoutNode({ component, path, row }: { component: FormComponent; path: string; row?: Record<string, unknown> }) {
  switch (component.layout) {
    case 'columns':
      return <ColumnsNode component={component} path={path} row={row} />;
    case 'tabs':
      return <TabsNode component={component} path={path} row={row} />;
    case 'table':
      return <TableNode component={component} path={path} row={row} />;
    case 'panel':
      return <PanelNode component={component} path={path} row={row} />;
    default:
      return <NodeList components={component.children} parentPath={path} row={row} />;
  }
}

/**
 * `panel`, `fieldset` and `well` — a titled card.
 *
 * `collapsible` is honoured here where the read-only renderer ignores it, because a form is much
 * longer than a summary and collapsing a completed section is how a phone stays navigable.
 */
function PanelNode({ component, path, row }: { component: FormComponent; path: string; row?: Record<string, unknown> }) {
  const styles = useFormStyles();
  const { colors, metrics, icons } = useFormioTheme();
  const [collapsed, setCollapsed] = useState(component.collapsed);
  const Chevron = icons.chevronDown;

  const title = component.field.label;
  const header = component.collapsible ? (
    <Pressable
      style={styles.panelHeader}
      onPress={() => setCollapsed((current) => !current)}
      accessibilityRole="button"
      accessibilityState={{ expanded: !collapsed }}
    >
      <Text style={styles.panelTitle}>{title}</Text>
      <Chevron size={metrics.control.iconSize} color={colors.text.tertiary} />
    </Pressable>
  ) : (
    !!title && (
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>{title}</Text>
      </View>
    )
  );

  return (
    <View style={styles.panel}>
      {header}
      {!collapsed && (
        <View style={header ? styles.panelBody : undefined}>
          <Notices issues={component.issues} componentKey={component.key} />
          <NodeList components={component.children} parentPath={path} row={row} />
        </View>
      )}
    </View>
  );
}

/** `columns` — a wrapping 12-unit row that keeps the authored widths at any width. */
function ColumnsNode({ component, path, row }: { component: FormComponent; path: string; row?: Record<string, unknown> }) {
  const styles = useFormStyles();
  const { metrics } = useFormioTheme();

  return (
    <View style={styles.columnsRow}>
      {(component.columns ?? []).map((column, index) => {
        const span = resolveFormColumnSpan(column.width, metrics.grid.columns);
        return (
          <View
            key={`${component.key}-column-${index}`}
            style={[styles.column, { flexBasis: `${(span / metrics.grid.columns) * 100}%` }]}
          >
            <NodeList components={column.children} parentPath={path} row={row} />
          </View>
        );
      })}
    </View>
  );
}

/**
 * `tabs` — a scrollable strip with the selected tab's contents below.
 *
 * The per-tab error dot is not decoration. A validation failure inside a tab the user is not
 * looking at is otherwise completely invisible, and the form appears to reject itself for no
 * reason.
 */
function TabsNode({ component, path, row }: { component: FormComponent; path: string; row?: Record<string, unknown> }) {
  const styles = useFormStyles();
  const { form } = useFormioRender();
  const [selected, setSelected] = useState(0);
  const tabs = component.tabs ?? [];
  if (tabs.length === 0) return null;

  const active = tabs[Math.min(selected, tabs.length - 1)];

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
        {tabs.map((tab, index) => {
          const isSelected = tab === active;
          const hasErrors = form.showAllErrors && tabHasErrors(tab.children, path, form.errors);
          return (
            <Pressable
              key={tab.key || `tab-${index}`}
              style={[styles.tab, isSelected && styles.tabSelected]}
              onPress={() => setSelected(index)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={[styles.tabLabel, isSelected && styles.tabLabelSelected]}>{tab.label}</Text>
              {hasErrors && <View style={styles.tabErrorDot} />}
            </Pressable>
          );
        })}
      </ScrollView>
      {active && <NodeList components={active.children} parentPath={path} row={row} />}
    </View>
  );
}

function tabHasErrors(
  components: FormComponent[],
  parentPath: string,
  errors: Record<string, string[]>
): boolean {
  for (const component of components) {
    const path = component.input ? joinPath(parentPath, component.key) : parentPath;
    if (component.input && path) {
      // A grid's rows live under `path[n]`, so a prefix test catches errors inside them too.
      if (errors[path]?.length) return true;
      if (Object.keys(errors).some((key) => key.startsWith(`${path}[`) || key.startsWith(`${path}.`))) {
        return true;
      }
    }
    if (tabHasErrors(component.children, path, errors)) return true;
    for (const column of component.columns ?? []) {
      if (tabHasErrors(column.children, path, errors)) return true;
    }
    for (const tab of component.tabs ?? []) {
      if (tabHasErrors(tab.children, path, errors)) return true;
    }
    for (const tableRow of component.tableRows ?? []) {
      for (const cell of tableRow) {
        if (tabHasErrors(cell.children, path, errors)) return true;
      }
    }
  }
  return false;
}

/**
 * `table` — **not drawn as a table** — docs/FORMS.md §8.
 *
 * Each row becomes a stacked card. Horizontal scrolling on a phone, in a field environment, with
 * gloves on, is unusable, and a table narrow enough to fit is a table nobody can read.
 */
function TableNode({ component, path, row }: { component: FormComponent; path: string; row?: Record<string, unknown> }) {
  const styles = useFormStyles();
  const rows = component.tableRows ?? [];

  return (
    <View>
      {rows.map((cells, rowIndex) => (
        <View key={`${component.key}-row-${rowIndex}`} style={styles.row}>
          {cells.map((cell, cellIndex) => (
            <NodeList
              key={`cell-${cellIndex}`}
              components={cell.children}
              parentPath={path}
              row={row}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * `content`, `htmlelement` and `button`.
 *
 * Instructional copy is drawn as one wrapped string — see `htmlToText` — because a paragraph
 * reads better that way than as a stack of lines. Markup that carries layout the string would
 * lose goes to `HtmlBlocks` instead, which is what keeps a letterhead, a bordered checklist and
 * an HTML signature grid looking like themselves offline and without a WebView. Buttons are not
 * drawn: submission is the shell's job, and a schema button that appeared to submit but did not
 * would be worse than no button at all.
 */
function DisplayNode({ component }: { component: FormComponent }) {
  const styles = useFormStyles();
  const blocks = component.htmlBlocks;
  return (
    <>
      <Notices issues={component.issues} componentKey={component.key} />
      {component.base === 'reviewpage' ? (
        <ReviewPage component={component} />
      ) : blocks && blocks.length > 0 ? (
        <View style={styles.htmlBlock}>
          <HtmlBlocks blocks={blocks} />
        </View>
      ) : (
        !!component.html && <Text style={styles.contentText}>{component.html}</Text>
      )}
    </>
  );
}

/**
 * `reviewpage` — a read-only summary of named fields.
 *
 * The web widget is a full review step. On a phone the useful part is the answers, so this
 * lists each authored key with its current value. Missing keys are shown blank rather than
 * dropped, so the worker can see what the page is supposed to cover.
 */
function ReviewPage({ component }: { component: FormComponent }) {
  const styles = useFormStyles();
  const { form } = useFormioRender();
  const byKey = new Map<string, FormComponent>();
  walkComponents(form.form.components, (entry) => {
    if (entry.key) byKey.set(entry.key, entry);
  });

  const title = component.field.label;
  return (
    <View style={styles.field}>
      {!!title && <Text style={styles.label}>{title}</Text>}
      <View style={title ? styles.controlSpacing : undefined}>
        {(component.reviewFields ?? []).map((key) => {
          const target = byKey.get(key);
          const label = target?.field.label || key;
          const shown = target ? formatFieldValue(form.getValue(key), target.field) : formatFieldValue(form.getValue(key), {
            ...component.field,
            key,
            label: key,
          });
          return (
            <View key={key} style={styles.reviewRow}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.reviewValue}>{shown || '—'}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

