// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { FormComponent } from '../engine/types';
import { useFormioTheme } from '../theme/FormioThemeProvider';
import { ComponentRenderer } from './ComponentRenderer';
import { useFormioRender } from './context';
import { useFormStyles } from './formStyles';
import { PhoneDepthProvider, usePhoneDepth } from './layoutMode';
import { Notices } from './Notice';
import {
  flattenPhoneFlow,
  flattenPhoneRow,
  groupPhoneBlocks,
  pairPhoneItems,
  subtreeOwnsPath,
  type PhoneItem,
  type PhoneLine,
  type PhonePlanOptions,
  type PhoneScope,
} from './phoneLayout';
import { resolveOverride } from './registry';

/**
 * The phone layout, drawn — docs/FORMS.md §8.
 *
 * `phoneLayout.ts` decides what goes where; this file draws the cards it goes into. Every leaf
 * still passes through `ComponentRenderer`, so a field on a phone is the same field, with the
 * same control, validation and host overrides, that a tablet draws — only its place on the page
 * is different.
 */

interface PhoneNodeProps {
  component: FormComponent;
  /** The data scope of the component's children: layout never re-scopes, so also its own. */
  path: string;
  row?: Record<string, unknown>;
  rowIndex?: number;
}

/** What the planner needs to know about the form around it. */
function usePhonePlanOptions(): PhonePlanOptions {
  const { form, overrides } = useFormioRender();
  const { data } = form;
  return useMemo(
    () => ({
      data,
      isHostDrawn: (component) =>
        !!(overrides.byKey?.[component.key] ?? overrides.resolve?.(component)),
      hasOverride: (component) => !!resolveOverride(component, overrides),
    }),
    [data, overrides]
  );
}

function PhoneItemView({ item }: { item: PhoneItem }) {
  if (item.kind === 'notices') {
    return <Notices issues={item.component.issues} componentKey={item.component.key} />;
  }
  return (
    <ComponentRenderer
      component={item.component}
      parentPath={item.scope.parentPath}
      row={item.scope.row}
      rowIndex={item.scope.rowIndex}
    />
  );
}

/** The rows of a card: one field, or two side by side. */
function PhoneLines({ lines }: { lines: PhoneLine[] }) {
  const styles = useFormStyles();
  return (
    <>
      {lines.map((line) =>
        line.kind === 'single' ? (
          <PhoneItemView key={line.item.id} item={line.item} />
        ) : (
          <View key={line.left.id} style={styles.phonePair}>
            <View style={styles.phonePairCell}>
              <PhoneItemView item={line.left} />
            </View>
            <View style={styles.phonePairCell}>
              <PhoneItemView item={line.right} />
            </View>
          </View>
        )
      )}
    </>
  );
}

/** A card's contents, one level deeper than the card itself. */
function PhoneCardBody({ depth, items, notices }: { depth: number; items: PhoneItem[]; notices?: FormComponent }) {
  const styles = useFormStyles();
  return (
    <PhoneDepthProvider value={depth + 1}>
      <View style={styles.phoneCardBody}>
        {notices && <Notices issues={notices.issues} componentKey={notices.key} />}
        <PhoneLines lines={pairPhoneItems(items)} />
      </View>
    </PhoneDepthProvider>
  );
}

/**
 * A component list in the phone layout. What `NodeList` becomes below the breakpoint.
 *
 * At the top level the flow is split into cards. Inside a card it is already where it belongs
 * and only needs laying out in rows.
 */
export function PhoneFlow({
  components,
  parentPath,
  row,
  rowIndex,
}: {
  components: FormComponent[];
  parentPath: string;
  row?: Record<string, unknown>;
  rowIndex?: number;
}) {
  const styles = useFormStyles();
  const options = usePhonePlanOptions();
  const depth = usePhoneDepth();
  const items = flattenPhoneFlow(components, { parentPath, row, rowIndex }, options);

  if (depth > 0) return <PhoneLines lines={pairPhoneItems(items)} />;

  return (
    <>
      {groupPhoneBlocks(items).map((block) =>
        block.kind === 'standalone' ? (
          <PhoneItemView key={block.item.id} item={block.item} />
        ) : (
          <View key={block.id} style={styles.panel}>
            <PhoneDepthProvider value={1}>
              <View style={styles.phoneCardBody}>
                <PhoneLines lines={block.lines} />
              </View>
            </PhoneDepthProvider>
          </View>
        )
      )}
    </>
  );
}

