// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { Image, Text, View } from 'react-native';
import type { SchemaField } from '../../parse/types';
import { useControlStyles } from './controlStyles';

/**
 * The signature pad and its caption.
 *
 * A value that is not a data URL is treated as unsigned rather than handed to the image loader.
 * The clear button is an editing affordance and is not drawn: a button that does nothing when
 * tapped is worse than no button.
 */
export function SignatureControl({ field, value }: { field: SchemaField; value: unknown }) {
  const styles = useControlStyles();
  const uri = typeof value === 'string' && value.startsWith('data:image') ? value : '';

  return (
    <View>
      <View style={styles.signaturePad}>
        {!!uri && <Image source={{ uri }} style={styles.signatureImage} resizeMode="contain" />}
      </View>
      <Text style={styles.signatureCaption}>{field.footer || 'Sign above'}</Text>
    </View>
  );
}
