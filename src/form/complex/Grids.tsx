// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';
import { getAtPath, indexPath } from '../../engine/dataPaths';
import type { FormErrors } from '../../engine/formState';
import type { FormComponent } from '../../engine/types';
import { formatFieldValue } from '../../render/formatFieldValue';
import { ComponentRenderer, NodeList } from '../ComponentRenderer';
import { useFormioRender } from '../context';
import { GridTableCellContext } from '../FieldShell';
import { useFormStyles } from '../formStyles';
import { Notices } from '../Notice';
import { useFormioTheme } from '../../theme/FormioThemeProvider';

/**
 * `datagrid` and `editgrid` — docs/FORMS.md §7.
 *
 * The web draws both as tables. By default neither is here, for the reason in §8: a card per row
 * beats a squeezed table on a phone held outdoors in gloves. A data grid becomes a stack of
 * cards, one per row; an edit grid becomes a list of summaries you open one at a time, which is
 * what it already is conceptually and what suits a small screen best.
 *
 * A data grid the author marked `displayAsTable` is the exception, and it is honoured at every
 * width. Columns take an equal share of the space the grid actually has, down to a floor of
 * `tableMinColumnWidth`, and once they hit that floor the table scrolls sideways rather than
 * rearranging itself: a layout that silently becomes a different layout is one nobody can author
 * against, and the author asked for a table. The cost of the scroll is that a column can sit off
 * screen, so the table reveals its own errored column — see {@link firstErroredColumn}.
 *
 * Rows are addressed by index, and an index is only valid for the duration of one operation:
 * removing row 1 renumbers everything after it. Nothing in here holds an index across a change.
 */

function rowsOf(data: Record<string, unknown>, path: string): Record<string, unknown>[] {
  const value = getAtPath(data, path);
  if (!Array.isArray(value)) return [];
  return value.map((row) => (row !== null && typeof row === 'object' && !Array.isArray(row) ? (row as Record<string, unknown>) : {}));
}

