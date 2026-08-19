// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { View } from 'react-native';
import { useFormioTheme } from '../../theme/FormioThemeProvider';
import { useControlStyles } from './controlStyles';

/** A checkbox box or a radio circle. Checked draws the brand fill with a glyph or a dot. */
export function Mark({ checked, radio }: { checked: boolean; radio?: boolean }) {
  const styles = useControlStyles();
  const { colors, metrics, icons } = useFormioTheme();
  const Check = icons.check;

  return (
    <View style={[styles.tick, radio && styles.tickRadio, checked && styles.tickChecked]}>
      {checked &&
        (radio ? (
          <View style={styles.radioDot} />
        ) : (
          <Check size={metrics.tick.glyphSize} color={colors.text.inverse} />
        ))}
    </View>
  );
}
