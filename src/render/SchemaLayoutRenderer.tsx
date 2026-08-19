// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useState } from 'react';
import {
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { SchemaField, SchemaLayoutNode } from '../parse/types';
import { createStyles } from '../theme/createStyles';
import { useFormioTheme } from '../theme/FormioThemeProvider';
import { AvailableWidthContext } from './AvailableWidth';
import { resolveColumnSpan } from './columnSpan';
import { isSelfLabelled, SchemaFieldControl } from './SchemaFieldControl';

/**
 * Draws a layout tree the way the Form.io web renderer draws it: panels, the 12-column grid,
 * label placement and the per-type controls, so a template edited in the builder looks the same
 * here. Read-only throughout.
 */

const useStyles = createStyles(({ colors, metrics }) => ({
  panel: {
    backgroundColor: colors.surface.card,
    borderRadius: metrics.panel.radius,
    padding: metrics.panel.padding,
    borderWidth: metrics.control.borderWidth,
    borderColor: colors.border.default,
    marginBottom: metrics.panel.gap,
  },
  panelTitle: {
    fontSize: metrics.panel.titleFontSize,
    fontWeight: metrics.panel.titleFontWeight,
    color: colors.text.primary,
    marginBottom: metrics.panel.titleGap,
  },
  columnsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // Cancels the per-column padding below, so the outermost columns stay flush with the
    // surrounding content. Load-bearing: without it the grid is inset by half a gutter.
    marginHorizontal: -metrics.grid.gutter / 2,
  },
  column: {
    paddingHorizontal: metrics.grid.gutter / 2,
  },
  field: {
    marginBottom: metrics.field.gap,
  },
  leftLabelRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: metrics.field.gap,
  },
  leftLabel: {
    minWidth: metrics.label.minWidth,
    marginEnd: metrics.label.gutter,
    // Nudge the label onto the first line of the control beside it.
    paddingTop: metrics.label.baselineOffset,
  },
  leftControl: {
    flex: 1,
  },
  label: {
    fontSize: metrics.label.fontSize,
    fontWeight: metrics.label.fontWeight,
    color: colors.text.secondary,
  },
  requiredMark: {
    color: colors.status.danger,
  },
  controlSpacing: {
    marginTop: metrics.label.gap,
  },
  description: {
    marginTop: metrics.description.gap,
    fontSize: metrics.description.fontSize,
    color: colors.text.tertiary,
  },
}));

type Values = Record<string, unknown>;

const NO_VALUES: Values = {};

function FieldLabel({ field }: { field: SchemaField }) {
  const styles = useStyles();
  return (
    <Text style={styles.label}>
      {field.label}
      {field.required && <Text style={styles.requiredMark}> *</Text>}
    </Text>
  );
}

function FieldNode({ field, values }: { field: SchemaField; values: Values }) {
  const styles = useStyles();
  const control = <SchemaFieldControl field={field} value={values[field.key]} />;
  const description = field.description ? (
    <Text style={styles.description}>{field.description}</Text>
  ) : null;

  // A checkbox draws its own label beside the box, exactly as the web renderer does.
  if (isSelfLabelled(field)) {
    return (
      <View style={styles.field}>
        {control}
        {description}
      </View>
    );
  }

  if (field.labelPosition === 'left') {
    return (
      <View style={styles.leftLabelRow}>
        <View
          style={[styles.leftLabel, field.labelWidth ? { flexBasis: `${field.labelWidth}%` } : null]}
        >
          <FieldLabel field={field} />
        </View>
        {/* The description belongs under the control, not under the label. */}
        <View style={styles.leftControl}>
          {control}
          {description}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.field}>
      <FieldLabel field={field} />
      <View style={styles.controlSpacing}>{control}</View>
      {description}
    </View>
  );
}

function ColumnsNode({
  node,
  values,
}: {
  node: Extract<SchemaLayoutNode, { kind: 'columns' }>;
  values: Values;
}) {
  const styles = useStyles();
  const { metrics } = useFormioTheme();

  return (
    <View style={styles.columnsRow}>
      {node.columns.map((column, columnIndex) => {
        const span = resolveColumnSpan(column.width, metrics.grid);
        return (
          <View
            key={`column-${node.key}-${columnIndex}`}
            style={[styles.column, { flexBasis: `${(span / metrics.grid.columns) * 100}%` }]}
          >
            <NodeList nodes={column.children} values={values} />
          </View>
        );
      })}
    </View>
  );
}

function NodeList({ nodes, values }: { nodes: SchemaLayoutNode[]; values: Values }) {
  const styles = useStyles();

  return (
    <>
      {nodes.map((node, index) => {
        switch (node.kind) {
          case 'panel':
            return (
              <View key={`panel-${node.key}-${index}`} style={styles.panel}>
                {!!node.title && <Text style={styles.panelTitle}>{node.title}</Text>}
                <NodeList nodes={node.children} values={values} />
              </View>
            );

          case 'columns':
            return <ColumnsNode key={`columns-${node.key}-${index}`} node={node} values={values} />;

          case 'field':
            return (
              <FieldNode
                key={`field-${node.field.key}-${index}`}
                field={node.field}
                values={values}
              />
            );

          // Data grids, uploads and buttons are retained in the tree so a host can detect them,
          // but they draw nothing here.
          case 'unsupported':
            return null;
        }
      })}
    </>
  );
}

export interface SchemaLayoutRendererProps {
  nodes: SchemaLayoutNode[];
  /** Form.io submission data, keyed by component key. */
  values?: Values;
  style?: StyleProp<ViewStyle>;
}

export function SchemaLayoutRenderer({ nodes, values, style }: SchemaLayoutRendererProps) {
  const [availableWidth, setAvailableWidth] = useState<number | undefined>(undefined);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    // Sub-pixel jitter on rotation would otherwise re-render the whole tree.
    setAvailableWidth((current) =>
      current !== undefined && Math.abs(current - width) < 1 ? current : width
    );
  }, []);

  return (
    <View style={style} onLayout={onLayout}>
      <AvailableWidthContext.Provider value={availableWidth}>
        <NodeList nodes={nodes} values={values ?? NO_VALUES} />
      </AvailableWidthContext.Provider>
    </View>
  );
}

export default SchemaLayoutRenderer;
