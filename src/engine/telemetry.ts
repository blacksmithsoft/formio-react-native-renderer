// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * Telemetry — docs/FORMS.md §6.
 *
 * Unsupported components are the one class of defect that is invisible from the office: the
 * schema is fine, the app does not crash, and the only person who knows is a worker who shrugged
 * and carried on. So every one is reported, once per form open.
 *
 * The sink is injected rather than imported. A package cannot depend on a host's Sentry
 * configuration, and a package that logs to `console` in production is a package hosts learn to
 * silence. The default does nothing.
 */

import type { ComponentIssue } from './types';

export interface FormioTelemetryEvent {
  /** `form.path` when the schema carried one, else the empty string. */
  form: string;
  /** Absolute data path of the component that raised the issue. */
  path: string;
  type: string;
  issue: ComponentIssue;
}

export type FormioTelemetry = (event: FormioTelemetryEvent) => void;

export const noopTelemetry: FormioTelemetry = () => {};
