// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { createRef, type ReactElement } from 'react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ScrollView, View } from 'react-native';
import { FormioRenderer, type FormioRendererHandle } from '../../src/form/FormioRenderer';
import { FormioScreen } from '../../src/shells/FormioScreen';
import { FormioWizardScreen } from '../../src/shells/FormioWizardScreen';
import { splitWizardPages } from '../../src/shells/wizardPages';
import { parseForm } from '../../src/engine/parseForm';
import { hostNodes, render } from '../support/render';
import { mount } from './support';

/** Layer 3 — docs/FORMS.md §3. The shell owns everything the renderer refuses to. */

const textfield = (key: string, extra: Record<string, unknown> = {}) => ({
  type: 'textfield',
  key,
  label: key,
  input: true,
  ...extra,
});

const page = (key: string, title: string, components: unknown[]) => ({
  type: 'panel',
  key,
  title,
  components,
});

function shell(element: ReactElement) {
  const renderer = render(element);
  const pressables = () => hostNodes(renderer, 'Pressable');

  const texts = (): string[] =>
    hostNodes(renderer, 'Text').flatMap((node) => {
      const children = Array.isArray(node.props.children) ? node.props.children : [node.props.children];
      return children.filter((child: unknown): child is string => typeof child === 'string');
    });

  return {
    renderer,
    texts,
    inputs: () => hostNodes(renderer, 'TextInput'),
    press: (label: string) => {
      const target = pressables().find((node) =>
        node
          .findAll((child) => (child.type as unknown as string) === 'Text')
          .some((child) => JSON.stringify(child.props.children ?? '').includes(label))
      );
      if (!target) throw new Error(`no button labelled ${label}`);
      act(() => target.props.onPress());
    },
    type: (index: number, text: string) => {
      const input = hostNodes(renderer, 'TextInput')[index];
      if (!input) throw new Error(`no TextInput at index ${index}`);
      act(() => input.props.onChangeText(text));
      act(() => input.props.onBlur());
    },
  };
}

describe('the standalone screen', () => {
  const schema = { components: [textfield('name', { validate: { required: true } })] };

  it('owns the scroll container, keyboard avoidance and the submit bar', () => {
    const view = shell(<FormioScreen schema={schema} />);

    expect(hostNodes(view.renderer, 'ScrollView')).toHaveLength(1);
    expect(hostNodes(view.renderer, 'KeyboardAvoidingView')).toHaveLength(1);
    expect(view.texts()).toContain('Submit');
  });

  it('keeps the submit button out of the scroll view, where it cannot scroll away', () => {
    const view = shell(<FormioScreen schema={schema} />);
    const scroll = hostNodes(view.renderer, 'ScrollView')[0]!;

    const inside = scroll
      .findAll((node) => (node.type as unknown as string) === 'Text')
      .flatMap((node) => (Array.isArray(node.props.children) ? node.props.children : [node.props.children]))
      .filter((child: unknown): child is string => typeof child === 'string');
    expect(inside).not.toContain('Submit');
  });

  it('hands the submission to the host only once it is valid', () => {
    const onSubmit = vi.fn();
    const view = shell(<FormioScreen schema={schema} onSubmit={onSubmit} />);

    view.press('Submit');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(view.texts()).toContain('name is required');

    view.type(0, 'Ali');
    view.press('Submit');
    expect(onSubmit).toHaveBeenCalledWith({ data: { name: 'Ali' } });
  });

  it('reports every change, so a host can autosave', () => {
    const onChange = vi.fn();
    const view = shell(<FormioScreen schema={schema} onChange={onChange} />);

    view.type(0, 'Ali');
    expect(onChange).toHaveBeenCalledWith({ name: 'Ali' });
  });

  it('drops the submit bar when read-only', () => {
    const view = shell(<FormioScreen schema={schema} readOnly />);
    expect(view.texts()).not.toContain('Submit');
  });

  it('inserts the safe area component the host supplies', () => {
    const SafeArea = vi.fn(({ children }) => <View>{children}</View>);
    shell(<FormioScreen schema={schema} SafeArea={SafeArea} />);
    expect(SafeArea).toHaveBeenCalled();
  });

  it('renders a form even when the schema is nonsense', () => {
    expect(() => shell(<FormioScreen schema={null} />)).not.toThrow();
    expect(() => shell(<FormioScreen schema={{ components: 'no' }} />)).not.toThrow();
  });
});

