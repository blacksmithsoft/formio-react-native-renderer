// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * Schema builders for the engine tests.
 *
 * Tests read better when the schema fragment in front of you is only the part the case is about,
 * so these fill in the properties Form.io always writes and nobody ever reads.
 */

import { parseForm } from '../../src/engine/parseForm';
import type { FormDefinition } from '../../src/engine/types';

export type Component = Record<string, unknown>;

export function textfield(key: string, extra: Component = {}): Component {
  return { type: 'textfield', key, label: key, input: true, ...extra };
}

export function form(components: Component[], extra: Component = {}): FormDefinition {
  return parseForm({ title: 'Test', path: 'test', display: 'form', components, ...extra });
}

export function panel(key: string, components: Component[], extra: Component = {}): Component {
  return { type: 'panel', key, title: key, components, ...extra };
}

export function container(key: string, components: Component[]): Component {
  return { type: 'container', key, label: key, input: true, components };
}

export function datagrid(key: string, components: Component[], extra: Component = {}): Component {
  return { type: 'datagrid', key, label: key, input: true, components, ...extra };
}
