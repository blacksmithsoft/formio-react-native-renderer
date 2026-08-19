// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { Text, View } from 'react-native';
import type { ComponentIssue } from '../engine/types';
import { useFormStyles } from './formStyles';

/**
 * The visible placeholder drawn for a component the renderer could not honour —
 * docs/FORMS.md §6.
 *
 * Never silent. A component that vanishes takes its question with it, and the person who finds
 * out is a worker in the field with no way to report what they did not see. A notice that names
 * the component and its key is something they can read down a phone line.
 *
 * The two severities look different on purpose: a warning means "this is degraded, carry on",
 * and a danger means "this form cannot be sent". Drawing them the same would teach people to
 * ignore both.
 */
export function Notice({ issue, componentKey }: { issue: ComponentIssue; componentKey?: string }) {
  const styles = useFormStyles();
  const danger = issue.severity === 'error';

  return (
    <View style={[styles.banner, danger ? styles.bannerDanger : styles.bannerWarning]}>
      <Text
        style={[styles.bannerTitle, danger ? styles.bannerDangerText : styles.bannerWarningText]}
      >
        {danger ? 'This form cannot be submitted' : 'Shown differently on mobile'}
      </Text>
      <Text style={[styles.bannerText, danger ? styles.bannerDangerText : styles.bannerWarningText]}>
        {issue.message}
      </Text>
      {!!componentKey && (
        <Text
          style={[styles.bannerText, danger ? styles.bannerDangerText : styles.bannerWarningText]}
        >
          {`Field: ${componentKey}`}
        </Text>
      )}
    </View>
  );
}

/** Every issue on one component, in order. */
export function Notices({ issues, componentKey }: { issues: ComponentIssue[]; componentKey: string }) {
  if (issues.length === 0) return null;
  return (
    <>
      {issues.map((issue, index) => (
        <Notice key={`${issue.code}-${index}`} issue={issue} componentKey={componentKey} />
      ))}
    </>
  );
}
