// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * The public API — docs/ARCHITECTURE.md#public-api.
 *
 * Everything else in `src/` is internal and may change in a patch release. Deep imports are not
 * supported.
 *
 * The surface is grouped the way the package is layered, and the grouping is the documentation:
 * the engine has no UI, the renderer owns no scroll container, and the shells own everything the
 * renderer refuses to. A host that only displays a stored submission needs the read-only parser
 * and nothing below it.
 */

/* ── Read-only display ─────────────────────────────────────────────────────────────────────── */

export { parseSchemaNodes } from './parse/parseSchemaNodes';
export { parseSchemaTabLayout } from './parse/parseSchemaTabLayout';
export { baseFieldType } from './parse/baseFieldType';
export { formatFieldValue } from './render/formatFieldValue';

export { SchemaLayoutRenderer } from './render/SchemaLayoutRenderer';
export { SchemaFieldControl } from './render/SchemaFieldControl';

/* ── Layer 1: the headless engine ──────────────────────────────────────────────────────────── */

export { useFormioForm } from './engine/useFormioForm';
export { parseForm, parseFormComponents, walkComponents, walkGridRow } from './engine/parseForm';
export { isEmptyValue, validateComponent } from './engine/validation';
export {
  applyCalculations,
  applyClearOnHide,
  applyDefaults,
  collectErrors,
  emptyRow,
  initialValueFor,
  pathsIn,
  reconcile,
  toSubmission,
  validateForm,
} from './engine/formState';
export { evaluateConditional, isConditionallyVisible } from './engine/conditionals';
export { apply as applyJsonLogic } from './engine/jsonLogic';
export { getAtPath, setAtPath, unsetAtPath, joinPath, indexPath, parsePath } from './engine/dataPaths';
export { noopTelemetry } from './engine/telemetry';

/* ── Layer 2: the renderer ─────────────────────────────────────────────────────────────────── */

export { FormioRenderer, SubmitBar } from './form/FormioRenderer';
export { COMPONENT_REGISTRY, describeCoverage, lookupControl } from './form/registry';
export { FormioRenderProvider, useFormioRender } from './form/context';
export { TextControl } from './form/controls/TextControl';

/* ── Layer 3: the shells ───────────────────────────────────────────────────────────────────── */

export { FormioScreen } from './shells/FormioScreen';
export { FormioWizardScreen } from './shells/FormioWizardScreen';
export { splitWizardPages } from './shells/wizardPages';

/* ── Offline and sync ──────────────────────────────────────────────────────────────────────── */

export { cacheSchema, hashSchema, loadCachedForm } from './sync/schemaCache';
export {
  backoffMs,
  enqueueSubmission,
  listRejections,
  MAX_ATTEMPTS,
  resubmit,
  runOutbox,
  syncSubmission,
} from './sync/outbox';
export { collectPendingBinaries, isReadyToPost, uploadBinaries } from './sync/binaryUpload';
export { assessSchema, compareVersions, requiredCapabilities, satisfiesMinVersion } from './sync/version';

/* ── Schema compatibility (runs server-side, before a schema reaches a device) ─────────────── */

export { transformSchema, TRANSFORM_VERSION } from './compat/transformSchema';

/* ── Theming ───────────────────────────────────────────────────────────────────────────────── */

export { FormioThemeProvider } from './theme/FormioThemeProvider';
export { defaultFormioTheme } from './theme/defaultTheme';

/* ── Types ─────────────────────────────────────────────────────────────────────────────────── */

export type {
  SchemaLayoutNode,
  SchemaColumn,
  SchemaField,
  SchemaFieldOption,
  SchemaDayConfig,
  SchemaSurveyConfig,
  SchemaLabelPosition,
} from './parse/types';

export type {
  ComponentIssue,
  ComponentRole,
  ConditionalRule,
  FileConfig,
  FormComponent,
  FormDefinition,
  GridConfig,
  LayoutKind,
  SelectConfig,
  ValidationRules,
} from './engine/types';
export type {
  HtmlAlign,
  HtmlAlignItems,
  HtmlBlock,
  HtmlBoxStyle,
  HtmlEdgeColors,
  HtmlEdges,
  HtmlFieldType,
  HtmlJustify,
  HtmlSpan,
  HtmlTextStyle,
} from './engine/htmlBlocks';
export type { CalculatedRule } from './engine/calculateValue';

export type { FormioFormInstance, UseFormioFormOptions } from './engine/useFormioForm';
export type { FormErrors, SubmissionData, ValidationResult } from './engine/formState';
export type { FormioTelemetry, FormioTelemetryEvent } from './engine/telemetry';
export type { ConditionalScope } from './engine/conditionals';

export type { FormioRendererProps, FormioRendererHandle } from './form/FormioRenderer';
export type {
  CapturedFile,
  ComponentOverrides,
  FormioAdapters,
  FormioControl,
  FormioControlProps,
  FormioFileValue,
  FormioRenderContextValue,
  FormScrollable,
  FormScrollMetrics,
  FormScrollWindow,
  FieldRegistration,
} from './form/context';
export type { ComponentEntry, HostCapability } from './form/registry';

export type { FormioScreenProps } from './shells/FormioScreen';
export type { FormioWizardScreenProps } from './shells/FormioWizardScreen';
export type { WizardPage } from './shells/wizardPages';

export type {
  BinaryUploader,
  CachedSchema,
  Clock,
  OutboxEntry,
  OutboxStatus,
  OutboxStore,
  PostResult,
  SchemaCacheStore,
  SubmissionPoster,
  SubmissionRejection,
} from './sync/types';
export type { CacheOutcome, CacheSchemaOptions } from './sync/schemaCache';
export type { SyncDeps } from './sync/outbox';
export type { PendingBinary, UploadBinariesOptions } from './sync/binaryUpload';
export type { SchemaUsability } from './sync/version';

export type {
  SelectOption,
  TransformChange,
  TransformOptions,
  TransformResult,
} from './compat/transformSchema';

export type { SchemaLayoutRendererProps } from './render/SchemaLayoutRenderer';
export type { SchemaFieldControlProps } from './render/SchemaFieldControl';
export type { FormioThemeProviderProps } from './theme/FormioThemeProvider';
export type {
  FormioTheme,
  PartialFormioTheme,
  FormioColors,
  FormioMetrics,
  FormioIcon,
  FormioIconProps,
  FormioIcons,
} from './theme/FormioTheme';
