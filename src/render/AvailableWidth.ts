// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { createContext, useContext } from 'react';

/**
 * The width the renderer root measured for itself, shared with every nested columns row.
 *
 * `undefined` means "not measured yet". The host's own responsive hook cannot come along in a
 * package, and `Dimensions` reports the screen rather than the space the form actually has.
 */
export const AvailableWidthContext = createContext<number | undefined>(undefined);

export function useAvailableWidth(): number | undefined {
  return useContext(AvailableWidthContext);
}
