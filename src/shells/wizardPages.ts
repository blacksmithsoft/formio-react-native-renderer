// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * Splitting a wizard form into pages — docs/FORMS.md §8.
 *
 * Form.io expresses a wizard as a flat list of top-level panels, one per page. Anything that is
 * not a panel — a stray field, a piece of instructional content — belongs to the page it follows,
 * and anything before the first panel opens that first page. Builders routinely drop a heading
 * above the first panel; giving it a page of its own would produce a screen containing one line
 * of text and a Next button.
 *
 * A form with no panels at all is one page. That is what makes it safe to render any form
 * through the wizard shell, including a `display: "form"` schema whose author later switched it.
 *
 * Pure. Imports nothing from React or React Native.
 */

import type { FormComponent, FormDefinition } from '../engine/types';

export interface WizardPage {
  key: string;
  title: string;
  components: FormComponent[];
}

export function splitWizardPages(form: FormDefinition): WizardPage[] {
  const pages: WizardPage[] = [];
  let leading: FormComponent[] = [];

  for (const component of form.components) {
    const isPanel = component.role === 'layout' && component.layout === 'panel';

    if (isPanel) {
      pages.push({
        key: component.key || `page${pages.length + 1}`,
        title: component.field.label || component.key,
        // The panel's own card chrome is dropped: a page that is one card inside one screen is
        // a border around the whole view and reads as a mistake.
        components: [...leading, ...component.children],
      });
      leading = [];
      continue;
    }

    if (pages.length === 0) {
      leading.push(component);
      continue;
    }

    // A component after a panel joins that panel's page rather than starting a new one.
    pages[pages.length - 1]?.components.push(component);
  }

  // No panels at all: one page holding the whole form. This is what makes it safe to send any
  // schema through the wizard shell.
  if (pages.length === 0) return [{ key: 'page1', title: form.title, components: form.components }];

  return pages;
}
