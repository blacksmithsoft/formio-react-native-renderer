// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { Text, View } from 'react-native';
import type { SchemaField } from '../../parse/types';
import { Mark } from './Mark';
import { useControlStyles } from './controlStyles';

/**
 * A question × value matrix with a radio in each cell.
 *
 * The answer map is keyed by question value; a missing key leaves every radio in that row empty.
 */
export function SurveyControl({ field, value }: { field: SchemaField; value: unknown }) {
  const styles = useControlStyles();
  const survey = field.survey;
  if (!survey || survey.questions.length === 0) return null;
  const answers = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;

  return (
    <View style={styles.surveyTable}>
      <View style={[styles.surveyRow, styles.surveyHeaderRow]}>
        <View style={styles.surveyQuestionCell} />
        {survey.values.map((column) => (
          <View key={column.value} style={styles.surveyValueCell}>
            <Text style={styles.surveyHeaderText}>{column.label}</Text>
          </View>
        ))}
      </View>
      {survey.questions.map((question) => (
        <View key={question.value} style={styles.surveyRow}>
          <View style={styles.surveyQuestionCell}>
            <Text style={styles.controlText}>{question.label}</Text>
          </View>
          {survey.values.map((column) => (
            <View key={column.value} style={styles.surveyValueCell}>
              <Mark radio checked={answers[question.value] === column.value} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
