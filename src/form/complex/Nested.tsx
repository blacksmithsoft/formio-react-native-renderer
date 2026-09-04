// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { useState, type ReactNode } from 'react';
import { Text, TextInput, View } from 'react-native';
import { emptyTreeNode, initialValueFor } from '../../engine/formState';
import { indexPath, joinPath } from '../../engine/dataPaths';
import {
  asRecord,
  asTreeNode,
  renameMapKey,
  uniqueMapKey,
} from '../../engine/nestedData';
import type { FormComponent } from '../../engine/types';
import { ComponentRenderer, NodeList } from '../ComponentRenderer';
import { useFormioRender } from '../context';
import { useFormStyles } from '../formStyles';
import { Notices } from '../Notice';
import { GridButton } from './Grids';

/**
 * `datamap` and `tree` — the two Form.io types whose value is a nested object, not a primitive
 * and not a row array.
 *
 * A datamap is a growing dictionary: the user names each key and fills the authored value
 * component. The submission is `{ extraMeta: { siteCode: "NY-1" } }`, never an array of
 * `{ key, value }` rows — that would be a different shape the server has never seen.
 *
 * A tree is one `{ data, children }` node, recursively. Node fields live under `data`; adding a
 * child appends to `children`. That is the Form.io tree document, written back unchanged.
 */

function FieldChrome({
  component,
  path,
  children,
}: {
  component: FormComponent;
  path: string;
  children: ReactNode;
}) {
  const styles = useFormStyles();
  const { form } = useFormioRender();
  const errors = form.errorsFor(path);

  return (
    <View style={styles.field}>
      <Notices issues={component.issues} componentKey={component.key} />
      {!!component.field.label && (
        <Text style={styles.label}>
          {component.field.label}
          {component.field.required && <Text style={styles.requiredMark}> *</Text>}
        </Text>
      )}
      {children}
      {!!component.field.description && (
        <Text style={styles.description}>{component.field.description}</Text>
      )}
      {errors.map((message) => (
        <Text key={message} style={styles.error}>
          {message}
        </Text>
      ))}
    </View>
  );
}

export function DataMap({ component, path }: { component: FormComponent; path: string }) {
  const styles = useFormStyles();
  const { form, readOnly } = useFormioRender();
  const config = component.dataMap;
  const map = asRecord(form.getValue(path));
  const entries = Object.keys(map);
  const editable = !readOnly && !form.readOnly && !component.field.disabled;
  const allowAdd = editable && config?.allowAdd !== false;
  const allowRemove = editable && config?.allowRemove !== false;
  const valueComponent = config?.valueComponent;

  const addEntry = (): void => {
    const key = uniqueMapKey(map);
    const initial = valueComponent ? initialValueFor({ ...valueComponent, key }) : '';
    form.setValue(path, { ...map, [key]: initial === undefined ? '' : initial });
  };

  const removeEntry = (key: string): void => {
    const next = { ...map };
    delete next[key];
    form.setValue(path, next);
  };

  const rename = (from: string, to: string): void => {
    const next = renameMapKey(map, from, to);
    if (next !== map) form.setValue(path, next);
  };

  return (
    <FieldChrome component={component} path={path}>
      {entries.length === 0 && <Text style={[styles.hint, styles.controlSpacing]}>No entries yet.</Text>}
      {entries.map((key) => (
        <View key={key} style={[styles.row, styles.controlSpacing, styles.mapEntry]}>
          <MapKeyField
            label={config?.keyLabel ?? 'Key'}
            name={key}
            readOnly={!editable}
            onRename={(next) => rename(key, next)}
          />
          {valueComponent && (
            <ComponentRenderer
              component={{
                ...valueComponent,
                key,
                field: { ...valueComponent.field, key },
              }}
              parentPath={path}
              row={map}
            />
          )}
          {allowRemove && (
            <View style={styles.buttonRow}>
              <GridButton label="Remove" secondary onPress={() => removeEntry(key)} />
            </View>
          )}
        </View>
      ))}
      {allowAdd && (
        <View style={[styles.buttonRow, styles.controlSpacing]}>
          <GridButton label={config?.addLabel ?? 'Add Another'} secondary onPress={addEntry} />
        </View>
      )}
    </FieldChrome>
  );
}

function MapKeyField({
  label,
  name,
  readOnly,
  onRename,
}: {
  label: string;
  name: string;
  readOnly: boolean;
  onRename: (next: string) => void;
}) {
  const styles = useFormStyles();
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? name;

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, styles.controlSpacing, readOnly && styles.inputDisabled]}
        value={text}
        editable={!readOnly}
        onChangeText={setDraft}
        onBlur={() => {
          onRename(text);
          setDraft(null);
        }}
      />
    </View>
  );
}

export function Tree({ component, path }: { component: FormComponent; path: string }) {
  const { form, readOnly } = useFormioRender();
  const editable = !readOnly && !form.readOnly && !component.field.disabled;

  return (
    <FieldChrome component={component} path={path}>
      <TreeNode component={component} nodePath={path} depth={0} editable={editable} />
    </FieldChrome>
  );
}

function TreeNode({
  component,
  nodePath,
  depth,
  editable,
  onRemove,
}: {
  component: FormComponent;
  nodePath: string;
  depth: number;
  editable: boolean;
  onRemove?: () => void;
}) {
  const styles = useFormStyles();
  const { form } = useFormioRender();
  const config = component.tree;
  const node = asTreeNode(form.getValue(nodePath));
  const allowAdd = editable && config?.allowAdd !== false;
  const allowRemove = Boolean(onRemove) && config?.allowRemove !== false;

  const writeNode = (next: { data: Record<string, unknown>; children: unknown[] }): void => {
    form.setValue(nodePath, next);
  };

  return (
    <View style={[styles.row, depth > 0 && styles.controlSpacing]}>
      <NodeList components={component.children} parentPath={joinPath(nodePath, 'data')} row={node.data} />
      {(allowAdd || allowRemove) && (
        <View style={styles.buttonRow}>
          {allowAdd && (
            <GridButton
              label={config?.addLabel ?? 'Add Child'}
              secondary
              onPress={() =>
                writeNode({
                  data: node.data,
                  children: [...node.children, emptyTreeNode(component)],
                })
              }
            />
          )}
          {allowRemove && onRemove && (
            <GridButton label={config?.removeLabel ?? 'Remove'} secondary onPress={onRemove} />
          )}
        </View>
      )}
      {node.children.length > 0 && (
        <View style={styles.nestedChildren}>
          {node.children.map((_, index) => (
            <TreeNode
              key={`${nodePath}-child-${index}`}
              component={component}
              nodePath={indexPath(joinPath(nodePath, 'children'), index)}
              depth={depth + 1}
              editable={editable}
              onRemove={
                editable && config?.allowRemove !== false
                  ? () =>
                      writeNode({
                        data: node.data,
                        children: node.children.filter((_, child) => child !== index),
                      })
                  : undefined
              }
            />
          ))}
        </View>
      )}
    </View>
  );
}
