// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * Version gating — docs/FORMS.md §10.
 *
 * Force-update and Expo OTA already cover most version skew. What they do not cover is a form
 * that needs a capability the installed build does not have. Two things close that gap:
 *
 * - the backend stamps `minAppVersion` on the form, derived from the highest-versioned component
 *   it contains;
 * - the device checks it **before caching the form for offline use**, while it is still online
 *   and can be told to update.
 *
 * Discovering it in the field, with no signal, in front of a job that needs the form, is the
 * failure this file exists to prevent.
 *
 * Pure. Imports nothing from React or React Native.
 */

import { walkComponents } from '../engine/parseForm';
import { COMPONENT_REGISTRY, type HostCapability } from '../form/registry';
import type { FormDefinition } from '../engine/types';

/**
 * Compare two dotted version strings.
 *
 * Numeric segments compare numerically; a shorter version is padded with zeros, so `1.2` equals
 * `1.2.0`. A trailing pre-release suffix is ignored — `1.4.0-beta.2` compares as `1.4.0` — which
 * is the lenient reading, and being lenient here means a tester on a pre-release build is not
 * locked out of a form they are meant to be testing.
 */
export function compareVersions(a: string, b: string): number {
  const parts = (version: string): number[] =>
    version
      .split('-')[0]!
      .split('.')
      .map((segment) => {
        const value = Number.parseInt(segment, 10);
        return Number.isFinite(value) ? value : 0;
      });

  const left = parts(a);
  const right = parts(b);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return 0;
}

export function satisfiesMinVersion(appVersion: string, minVersion: string | undefined): boolean {
  if (!minVersion) return true;
  return compareVersions(appVersion, minVersion) >= 0;
}

/**
 * The host capabilities a form needs in order to be filled in completely.
 *
 * A form with a `signature` needs a signature pad; one with a `file` needs the picker. A host
 * that has not wired the adapter still renders the form — the control says so plainly — but this
 * is what lets it decide *before* handing the form to a worker whether that is acceptable.
 */
export function requiredCapabilities(form: FormDefinition): HostCapability[] {
  const found = new Set<HostCapability>();

  const scan = (components: FormDefinition['components']): void => {
    walkComponents(components, (component) => {
      const capability = COMPONENT_REGISTRY[component.base]?.capability;
      if (capability) found.add(capability);
      // `walkComponents` stops at a grid, because its children describe a row template that only
      // the engine can path. A camera inside a grid row is still a camera, so descend by hand.
      if (component.role === 'grid' || component.role === 'tree') scan(component.children);
      if (component.role === 'datamap' && component.dataMap) scan([component.dataMap.valueComponent]);
    });
  };

  scan(form.components);
  return [...found].sort();
}

export interface SchemaUsability {
  usable: boolean;
  /** Set when the installed app is older than the form's `minAppVersion`. */
  needsUpdate: boolean;
  /** Capabilities the form needs that the host did not declare. Degraded, not fatal. */
  missingCapabilities: HostCapability[];
}

/**
 * Whether a form should be cached for offline use on this build.
 *
 * `needsUpdate` is fatal and the form must not be cached: the user would be carrying a form they
 * cannot complete. Missing capabilities are not fatal — the affected control degrades visibly and
 * the rest of the form still works, which is better than refusing the whole thing.
 */
export function assessSchema(options: {
  appVersion: string;
  minAppVersion?: string;
  form?: FormDefinition;
  hostCapabilities?: HostCapability[];
}): SchemaUsability {
  const needsUpdate = !satisfiesMinVersion(options.appVersion, options.minAppVersion);
  const declared = new Set(options.hostCapabilities ?? []);
  const missingCapabilities = options.form
    ? requiredCapabilities(options.form).filter((capability) => !declared.has(capability))
    : [];

  return { usable: !needsUpdate, needsUpdate, missingCapabilities };
}
