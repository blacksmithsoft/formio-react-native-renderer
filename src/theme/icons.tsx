// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { View } from 'react-native';
import type { FormioIconProps, FormioIcons } from './FormioTheme';

/**
 * Default icons, drawn with layout primitives so a consumer with no icon library still gets a
 * usable form. A host that already has an icon set should pass its own through the theme.
 *
 * Dimensions here are fractions of the caller's `size`, which is itself a theme token — this is
 * the one place a shape is described in code rather than in tokens.
 */

/** Line thickness that stays visible at 12dp and does not go blobby at 32dp. */
function stroke(size: number): number {
  return Math.max(1, Math.round(size / 8));
}

export function CheckIcon({ size, color }: FormioIconProps) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: size * 0.4,
          height: size * 0.72,
          marginTop: -size * 0.12,
          borderRightWidth: stroke(size),
          borderBottomWidth: stroke(size),
          borderColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}

export function ChevronDownIcon({ size, color }: FormioIconProps) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: size * 0.5,
          height: size * 0.5,
          marginTop: -size * 0.12,
          borderRightWidth: stroke(size),
          borderBottomWidth: stroke(size),
          borderColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}

export function CalendarIcon({ size, color }: FormioIconProps) {
  const line = stroke(size);
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: size * 0.14,
          bottom: 0,
          borderWidth: line,
          borderColor: color,
          borderRadius: size * 0.14,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: size * 0.36,
          height: line,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: size * 0.24,
          top: 0,
          width: line,
          height: size * 0.2,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: size * 0.24,
          top: 0,
          width: line,
          height: size * 0.2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

export function ClockIcon({ size, color }: FormioIconProps) {
  const line = stroke(size);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderWidth: line,
        borderColor: color,
        borderRadius: size / 2,
      }}
    >
      {/* Hour hand up, minute hand right, meeting at the centre. */}
      <View
        style={{
          position: 'absolute',
          left: size / 2 - line,
          top: size * 0.22,
          width: line,
          height: size * 0.26,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: size / 2 - line,
          top: size * 0.46,
          width: size * 0.22,
          height: line,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

export const defaultFormioIcons: FormioIcons = {
  check: CheckIcon,
  chevronDown: ChevronDownIcon,
  calendar: CalendarIcon,
  clock: ClockIcon,
};
