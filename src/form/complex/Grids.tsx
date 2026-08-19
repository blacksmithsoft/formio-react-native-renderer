// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { getAtPath, indexPath } from '../../engine/dataPaths';
import type { FormComponent } from '../../engine/types';
import { formatFieldValue } from '../../render/formatFieldValue';
import { NodeList } from '../ComponentRenderer';
import { useFormioRender } from '../context';
import { useFormStyles } from '../formStyles';
import { Notices } from '../Notice';

/**
 * `datagrid` and `editgrid` — docs/FORMS.md §7.
 *
 * The web draws both as tables. Neither is drawn as a table here, for the reason in §8: a
 * horizontally scrolling table on a phone, outdoors, with gloves, is unusable. A data grid
 * becomes a stack of cards, one per row; an edit grid becomes a list of summaries you open one
 * at a time, which is what it already is conceptually and what suits a small screen best.
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

export function DataGrid({ component, path }: { component: FormComponent; path: string }) {
  const styles = useFormStyles();
  const { form, readOnly } = useFormioRender();
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

      {rows.map((row, index) => (
        <View key={`${path}-${index}`} style={[styles.row, styles.controlSpacing]}>
          <RowHeader
            title={`${index + 1} of ${rows.length}`}
            removeLabel={component.grid?.removeLabel ?? 'Remove'}
            onRemove={editable ? () => form.removeRow(path, index) : undefined}
          />
          <NodeList components={component.children} parentPath={indexPath(path, index)} row={row} />
        </View>
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
