/**
 * BuildingMetadataSheet — bottom sheet form for editing building metadata.
 *
 * ALP-966 spec:
 *   Fields: name, shortName (max 20 chars), category, description
 *   Save writes to Supabase buildings table.
 *   All fields have accessibilityLabel + logical focus order.
 */

import { useState, type RefObject } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { supabase } from '../../lib/supabase';
import type { Building } from '@echoecho/shared';

interface Props {
  sheetRef: RefObject<BottomSheet>;
  building: Building;
  onSave: (updated: Building) => void;
}

const SNAP_POINTS = ['60%'];

export function BuildingMetadataSheet({ sheetRef, building, onSave }: Props) {
  const [name, setName] = useState(building.name);
  const [shortName, setShortName] = useState(building.shortName ?? '');
  const [description, setDescription] = useState(building.description ?? '');
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('Required', 'Building name is required.');
      return;
    }
    setIsSaving(true);
    const { data, error } = await supabase
      .from('buildings')
      .update({
        name: name.trim(),
        short_name: shortName.trim() || null,
        description: description.trim() || null,
      })
      .eq('id', building.id)
      .select('*')
      .single();

    setIsSaving(false);
    if (error) {
      Alert.alert('Save failed', error.message);
      return;
    }
    onSave({
      ...building,
      name: (data as Record<string, unknown>).name as string,
      shortName: ((data as Record<string, unknown>).short_name as string) ?? building.shortName,
      description: ((data as Record<string, unknown>).description as string) ?? building.description,
    });
    sheetRef.current?.close();
  }

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={SNAP_POINTS}
      enablePanDownToClose
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetView style={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          Edit Building
        </Text>

        <FormField
          label="Building name *"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Administration Building"
          maxLength={100}
        />
        <FormField
          label="Short name (used for voice matching)"
          value={shortName}
          onChangeText={(t) => setShortName(t.slice(0, 20))}
          placeholder="e.g. Admin, Library (max 20)"
          maxLength={20}
        />
        <FormField
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="Optional description"
          multiline
        />

        <View style={styles.actions}>
          <Pressable
            style={styles.cancelBtn}
            onPress={() => sheetRef.current?.close()}
            accessibilityLabel="Discard changes"
            accessibilityRole="button"
          >
            <Text style={styles.cancelLabel}>Discard</Text>
          </Pressable>
          <Pressable
            style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
            onPress={() => void handleSave()}
            disabled={isSaving}
            accessibilityLabel="Save building changes"
            accessibilityRole="button"
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveLabel}>Save</Text>
            )}
          </Pressable>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  maxLength,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  maxLength?: number;
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label} accessibilityElementsHidden>
        {label}
      </Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#5555aa"
        maxLength={maxLength}
        multiline={multiline}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  background: { backgroundColor: '#1a1a2e' },
  handle: { backgroundColor: '#4444aa' },
  content: { padding: 20, gap: 14 },
  title: { color: '#e8e8f0', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  field: { gap: 4 },
  label: { color: '#9090cc', fontSize: 12, fontWeight: '600' },
  input: {
    backgroundColor: '#14142a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    color: '#e8e8f0',
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 44,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#2a2a3e',
    alignItems: 'center',
    minHeight: 44,
  },
  cancelLabel: { color: '#9090cc', fontSize: 15, fontWeight: '600' },
  saveBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#6c63ff',
    alignItems: 'center',
    minHeight: 44,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