describe('embedding in a parent that already scrolls', () => {
  it('adds no scroll container, keyboard avoidance or submit bar of its own', () => {
    const view = mount(
      { components: [textfield('name')] },
      {
        element: (ref) => (
          <ScrollView>
            <FormioRenderer ref={ref} schema={{ components: [textfield('name')] }} />
          </ScrollView>
        ),
      }
    );

    // Exactly the one the test itself supplied — nesting a second breaks gestures.
    expect(hostNodes(view.renderer, 'ScrollView')).toHaveLength(1);
    expect(hostNodes(view.renderer, 'KeyboardAvoidingView')).toHaveLength(0);
    expect(view.texts()).not.toContain('Submit');
  });

  it('scrolls the parent to an error the user would otherwise never see', () => {
    const scrollTo = vi.fn();
    const scrollRef = { current: { scrollTo } } as never;
    const ref = createRef<FormioRendererHandle>();

    render(
      <FormioRenderer
        ref={ref}
        scrollRef={scrollRef}
        schema={{ components: [textfield('name', { validate: { required: true } })] }}
      />
    );

    act(() => {
      ref.current?.validate();
    });
    act(() => {
      ref.current?.scrollToFirstError();
    });

    // Without this, a failed save on a long embedded form looks like a button that does nothing.
    expect(scrollTo).toHaveBeenCalled();
  });
});

describe('splitting a wizard into pages', () => {
  it('treats each top-level panel as a page', () => {
    const form = parseForm({
      display: 'wizard',
      components: [page('p1', 'Site', [textfield('a')]), page('p2', 'Hazards', [textfield('b')])],
    });

    expect(splitWizardPages(form).map((item) => item.title)).toEqual(['Site', 'Hazards']);
  });

  it('opens the first page with anything sitting above it', () => {
    const form = parseForm({
      display: 'wizard',
      components: [textfield('heading'), page('p1', 'Site', [textfield('a')])],
    });

    const pages = splitWizardPages(form);
    // Not a page of its own: that would be a screen holding one line of text and a Next button.
    expect(pages).toHaveLength(1);
    expect(pages[0]?.components.map((component) => component.key)).toEqual(['heading', 'a']);
  });

  it('keeps a component that follows a panel on the same page', () => {
    const form = parseForm({
      display: 'wizard',
      components: [page('p1', 'Site', [textfield('a')]), textfield('trailing')],
    });

    expect(splitWizardPages(form)[0]?.components.map((component) => component.key)).toEqual([
      'a',
      'trailing',
    ]);
  });

  it('gives a form with no panels a single page', () => {
    const form = parseForm({ components: [textfield('a'), textfield('b')] });
    const pages = splitWizardPages(form);

    expect(pages).toHaveLength(1);
    expect(pages[0]?.components).toHaveLength(2);
  });
});

describe('the wizard screen', () => {
  const schema = {
    display: 'wizard',
    components: [
      page('p1', 'Site', [textfield('site', { validate: { required: true } })]),
      page('p2', 'Hazards', [textfield('hazard')]),
    ],
  };

  it('shows one page at a time, with its position', () => {
    const view = shell(<FormioWizardScreen schema={schema} />);

    expect(view.inputs()).toHaveLength(1);
    expect(view.texts()).toContain('1 / 2');
    expect(view.texts()).toContain('Site');
  });

  it('refuses to advance past a page that is not filled in', () => {
    const view = shell(<FormioWizardScreen schema={schema} />);

    view.press('Next');
    expect(view.texts()).toContain('1 / 2');
    expect(view.texts()).toContain('site is required');
  });

  it('advances once the page is clean, and offers Submit on the last one', () => {
    const view = shell(<FormioWizardScreen schema={schema} />);

    view.type(0, 'North Yard');
    view.press('Next');

    expect(view.texts()).toContain('2 / 2');
    expect(view.texts()).toContain('Submit');
    expect(view.texts()).not.toContain('Next');
  });

  it('does not light up a page the user has not reached', () => {
    const view = shell(
      <FormioWizardScreen
        schema={{
          display: 'wizard',
          components: [
            page('p1', 'Site', [textfield('site')]),
            page('p2', 'Hazards', [textfield('hazard', { validate: { required: true } })]),
          ],
        }}
      />
    );

    view.press('Next');
    // Advancing validates the page being left, not the whole form.
    expect(view.texts()).toContain('2 / 2');
  });

  it('keeps answers from earlier pages instead of clearing them', () => {
    const onSubmit = vi.fn();
    const view = shell(<FormioWizardScreen schema={schema} onSubmit={onSubmit} />);

    view.type(0, 'North Yard');
    view.press('Next');
    view.type(0, 'scaffold');
    view.press('Submit');

    // Pages are rendered one at a time but the engine holds the whole submission; unmounting
    // them as separate forms would let clearOnHide strip everything off screen.
    expect(onSubmit).toHaveBeenCalledWith({ data: { site: 'North Yard', hazard: 'scaffold' } });
  });

  it('goes back without losing what was typed', () => {
    const view = shell(<FormioWizardScreen schema={schema} />);

    view.type(0, 'North Yard');
    view.press('Next');
    view.press('Back');

    expect(view.texts()).toContain('1 / 2');
    expect(view.inputs()[0]?.props.value).toBe('North Yard');
  });

  it('offers no Back button on the first page', () => {
    const view = shell(<FormioWizardScreen schema={schema} />);
    expect(view.texts()).not.toContain('Back');
  });
});