/**
 * `panel`, `fieldset` and `well` on a phone — an expansion tile.
 *
 * A titled panel is a card whose header opens and closes it, and it **starts closed**: a phone
 * form is a list of section names first and a wall of fields only where the user asked for one.
 * The schema's `collapsible` flag is not consulted — that describes a browser, where leaving
 * every section open costs nothing. An untitled panel has nothing to tap, so it is always open.
 *
 * A closed card mounts none of its fields. That is what keeps a long form quick to open, and it
 * is why the card registers itself: a failed submit has to be able to open the card holding the
 * first error, or the user is told the form is invalid by a screen showing nothing wrong.
 */
export function PhonePanel({ component, path, row, rowIndex }: PhoneNodeProps) {
  const styles = useFormStyles();
  const { colors, metrics, icons } = useFormioTheme();
  const { form, registerSection, pendingReveal } = useFormioRender();
  const options = usePhonePlanOptions();
  const depth = usePhoneDepth();
  const title = component.field.label.trim();
  const nested = depth > 0;

  const owns = useCallback(
    (target: string) => subtreeOwnsPath(component.children, path, [target]),
    [component, path]
  );

  const [collapsed, setCollapsed] = useState(() => {
    if (!title) return false;
    // Mounted by a card that was just opened to reveal an error further in: open as well.
    const pending = pendingReveal?.current;
    return !(pending && owns(pending));
  });

  useEffect(() => {
    if (!title || !registerSection) return undefined;
    return registerSection({ owns, open: () => setCollapsed(false) });
  }, [title, owns, registerSection]);

  // Planned only while open: a closed card has no rows to lay out.
  const scope: PhoneScope = { parentPath: path, row, rowIndex };
  const items = collapsed ? [] : flattenPhoneFlow(component.children, scope, options);

  if (!title) {
    if (items.length === 0 && component.issues.length === 0) return null;
    if (nested) {
      // Inside a card an untitled panel has no chrome left to draw; its fields join the flow.
      return (
        <>
          <Notices issues={component.issues} componentKey={component.key} />
          <PhoneLines lines={pairPhoneItems(items)} />
        </>
      );
    }
    return (
      <View style={styles.panel}>
        <PhoneCardBody depth={depth} items={items} notices={component} />
      </View>
    );
  }

  const errorKeys = form.showAllErrors
    ? Object.keys(form.errors).filter((key) => (form.errors[key]?.length ?? 0) > 0)
    : [];
  const hasErrors = collapsed && subtreeOwnsPath(component.children, path, errorKeys);
  const Chevron = icons.chevronDown;

  return (
    <View style={nested ? [styles.phoneSubCard, styles.phoneBlockGap] : styles.panel}>
      <Pressable
        style={styles.panelHeader}
        onPress={() => setCollapsed((current) => !current)}
        // The header is a single line of text; the padding around it is part of the target.
        hitSlop={nested ? metrics.form.rowPadding : metrics.panel.padding}
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
      >
        <Text style={nested ? styles.phoneSubCardTitle : styles.panelTitle}>{title}</Text>
        {/* A closed card hides its errors with its fields; without the dot they are invisible. */}
        {hasErrors && <View style={styles.tabErrorDot} />}
        <View style={collapsed ? undefined : styles.phoneChevronOpen}>
          <Chevron size={metrics.phone.cardIconSize} color={colors.text.secondary} />
        </View>
      </Pressable>
      {!collapsed && (
        <View style={nested ? styles.phoneSubCardBody : styles.panelBody}>
          <PhoneCardBody depth={depth} items={items} notices={component} />
        </View>
      )}
    </View>
  );
}

/**
 * `table` with several rows on a phone — one sub-card per row.
 *
 * A table row is a record: an employee, a line item. Stacking every cell of every row in one
 * column loses where one record ends and the next begins, so each row keeps a card of its own
 * and its cells pair up inside it. A one-row table never reaches here; the planner hoists its
 * cells straight into the surrounding card.
 */
export function PhoneTable({ component, path, row, rowIndex }: PhoneNodeProps) {
  const styles = useFormStyles();
  const options = usePhonePlanOptions();
  const depth = usePhoneDepth();
  const scope: PhoneScope = { parentPath: path, row, rowIndex };

  const cards = (component.tableRows ?? [])
    .map((cells, index) => ({
      id: `${component.key}-row-${index}`,
      items: flattenPhoneRow(
        cells.map((cell) => cell.children),
        scope,
        options,
        `${component.key}-row-${index}`
      ),
    }))
    .filter((card) => card.items.length > 0);

  return (
    <>
      <Notices issues={component.issues} componentKey={component.key} />
      {cards.length > 0 && (
        <View style={styles.phoneStack}>
          {cards.map((card) => (
            <View key={card.id} style={styles.phoneSubCard}>
              <PhoneCardBody depth={depth} items={card.items} />
            </View>
          ))}
        </View>
      )}
    </>
  );
}
