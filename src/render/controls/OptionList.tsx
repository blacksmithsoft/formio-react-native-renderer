// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { Text, View } from 'react-native';
import type { SchemaFieldOption } from '../../parse/types';
import { Mark } from './Mark';
import { useControlStyles } from './controlStyles';

/** The shared body of `radio` and `selectboxes`: one mark and label per option. */
export function OptionList({
  options,
  selected,
  inline,
  radio,
}: {
  options: SchemaFieldOption[];
  selected: Set<string>;
  inline: boolean;
  radio: boolean;
}) {
  const styles = useControlStyles();
  return (
    <View style={inline ? styles.optionsInline : undefined}>
      {options.map((option) => (
        <View key={option.value} style={styles.option}>
          <Mark checked={selected.has(option.value)} radio={radio} />
          <Text style={styles.optionLabel}>{option.label}</Text>
        </View>
      ))}
    </View>
  );
}
