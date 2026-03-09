/**
 * BuildingCreateMetadataSheet — bottom sheet form for new building metadata.
 *
 * Opened after polygon draw is closed. Fields: name, shortName, category, description.
 * On save, triggers the Supabase insert via the parent's saveBuilding callback.
 */

import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import type { BuildingCategory } from '@echoecho/shared';

interface Props {
  visible: boolean;
  isSaving: boolean;
  onSave: (metadata: {
    name: string;
    shortName: string;
    description: string;
    category: BuildingCategory;
  }) => void;
  onDiscard: () => void;
}

const CATEGORIES: { value: BuildingCategory; label: string }[] = [
  { value: 'academic', label: 'Academic' },
  { value: 'residential', label: 'Residential' },
  { value: 'dining', label: 'Dining' },
  { value: 'administrative', label: 'Administrative' },
  { value: 'athletic', label: 'Athletic' },
  { value: 'medical', label: 'Medical' },
  { value: 'utility', label: 'Utility' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'other', label: 'Other' },
];

export function BuildingCreateMetadataSheet({
  visible,
  isSaving,
  onSave,
  onDiscard,
}: Props) {
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<BuildingCategory>('academic');

  if (!visible) return null;

  function handleSave() {
    if (!name.trim()) {
      Alert.alert('Required', 'Building name is required.');
      return;
    }
    onSave({
      name: name.trim(),
      shortName: shortName.trim(),
      description: description.trim(),
      category,
    });
  }

  return (
    <View style={styles.overlay}>
      <ScrollView
        style={styles.sheet}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title} accessibilityRole="header">
          Building Details
        </Text>

        <FieldLabel label="Building name *" />
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Administration Building"
          placeholderTextColor="#5555aa"
          maxLength={100}
          accessibilityLabel="Building name, required"
        />

        <FieldLabel label="Short name (for voice matching, max 20)" />
        <TextInput
          style={styles.input}
          value={shortName}
          onChangeText={(t) => setShortName(t.slice(0, 20))}
          placeholder="e.g. Admin, Library"
          placeholderTextColor="#5555aa"
          maxLength={20}
          accessibilityLabel="Short name for voice matching, maximum 20 characters"
        />

        <FieldLabel label="Category" />
        <View style={styles.categoryRow}>
          {CATEGORIES.map((c) => (
            <Pressable
              key={c.value}
              style={[styles.categoryChip, category === c.value && styles.categoryChipActive]}
              onPress={() => setCategory(c.value)}
              accessibilityLabel={`Category: ${c.label}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: category === c.value }}
            >
              <Text
                style={[
                  styles.categoryLabel,
                  category === c.value && styles.categoryLabelActive,
                ]}
              >
                {c.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <FieldLabel label="Description" />
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={description}
          onChangeText={setDescription}
          placeholder="Optional description"
          placeholderTextColor="#5555aa"
          multiline
          accessibilityLabel="Building description"
        />

        <View style={styles.actions}>
          <Pressable
            style={styles.discardBtn}
            onPress={onDiscard}
            accessibilityLabel="Discard building"
            accessibilityRole="button"
          >
            <Text style={styles.discardLabel}>Discard</Text>
          </Pressable>
          <Pressable
            style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={isSaving}
            accessibilityLabel="Save building"
            accessibilityRole="button"
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveLabel}>Save Building</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function FieldLabel({ label }: { label: string }) {
  return (
    <Text style={styles.fieldLabel} accessibilityElementsHidden>
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '70%',
  },
  sheet: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#2a2a3e',
  },
  content: {
    padding: 20,
    gap: 10,
    paddingBottom: 40,
  },
  title: {
    color: '#e8e8f0',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  fieldLabel: {
    color: '#9090cc',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
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
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#14142a',
    borderWidth: 1,
    borderColor: '#2a2a3e',
    minHeight: 36,
    justifyContent: 'center',
  },
  categoryChipActive: {
    backgroundColor: '#6c63ff22',
    borderColor: '#6c63ff',
  },
  categoryLabel: {
    color: '#8888aa',
    fontSize: 12,
    fontWeight: '600',
  },
  categoryLabelActive: {
    color: '#6c63ff',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  discardBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#2a2a3e',
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  discardLabel: { color: '#9090cc', fontSize: 15, fontWeight: '600' },
  saveBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#6c63ff',
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
