// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * Components that cannot be filled in without a live network.
 *
 * The renderer never fetches. A select whose options live on a URL, a resource picker, a
 * CAPTCHA or a Stripe field would otherwise draw an empty control and a warning. Those
 * components are hidden instead: any stored value is kept, and the worker is not asked to
 * answer a question they cannot answer offline.
 *
 * Pure. Imports nothing from React or React Native.
 */

import { baseFieldType } from '../parse/baseFieldType';

const NETWORK_WIDGETS = new Set([
  'datasource',
  'recaptcha',
  'captcha',
  'stripe',
  'resource',
]);

const REMOTE_SELECT = new Set(['url', 'resource', 'custom', 'indexeddb']);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function hasRemoteFetch(component: Record<string, unknown>): boolean {
  const fetch = isObject(component.fetch) ? component.fetch : undefined;
  if (fetch && fetch.enable === false) return false;
  const src = asString(fetch?.dataSrc) || asString(component.dataSrc);
  const url = asString(fetch?.url) || asString(isObject(component.data) ? component.data.url : '');
  return src === 'url' || src === 'resource' || /^https?:\/\//i.test(url);
}

/**
 * Whether this authored component needs the network to present a real control.
 *
 * A `select` with `data.values` already inlined is not remote, even if it used to be. A
 * `datatable` with no fetch URL is a local grid.
 */
export function requiresNetwork(component: Record<string, unknown>, optionsAvailable = false): boolean {
  const type = asString(component.type);
  const stripped = type.replace(/^custom_/, '');
  const base = baseFieldType(type);
  // Check the authored name and the `custom_` strip before aliases: `resource` aliases to
  // `textfield`, but it is still a live lookup.
  if (NETWORK_WIDGETS.has(type) || NETWORK_WIDGETS.has(stripped) || NETWORK_WIDGETS.has(base)) {
    return true;
  }

  // `datatable` aliases to `datagrid`; the raw type is what marks a live fetch.
  if ((type === 'datatable' || stripped === 'datatable') && hasRemoteFetch(component)) return true;

  const dataSrc = asString(component.dataSrc) || 'values';
  if ((base === 'select' || type === 'select') && REMOTE_SELECT.has(dataSrc) && !optionsAvailable) {
    return true;
  }

  return false;
}
