// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { Pressable, Text, View } from 'react-native';
import { Mark } from '../../render/controls/Mark';
import type { FormioControlProps } from '../context';
import { useFormStyles } from '../formStyles';

/**
 * `survey` — a question × value matrix with a radio in each cell.
 *
 * The answer map is keyed by question value; a missing key means that row is unanswered. Each
 * cell is its own tap target at the full touch-target height, because on a phone the cells are
 * narrow and a mark-sized target is unusable with gloves on.
 */
export function SurveyControl({ component, value, onChange, onBlur, readOnly }: FormioControlProps) {
  const styles = useFormStyles();
  const { field } = component;
  const survey = field.survey;
  const disabled = readOnly || field.disabled;

  if (!survey || survey.questions.length === 0) return null;

  const answers =
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

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
            <Text style={styles.surveyQuestionText}>{question.label}</Text>
          </View>
          {survey.values.map((column) => {
            const checked = answers[question.value] === column.value;
            return (
              <Pressable
                key={column.value}
                style={styles.surveyValueCell}
                disabled={disabled}
                onPress={() => {
                  // Tapping the chosen answer again clears the row, which is the only way to
                  // un-answer one question of an optional survey.
                  const next = { ...answers };
                  if (checked) delete next[question.value];
                  else next[question.value] = column.value;
                  onChange(next);
                  onBlur();
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked, disabled }}
                accessibilityLabel={`${question.label}: ${column.label}`}
              >
                <Mark radio checked={checked} />
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
