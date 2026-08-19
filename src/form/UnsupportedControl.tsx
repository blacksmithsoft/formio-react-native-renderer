// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { Text, View } from 'react-native';
import { formatFieldValue } from '../render/formatFieldValue';
import type { FormioControlProps } from './context';
import { useFormStyles } from './formStyles';

/**
 * The last resort — docs/FORMS.md §6.
 *
 * Reached only when a component could not be matched to a control *and* the parser could not
 * honestly infer one. It draws the component's name, its key and whatever value the submission
 * already holds, so that a person looking at the screen can say exactly what is missing.
 *
 * It deliberately takes no input. Inference exists for the cases where capturing a value as text
 * is safe; anything that reaches here has a shape a text box would corrupt, and the parser has
 * already marked the form non-submittable for it.
 */
export function UnsupportedControl({ component, value }: FormioControlProps) {
  const styles = useFormStyles();
  const shown = formatFieldValue(value, component.field);

  return (
    <View style={[styles.banner, styles.bannerDanger]}>
      <Text style={[styles.bannerTitle, styles.bannerDangerText]}>
        {component.field.label || component.key}
      </Text>
      <Text style={[styles.bannerText, styles.bannerDangerText]}>
        {`This app cannot show a "${component.type}" field. Update the app to fill it in.`}
      </Text>
      <Text style={[styles.bannerText, styles.bannerDangerText]}>{`Field: ${component.key}`}</Text>
      {!!shown && (
        <Text style={[styles.bannerText, styles.bannerDangerText]}>{`Saved value: ${shown}`}</Text>
      )}
    </View>
  );
}
