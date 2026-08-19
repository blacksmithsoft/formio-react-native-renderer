# @formio-native/react-native

The React Native implementation of the [Form.io Native Renderer](../README.md).

**Status:** implemented, unpublished. Milestones [M1](../ROADMAP.md#m1--react-native-package), [M3, M4, M5](../ROADMAP.md).

> This README covers React Native specifics only. Behaviour is specified once, for both platforms, in [`docs/`](../docs). If you are looking for *what* the renderer does, start with [`docs/SPEC.md`](../docs/SPEC.md) for read-only display and [`docs/FORMS.md`](../docs/FORMS.md) for editable forms.

---

## Install

The package is private and not on npm. Host apps consume it from disk:

```bash
npm install file:../formIO-renderer/RN
```

Peer dependencies: `react`, `react-native`. Nothing else. Works in bare React Native and in Expo.

The published entry point is **TypeScript source** (`src/index.ts`, via `main`, `types`,
`react-native` and `exports`), so there is no build step to keep in sync while the package lives
next to its only consumer. Metro compiles it like any other module. Two consequences worth
knowing:

- JSX is authored for the **automatic runtime**, which is what `babel-preset-expo` and the
  React Native default preset use. A host pinned to the classic runtime would need to transpile
  the package itself.
- `npm install file:` links the directory, so Metro needs symlink resolution — on by default in
  the Metro shipped with Expo SDK 53 and later.

## Use

**Displaying a stored submission**

```tsx
import { parseSchemaTabLayout, SchemaLayoutRenderer } from '@formio-native/react-native';

const nodes = parseSchemaTabLayout(templateVersion.data, 'basic');

<SchemaLayoutRenderer nodes={nodes} values={submission.data} />;
```

**Filling one in**

```tsx
import { FormioScreen } from '@formio-native/react-native';

<FormioScreen schema={templateVersion.data} initialData={submission.data} onSubmit={queue} />;
```

**Embedded, where the parent already owns the scroll view and the save button**

```tsx
const form = useFormioForm(schema, submission.data);
const formRef = useRef<FormioRendererHandle>(null);

<ScrollView ref={scrollRef}>
  <RecordHeader />
  <FormioRenderer form={form} ref={formRef} scrollRef={scrollRef} />
</ScrollView>;

// in the parent's save handler
const submission = formRef.current?.submit();
if (!submission) formRef.current?.scrollToFirstError();
```

Full wiring, theming and host-override examples are in [`docs/INTEGRATION.md`](../docs/INTEGRATION.md).

## Structure

```
RN/
├── src/
│   ├── parse/
│   │   ├── parseSchemaNodes.ts       rules 1–7 of the parsing table
│   │   ├── parseSchemaTabLayout.ts   root resolution + tab lookup
│   │   ├── toField.ts                field mapping
│   │   ├── baseFieldType.ts          custom_ prefix stripping
│   │   ├── json.ts                   narrowing helpers for untrusted JSON
│   │   └── types.ts                  SchemaLayoutNode, SchemaField, …
│   ├── render/
│   │   ├── SchemaLayoutRenderer.tsx  panels, grid, label placement
│   │   ├── SchemaFieldControl.tsx    the per-type switch
│   │   ├── controls/                 one file per non-default control
│   │   ├── columnSpan.ts             the responsive rule, as a pure function
│   │   ├── AvailableWidth.ts         measured container width, by context
│   │   └── formatFieldValue.ts       value → display text
│   ├── engine/                       layer 1 — no UI, no react-native import
│   │   ├── dataPaths.ts              get/set over `lines[2].qty`, immutably
│   │   ├── jsonLogic.ts              a JSON Logic interpreter, so no eval
│   │   ├── parseForm.ts              schema → the editable model. Never throws
│   │   ├── conditionals.ts           simple + JSON Logic visibility
│   │   ├── validation.ts             the declarative rule set
│   │   ├── formState.ts              defaults, calculations, clearOnHide
│   │   ├── useFormioForm.ts          the hook the renderer consumes
│   │   └── telemetry.ts              where unknown components get reported
│   ├── form/                         layer 2 — the editable renderer
│   │   ├── FormioRenderer.tsx        the root, and the imperative handle
│   │   ├── ComponentRenderer.tsx     registry lookup, layout, fallback
│   │   ├── registry.ts               types → controls, tagged OTA-safe
│   │   ├── context.tsx               width, overrides, adapters, field registry
│   │   ├── FieldShell.tsx            label, description, errors, measurement
│   │   ├── controls/                 one file per input family
│   │   ├── complex/                  data grid and edit grid
│   │   └── columnLayout.ts           Bootstrap collapse, as a pure function
│   ├── shells/                       layer 3 — scroll, safe area, submit bar
│   ├── sync/                         schema cache, outbox, two-phase binaries
│   ├── compat/                       the schema transform — runs server-side
│   ├── theme/
│   │   ├── FormioTheme.ts            token types
│   │   ├── defaultTheme.ts           the defaults from THEMING.md
│   │   ├── FormioThemeProvider.tsx   context + partial merge
│   │   ├── mergeTheme.ts             partial over defaults
│   │   ├── createStyles.ts           themed stylesheets, cached per theme
│   │   └── icons.tsx                 the four slots, primitive defaults
│   └── index.ts                      the public API, and nothing more
└── test/
    ├── conformance.test.ts           runs ../fixtures
    ├── constraints.test.ts           the rules from FORMS.md §2 that fail quietly
    ├── parse.test.ts                 parser rules the fixtures do not pin down
    ├── render.test.tsx               drawing and layout
    ├── theme.test.ts                 token contract and merge
    ├── engine/                       layer 1, tested as data
    ├── form/                         layer 2, through a test renderer
    ├── sync/                         the outbox rules, against in-memory ports
    ├── compat/                       the schema transform
    ├── mocks/                        react-native as inspectable host nodes
    └── support/                      fixture IO, tree diffing, test renderer
```

`src/index.ts` exports exactly the surface listed in [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md#public-api). Anything else is internal and may change in a patch release. Deep imports are not supported.

## Platform notes

Where the spec's language-neutral wording lands in React Native.

| Spec concept | React Native |
| --- | --- |
| Bordered box | `View` with `borderWidth`, `borderRadius`, `backgroundColor` |
| A row of parts | `View` with `flexDirection: 'row'`, `alignItems: 'center'`, `gap` |
| 12-grid column | `flexBasis: '<span/12 * 100>%'` on a `flexWrap: 'wrap'` row |
| Grid gutter | `paddingHorizontal: 6` per column, `marginHorizontal: -6` on the row |
| Left label width | `flexBasis: '<labelWidth>%'` with `minWidth: 100` |
| Available width | `onLayout` on the renderer root, **not** `Dimensions.get('window')` |
| Signature image | `<Image source={{ uri: dataUrl }} resizeMode="contain" />` |
| Disabled control | A style variant. Never `pointerEvents`; the renderer is read-only throughout |

Two of these are easy to get wrong:

**Measure the container, not the window.** `Dimensions` reports the screen, so a form inside a tablet sidebar would keep its wide layout in a narrow space. Use `onLayout` and pass the width down. See [`docs/SPEC.md`](../docs/SPEC.md#8-responsive-behaviour).

**The negative row margin is load-bearing.** Each column carries 6dp of horizontal padding, which would otherwise inset the outermost columns relative to the surrounding content. The −6dp row margin cancels exactly that.

## Extraction work

This package starts as a copy of the renderer inside the Vise Mobile app, but it cannot ship as a copy. Three host dependencies had to be inverted, and they are the substance of [M1](../ROADMAP.md#m1--react-native-package). All three are done:

| Host dependency | Became |
| --- | --- |
| `import { colors } from '../../constants/colors'` | `FormioTheme`, defaults per [`THEMING.md`](../docs/THEMING.md) |
| `@expo/vector-icons` | Four injectable icon slots with primitive-drawn defaults |
| `useResponsive()` | `onLayout` measurement inside the renderer |

None is difficult; all three are mandatory. A package that reaches into its host's colour module is a folder someone copied, not a library.

The acceptance test is that Vise Mobile, after migrating, shows **no visual diff**. See [`docs/INTEGRATION.md`](../docs/INTEGRATION.md#migrating-vise-mobile). Two behavioural differences from the host copy are deliberate, both closing defects listed in [`docs/SPEC.md`](../docs/SPEC.md#9-known-gaps):

- **Gap 1.** `select` options are read from `data.values` on the **base** type, so a `custom_select` resolves its option labels instead of showing the raw stored value.
- **Gap 2.** The non-field set is matched on the base type, so `custom_file` and `custom_editgrid` are skipped like their stock counterparts rather than rendering as text fields. The explicit `custom_datagrid` entry is gone, since it is now redundant.

Both are visible only on branded components that are currently mis-rendered, so neither should move a pixel of the Vise Basic tab.

## Development

```bash
npm install
npm test            # every suite, including ../fixtures
npm run typecheck
```

The conformance suite reads from the repository-root `fixtures/` directory, outside this package. It is shared with Flutter and is not published to npm — see [`docs/CONFORMANCE.md`](../docs/CONFORMANCE.md).

Tests run in Node under Vitest, with `react-native` aliased to a small mock that renders host nodes a test renderer can inspect. The real `react-native` is still what the sources are typechecked against; the mock only stands in at runtime, which keeps the suite fast and off a device. Golden images are not generated yet — see [`docs/CONFORMANCE.md`](../docs/CONFORMANCE.md#golden-images).

### Conventions

- TypeScript strict. No `any`; use `unknown` and narrow. The parser's entire input is untyped JSON, so narrowing is the job, not an inconvenience.
- No literal colours or dimensions in `render/` or `form/`. Everything comes from the theme.
- `parse/`, `engine/`, `sync/` and `compat/` import nothing from `react` or `react-native`. That is what keeps them testable as pure data and usable from a background sync task. Enforced by `test/constraints.test.ts`.
- No `eval`, no `new Function`, no `Dimensions.get`. Also enforced there — each fails quietly rather than loudly, which is exactly why they need a test rather than a review.
- Comment intent and constraints, not mechanics.

## Publishing

Nothing is set up: the package is `private`, has no build step, and is consumed from disk. When it does ship it goes out from `RN/` only, at the same version as the Flutter package, from the same changelog. The release procedure — including why one platform never ships alone — is in [`docs/PARITY.md`](../docs/PARITY.md#releasing).
