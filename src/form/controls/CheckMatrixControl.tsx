// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { Pressable, Text, View } from 'react-native';
import { Mark } from '../../render/controls/Mark';
import type { FormioControlProps } from '../context';
import { useFormStyles } from '../formStyles';

/**
 * `checkmatrix` — Form.io's checkbox grid. Each cell is independent; the stored value is a
 * `boolean[][]` matching `numRows` × `numCols`, which is what the web example component writes.
 */

function readGrid(value: unknown, rows: number, cols: number): boolean[][] {
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => {
      const line = Array.isArray(value) ? value[row] : undefined;
      return Array.isArray(line) ? !!line[col] : false;
    })
  );
}

export function CheckMatrixControl({ component, value, onChange, onBlur, readOnly }: FormioControlProps) {
  const styles = useFormStyles();
  const config = component.checkMatrix ?? { rows: 3, cols: 3 };
  const disabled = readOnly || component.field.disabled;
  const grid = readGrid(value, config.rows, config.cols);
  const showColHeaders = (config.colLabels?.length ?? 0) > 0;
  const showRowLabels = (config.rowLabels?.length ?? 0) > 0;

  const toggle = (row: number, col: number) => {
    const next = grid.map((line, rowIndex) =>
      line.map((cell, colIndex) => (rowIndex === row && colIndex === col ? !cell : cell))
    );
    onChange(next.some((line) => line.some(Boolean)) ? next : []);
    onBlur();
  };

  return (
    <View style={styles.surveyTable}>
      {showColHeaders && (
        <View style={[styles.surveyRow, styles.surveyHeaderRow]}>
          {showRowLabels && <View style={styles.surveyQuestionCell} />}
          {Array.from({ length: config.cols }, (_, col) => (
            <View key={col} style={styles.surveyValueCell}>
              <Text style={styles.surveyHeaderText}>{config.colLabels?.[col] ?? String(col + 1)}</Text>
            </View>
          ))}
        </View>
      )}
      {Array.from({ length: config.rows }, (_, row) => (
        <View key={row} style={[styles.surveyRow, row === 0 && !showColHeaders ? { borderTopWidth: 0 } : null]}>
          {showRowLabels && (
            <View style={styles.surveyQuestionCell}>
              <Text style={styles.surveyQuestionText}>{config.rowLabels?.[row] ?? String(row + 1)}</Text>
            </View>
          )}
          {Array.from({ length: config.cols }, (_, col) => {
            const checked = grid[row]?.[col] === true;
            const rowLabel = config.rowLabels?.[row] ?? `Row ${row + 1}`;
            const colLabel = config.colLabels?.[col] ?? `column ${col + 1}`;
            return (
              <Pressable
                key={col}
                style={styles.surveyValueCell}
                disabled={disabled}
                onPress={() => toggle(row, col)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked, disabled }}
                accessibilityLabel={`${rowLabel}: ${colLabel}`}
              >
                <Mark checked={checked} />
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
