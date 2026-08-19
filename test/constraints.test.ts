// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';

const manifest = packageJson as {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

/**
 * The constraints from docs/FORMS.md §2 that are cheap to break and expensive to retrofit.
 *
 * Every one of these has already been argued and decided; what makes them worth a test is that
 * each fails *quietly*. A `Dimensions.get('window')` call looks right on a full-screen form and is
 * wrong in a modal. An `eval` works in Node and throws only on a device. A DOM package added as a
 * transitive convenience bloats a bundle nobody reweighs. None of them fail in review.
 */

const SRC = join(__dirname, '..', 'src');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

const files = sourceFiles(SRC).map((path) => ({
  path: relative(SRC, path).replace(/\\/g, '/'),
  text: readFileSync(path, 'utf8'),
}));

/** Strip comments, so a rule can be *discussed* in prose without tripping its own test. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('no runtime code generation', () => {
  it('never calls eval or constructs a Function', () => {
    const offenders = files.filter(({ text }) => /\beval\s*\(|new\s+Function\s*\(/.test(code(text)));
    // Hermes disables both. A schema carrying custom JavaScript is unsupported by design (§6),
    // and the compatibility transform strips it before the schema ever reaches a device (§7).
    expect(offenders.map((file) => file.path)).toEqual([]);
  });
});

describe('layout is measured, not assumed', () => {
  it('never reads the window size', () => {
    const offenders = files.filter(({ text }) => /Dimensions\s*\.\s*get/.test(code(text)));
    // A form can sit in a modal, a padded card, a tablet split view or a half-width panel. The
    // window width is wrong in all four; `onLayout` on the container is right in all four.
    expect(offenders.map((file) => file.path)).toEqual([]);
  });

  it('resolves column widths from the measured container', () => {
    const columnLayout = files.find((file) => file.path === 'form/columnLayout.ts');
    expect(columnLayout?.text).toMatch(/containerWidth/);
  });
});

describe('no DOM renderer in the bundle', () => {
  const banned = ['@formio/js', 'formiojs', '@formio/react', 'react-dom'];

  it('declares none of them as a dependency', () => {
    const declared = Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies });
    expect(declared.filter((name) => banned.includes(name))).toEqual([]);
  });

  it('imports none of them', () => {
    const offenders = files.filter(({ text }) =>
      banned.some((name) => code(text).includes(`'${name}'`) || code(text).includes(`"${name}"`))
    );
    expect(offenders.map((file) => file.path)).toEqual([]);
  });

  it('ships no third-party runtime dependencies at all', () => {
    // Including `json-logic-js`: the interpreter in `engine/jsonLogic.ts` is a few hundred lines
    // and removes a dependency whose Hermes behaviour we would otherwise have to keep verifying.
    expect(manifest.dependencies ?? {}).toEqual({});
  });
});

describe('the layers stay separate', () => {
  const engine = files.filter((file) => file.path.startsWith('engine/'));

  it('keeps the headless engine free of React Native', () => {
    // Layer 1 must be unit-testable with no renderer and reusable by the sync layer, which runs
    // in a background task where there is no view tree at all.
    const offenders = engine.filter(({ text }) => /from '(react-native|\.\.\/(form|shells|render))/.test(text));
    expect(offenders.map((file) => file.path)).toEqual([]);
  });

  it('keeps the compatibility transform runnable outside an app', () => {
    // It runs on a server, before a schema reaches a device (§7).
    const compat = files.filter((file) => file.path.startsWith('compat/'));
    const offenders = compat.filter(({ text }) => /from 'react(-native)?'/.test(text));
    expect(offenders.map((file) => file.path)).toEqual([]);
  });

  it('keeps the sync layer free of the view tree', () => {
    const sync = files.filter((file) => file.path.startsWith('sync/'));
    const offenders = sync.filter(({ text }) => /from 'react(-native)?'/.test(text));
    expect(offenders.map((file) => file.path)).toEqual([]);
  });
});

describe('the renderer owns no chrome', () => {
  const renderer = files.find((file) => file.path === 'form/FormioRenderer.tsx');

  it('leaves safe area, keyboard avoidance and virtualization to the shell', () => {
    // Two KeyboardAvoidingViews fight each other, and virtualization is a shell decision: a
    // standalone 120-field form may use a FlatList, the same form embedded in a parent
    // ScrollView cannot.
    for (const owned of ['KeyboardAvoidingView', 'SafeAreaView', 'FlatList']) {
      expect(code(renderer?.text ?? ''), owned).not.toMatch(new RegExp(`\\b${owned}\\b`));
    }
  });

  it('scrolls and shows a submit button only when asked', () => {
    // Both default to `false`. Nested vertical scrollers break gestures, so a renderer that
    // scrolls by default is a renderer that breaks the moment somebody embeds it.
    expect(code(renderer?.text ?? '')).toMatch(/scrollable\s*=\s*false/);
    expect(code(renderer?.text ?? '')).toMatch(/showSubmit\s*=\s*false/);
  });
});
