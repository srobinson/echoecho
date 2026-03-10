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
import { useSectionColor } from '../../contexts/SectionColorContext';

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
  const accent = useSectionColor();
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
          placeholderTextColor="#404050"
          maxLength={100}
          accessibilityLabel="Building name, required"
        />

        <FieldLabel label="Short name (for voice matching, max 20)" />
        <TextInput
          style={styles.input}
          value={shortName}
          onChangeText={(t) => setShortName(t.slice(0, 20))}
          placeholder="e.g. Admin, Library"
          placeholderTextColor="#404050"
          maxLength={20}
          accessibilityLabel="Short name for voice matching, maximum 20 characters"
        />

        <FieldLabel label="Category" />
        <View style={styles.categoryRow}>
          {CATEGORIES.map((c) => (
            <Pressable
              key={c.value}
              style={[
                styles.categoryChip,
                category === c.value && { backgroundColor: accent + '22', borderColor: accent },
              ]}
              onPress={() => setCategory(c.value)}
              accessibilityLabel={`Category: ${c.label}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: category === c.value }}
            >
              <Text
                style={[
                  styles.categoryLabel,
                  category === c.value && { color: accent },
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
          placeholderTextColor="#404050"
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
            style={[styles.saveBtn, { backgroundColor: accent }, isSaving && styles.saveBtnDisabled]}
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
    backgroundColor: '#111116',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#1E1E26',
  },
  content: {
    padding: 20,
    gap: 10,
    paddingBottom: 40,
  },
  title: {
    color: '#F0F0F5',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  fieldLabel: {
    color: '#808090',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  input: {
    backgroundColor: '#0D0D12',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E1E26',
    color: '#F0F0F5',
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
    backgroundColor: '#0D0D12',
    borderWidth: 1,
    borderColor: '#1E1E26',
    minHeight: 36,
    justifyContent: 'center',
  },
  categoryChipActive: {},
  categoryLabel: {
    color: '#606070',
    fontSize: 12,
    fontWeight: '600',
  },
  categoryLabelActive: {},
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  discardBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#1E1E26',
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  discardLabel: { color: '#808090', fontSize: 15, fontWeight: '600' },
  saveBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