function GridButton({
  label,
  onPress,
  secondary,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
}) {
  const styles = useFormStyles();
  return (
    <Pressable
      style={[styles.button, secondary && styles.buttonSecondary]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Text style={[styles.buttonLabel, secondary && styles.buttonLabelSecondary]}>{label}</Text>
    </Pressable>
  );
}

/** The label above every row. `Row 3 of 5` beats a bare number when a screen shows one at a time. */
function RowHeader({
  title,
  onRemove,
  removeLabel,
}: {
  title: string;
  onRemove?: () => void;
  removeLabel: string;
}) {
  const styles = useFormStyles();
  return (
    <View style={styles.rowHeader}>
      <Text style={styles.rowTitle}>{title}</Text>
      {onRemove && (
        <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={`${removeLabel} ${title}`}>
          <Text style={styles.chipRemove}>{removeLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

interface GridColumn {
  header: FormComponent;
  cell: FormComponent;
}

/**
 * The columns of a table-mode grid: one per child the schema did not hide.
 *
 * The cell copies carry no label, because the header already does and a control that draws its
 * own — a checkbox — would otherwise print it twice. Conditionally hidden children keep their
 * cell so the columns stay aligned from row to row; the cell simply draws nothing.
 */
function useColumns(children: FormComponent[]): GridColumn[] {
  return useMemo(
    () =>
      children
        .filter((child) => !child.hidden)
        .map((child) => ({
          header: child,
          cell: child.field.label ? { ...child, field: { ...child.field, label: '' } } : child,
        })),
    [children]
  );
}

/**
 * The leftmost column holding an error, in any row, or `-1`.
 *
 * Read back out of the error keys rather than tracked alongside them, because the keys are the
 * only thing that knows which row and field a failure belongs to: `lines[2].qty`. An error under
 * a column that contributes no key of its own — a layout component wrapping the real field — is
 * skipped rather than guessed at, which costs a scroll, not a correct answer.
 */
function firstErroredColumn(columns: GridColumn[], path: string, errors: FormErrors): number {
  let found = -1;
  for (const [key, messages] of Object.entries(errors)) {
    if (messages.length === 0 || !key.startsWith(`${path}[`)) continue;
    const segment = /^\[\d+\]\.([^.[]+)/.exec(key.slice(path.length))?.[1];
    if (segment === undefined) continue;
    const index = columns.findIndex((column) => column.header.key === segment);
    if (index >= 0 && (found < 0 || index < found)) found = index;
  }
  return found;
}

function GridTable({
  component,
  path,
  rows,
  columns,
  editable,
}: {
  component: FormComponent;
  path: string;
  rows: Record<string, unknown>[];
  columns: GridColumn[];
  editable: boolean;
}) {
  const styles = useFormStyles();
  const { form } = useFormioRender();
  const { metrics } = useFormioTheme();
  const scroller = useRef<ScrollView | null>(null);
  const [available, setAvailable] = useState<number | undefined>(undefined);

  const removeLabel = component.grid?.removeLabel ?? 'Remove';
  const actionWidth = editable ? metrics.form.touchTarget : 0;

  /*
   * The table measures itself rather than reading the form's container width. A grid nested in a
   * panel has the panel's padding less room than the form does, and sizing columns against the
   * outer number would overflow by exactly that padding on a layout that should have fit.
   */
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    setAvailable((current) =>
      current !== undefined && Math.abs(current - width) < 1 ? current : width
    );
  }, []);

  // An equal share of the space, but never below the floor. Above it the columns fill the width
  // and nothing scrolls; at it they overflow and the scroller takes over.
  const columnWidth = Math.max(
    metrics.form.tableMinColumnWidth,
    available === undefined ? 0 : (available - actionWidth) / columns.length
  );

  const erroredColumn = firstErroredColumn(columns, path, form.errors);
  const revealErrored = form.showAllErrors && erroredColumn >= 0;

  /*
   * `scrollToFirstError` only moves the page vertically, so a failed submit would otherwise
   * scroll to a row whose offending column is off the right edge and appear to have done nothing.
   * Re-running as the leftmost errored column changes walks the user through them in order.
   */
  useEffect(() => {
    if (!revealErrored) return;
    scroller.current?.scrollTo({ x: erroredColumn * columnWidth, animated: true });
  }, [revealErrored, erroredColumn, columnWidth]);

  const cellStyle = useMemo(
    () => [styles.gridTableCell, { width: columnWidth }],
    [styles.gridTableCell, columnWidth]
  );

  return (
    <ScrollView
      ref={scroller}
      horizontal
      onLayout={onLayout}
      style={[styles.gridTable, styles.controlSpacing]}
      contentContainerStyle={styles.gridTableContent}
      // The form itself is usually a vertical scroller. Android will not let this one take the
      // gesture unless it is told the nesting is deliberate.
      nestedScrollEnabled
      // Without it the first tap on a cell while the keyboard is up only dismisses the keyboard.
      keyboardShouldPersistTaps="handled"
    >
      {/* One child, not a stack of rows: a horizontal scroller sizes its content from its
          children, and several column-direction children leave the native side guessing. */}
      <View>
        <View style={[styles.gridTableRow, styles.gridTableHeaderRow]}>
          {columns.map(({ header }, index) => (
            <View key={`head-${header.key}-${index}`} style={cellStyle}>
              <Text style={styles.gridTableHeaderText}>
                {header.field.label}
                {header.field.required && <Text style={styles.requiredMark}> *</Text>}
              </Text>
            </View>
          ))}
          {editable && <View style={styles.gridTableActionCell} />}
        </View>

        <GridTableCellContext.Provider value>
          {rows.map((row, rowIndex) => (
            <View key={`${path}-${rowIndex}`} style={styles.gridTableRow}>
              {columns.map(({ cell }, index) => (
                <View key={`cell-${cell.key}-${index}`} style={cellStyle}>
                  <ComponentRenderer
                    component={cell}
                    parentPath={indexPath(path, rowIndex)}
                    row={row}
                  />
                </View>
              ))}
              {editable && (
                <View style={styles.gridTableActionCell}>
                  <Pressable
                    onPress={() => form.removeRow(path, rowIndex)}
                    accessibilityRole="button"
                    accessibilityLabel={`${removeLabel} ${rowIndex + 1}`}
                  >
                    {/* A word per row would cost a column's worth of width on a phone. */}
                    <Text style={styles.chipRemove}>✕</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))}
        </GridTableCellContext.Provider>
      </View>
    </ScrollView>
  );
}

export function DataGrid({ component, path }: { component: FormComponent; path: string }) {
  const styles = useFormStyles();
  const { form, readOnly } = useFormioRender();
  const rows = rowsOf(form.data, path);
  const editable = !readOnly && !form.readOnly && !component.field.disabled;
  const errors = form.errorsFor(path);
  const columns = useColumns(component.children);
  const asTable = component.grid?.displayAsTable === true && columns.length > 0;

  return (
    <View style={styles.field}>
      <Notices issues={component.issues} componentKey={component.key} />
      {!!component.field.label && (
        <Text style={styles.label}>
          {component.field.label}
          {component.field.required && <Text style={styles.requiredMark}> *</Text>}
        </Text>
      )}

      {rows.length > 0 &&
        (asTable ? (
          <GridTable
            component={component}
            path={path}
            rows={rows}
            columns={columns}
            editable={editable}
          />
        ) : (
          rows.map((row, index) => (
            <View key={`${path}-${index}`} style={[styles.row, styles.controlSpacing]}>
              <RowHeader
                title={`${index + 1} of ${rows.length}`}
                removeLabel={component.grid?.removeLabel ?? 'Remove'}
                onRemove={editable ? () => form.removeRow(path, index) : undefined}
              />
              <NodeList
                components={component.children}
                parentPath={indexPath(path, index)}
                row={row}
              />
            </View>
          ))
        ))}

      {rows.length === 0 && <Text style={[styles.hint, styles.controlSpacing]}>No entries yet.</Text>}

      {editable && (
        <View style={[styles.buttonRow, styles.controlSpacing]}>
          <GridButton
            label={component.grid?.addLabel ?? 'Add Another'}
            secondary
            onPress={() => form.addRow(path, component)}
          />
        </View>
      )}

      {!!component.field.description && (
        <Text style={styles.description}>{component.field.description}</Text>
      )}
      {errors.map((message) => (
        <Text key={message} style={styles.error}>
          {message}
        </Text>
      ))}
    </View>
  );
}

/**
 * `editgrid` — a list of collapsed summaries, one open at a time.
 *
 * The open row is tracked by index, and it is cleared whenever a row is removed, because after a
 * removal the index refers to a different row. Reopening is one tap; editing the wrong row
 * silently is not recoverable.
 */
export function EditGrid({ component, path }: { component: FormComponent; path: string }) {
  const styles = useFormStyles();
  const { form, readOnly } = useFormioRender();
  const [open, setOpen] = useState<number | null>(null);

  const rows = rowsOf(form.data, path);
  const editable = !readOnly && !form.readOnly && !component.field.disabled;
  const errors = form.errorsFor(path);

  return (
    <View style={styles.field}>
      <Notices issues={component.issues} componentKey={component.key} />
      {!!component.field.label && (
        <Text style={styles.label}>
          {component.field.label}
          {component.field.required && <Text style={styles.requiredMark}> *</Text>}
        </Text>
      )}

      {rows.map((row, index) => {
        const isOpen = open === index;
        const rowHasErrors = Object.keys(form.errors).some((key) =>
          key.startsWith(`${indexPath(path, index)}.`)
        );
        return (
          <View key={`${path}-${index}`} style={[styles.row, styles.controlSpacing]}>
            <Pressable
              style={styles.rowHeader}
              onPress={() => setOpen(isOpen ? null : index)}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
            >
              <Text style={styles.rowTitle}>{summarise(component, row) || `${index + 1}`}</Text>
              <View style={styles.buttonRow}>
                {form.showAllErrors && rowHasErrors && <View style={styles.tabErrorDot} />}
                <Text style={styles.chipRemove}>{isOpen ? 'Done' : 'Edit'}</Text>
              </View>
            </Pressable>

            {isOpen && (
              <View style={styles.controlSpacing}>
                <NodeList components={component.children} parentPath={indexPath(path, index)} row={row} />
                {editable && (
                  <View style={styles.buttonRow}>
                    <GridButton
                      label={component.grid?.removeLabel ?? 'Remove'}
                      secondary
                      onPress={() => {
                        setOpen(null);
                        form.removeRow(path, index);
                      }}
                    />
                  </View>
                )}
              </View>
            )}
          </View>
        );
      })}

      {rows.length === 0 && <Text style={[styles.hint, styles.controlSpacing]}>No entries yet.</Text>}

      {editable && (
        <View style={[styles.buttonRow, styles.controlSpacing]}>
          <GridButton
            label={component.grid?.addLabel ?? 'Add Another'}
            secondary
            onPress={() => {
              form.addRow(path, component);
              setOpen(rows.length);
            }}
          />
        </View>
      )}

      {!!component.field.description && (
        <Text style={styles.description}>{component.field.description}</Text>
      )}
      {errors.map((message) => (
        <Text key={message} style={styles.error}>
          {message}
        </Text>
      ))}
    </View>
  );
}

/**
 * A one-line summary of a collapsed row: the first two answered fields.
 *
 * Form.io lets an author write a template for this, but templates are JavaScript, so the first
 * answers are used instead. In practice the first column of an edit grid is what identifies the
 * row anyway — that is why authors put it first.
 */
function summarise(component: FormComponent, row: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const child of component.children) {
    if (parts.length >= 2) break;
    if (!child.input || !child.key) continue;
    const text = formatFieldValue(row[child.key], child.field);
    if (text) parts.push(text);
  }
  return parts.join(' · ');
}
