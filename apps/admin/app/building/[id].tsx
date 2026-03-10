/**
 * BuildingDetailScreen: view and edit building metadata, entrances, and actions.
 * ALP-1149: Provides a detail screen navigable from the buildings list.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  AccessibilityInfo,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import type { Building } from '@echoecho/shared';
import { tabColors } from '@echoecho/ui';
import { SectionColorProvider, useSectionColor } from '../../src/contexts/SectionColorContext';

const CATEGORY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  academic: 'school-outline',
  residential: 'home-outline',
  dining: 'restaurant-outline',
  administrative: 'briefcase-outline',
  athletic: 'fitness-outline',
  medical: 'medkit-outline',
  utility: 'construct-outline',
  outdoor: 'leaf-outline',
  other: 'business-outline',
};

export default function BuildingDetailScreen() {
  return (
    <SectionColorProvider value={tabColors.buildings}>
      <BuildingDetailScreenInner />
    </SectionColorProvider>
  );
}

function BuildingDetailScreenInner() {
  const accent = useSectionColor();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [building, setBuilding] = useState<Building | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Inline edit state
  const [editName, setEditName] = useState('');
  const [editShortName, setEditShortName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const fetchBuilding = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from('v_buildings' as 'buildings')
      .select('*')
      .eq('id', id)
      .single();

    if (!error && data) {
      const b = data as Building;
      setBuilding(b);
      setEditName(b.name);
      setEditShortName(b.shortName ?? '');
      setEditDescription(b.description ?? '');
    }
    setIsLoading(false);
  }, [id]);

  useEffect(() => {
    const run = async () => { await fetchBuilding(); };
    void run();
  }, [fetchBuilding]);

  const handleSaveMetadata = useCallback(async () => {
    if (!building) return;
    if (!editName.trim()) {
      Alert.alert('Required', 'Building name is required.');
      return;
    }
    setIsSaving(true);
    const { error } = await supabase
      .from('buildings')
      .update({
        name: editName.trim(),
        short_name: editShortName.trim() || null,
        description: editDescription.trim() || null,
      })
      .eq('id', building.id);

    setIsSaving(false);
    if (error) {
      Alert.alert('Save failed', error.message);
      return;
    }
    setBuilding({
      ...building,
      name: editName.trim(),
      shortName: editShortName.trim() || null,
      description: editDescription.trim() || null,
    });
    setIsEditing(false);
    AccessibilityInfo.announceForAccessibility('Building saved.');
  }, [building, editName, editShortName, editDescription]);

  const handleDelete = useCallback(() => {
    if (!building) return;
    Alert.alert(
      `Delete "${building.name}"?`,
      'This will remove the building and all its entrances. This cannot be undone.',
      [
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('buildings')
              .delete()
              .eq('id', building.id);
            if (error) {
              Alert.alert('Delete failed', error.message);
              return;
            }
            AccessibilityInfo.announceForAccessibility(`${building.name} deleted.`);
            router.back();
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }, [building]);

  if (isLoading || !building) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      </SafeAreaView>
    );
  }

  const icon = CATEGORY_ICON[building.category] ?? 'business-outline';
  const entranceCount = building.entrances?.length ?? 0;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            style={styles.backBtn}
            onPress={() => router.back()}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Ionicons name="arrow-back" size={22} color="#F0F0F5" />
          </Pressable>
          <View style={styles.headerTitle}>
            <Text style={styles.buildingName} numberOfLines={2}>
              {building.name}
            </Text>
            <View style={styles.headerMeta}>
              <View style={[styles.categoryBadge, { backgroundColor: accent + '22' }]}>
                <Ionicons name={icon} size={14} color={accent} />
                <Text style={[styles.categoryText, { color: accent }]}>
                  {building.category}
                </Text>
              </View>
              {building.shortName && building.shortName !== building.name && (
                <Text style={styles.shortName}>{building.shortName}</Text>
              )}
            </View>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatBox value={`${entranceCount}`} label={entranceCount === 1 ? 'Entrance' : 'Entrances'} />
          {building.floor != null && (
            <StatBox value={`${building.floor}`} label={building.floor === 1 ? 'Floor' : 'Floors'} />
          )}
        </View>

        {/* Metadata */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle} accessibilityRole="header">Details</Text>
            <Pressable
              onPress={() => isEditing ? void handleSaveMetadata() : setIsEditing(true)}
              disabled={isSaving}
              accessibilityLabel={isEditing ? 'Save metadata' : 'Edit metadata'}
              accessibilityRole="button"
              style={[styles.editToggle, { backgroundColor: accent + '22' }]}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={accent} />
              ) : (
                <Text style={[styles.editToggleLabel, { color: accent }]}>
                  {isEditing ? 'Save' : 'Edit'}
                </Text>
              )}
            </Pressable>
          </View>

          {isEditing ? (
            <>
              <MetaField label="Name *">
                <TextInput
                  style={styles.metaInput}
                  value={editName}
                  onChangeText={setEditName}
                  accessibilityLabel="Building name"
                  maxLength={100}
                />
              </MetaField>
              <MetaField label="Short name">
                <TextInput
                  style={styles.metaInput}
                  value={editShortName}
                  onChangeText={(t) => setEditShortName(t.slice(0, 20))}
                  placeholder="Max 20 characters"
                  placeholderTextColor="#404050"
                  accessibilityLabel="Building short name"
                  maxLength={20}
                />
              </MetaField>
              <MetaField label="Description">
                <TextInput
                  style={[styles.metaInput, styles.metaInputMultiline]}
                  value={editDescription}
                  onChangeText={setEditDescription}
                  placeholder="Optional description"
                  placeholderTextColor="#404050"
                  multiline
                  accessibilityLabel="Building description"
                />
              </MetaField>
              <Pressable
                style={styles.cancelEditBtn}
                onPress={() => {
                  setEditName(building.name);
                  setEditShortName(building.shortName ?? '');
                  setEditDescription(building.description ?? '');
                  setIsEditing(false);
                }}
                accessibilityLabel="Cancel editing"
                accessibilityRole="button"
              >
                <Text style={styles.cancelEditLabel}>Cancel</Text>
              </Pressable>
            </>
          ) : (
            <>
              <MetaRow label="Category" value={building.category} />
              {building.shortName && <MetaRow label="Short name" value={building.shortName} />}
              {building.description && <MetaRow label="Description" value={building.description} />}
              {building.floor != null && <MetaRow label="Floors" value={`${building.floor}`} />}
              <MetaRow label="Created" value={new Date(building.createdAt).toLocaleDateString()} />
            </>
          )}
        </View>

        {/* Entrances */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Entrances ({entranceCount})
          </Text>
          {entranceCount === 0 ? (
            <Text style={styles.emptyText}>No entrances marked yet.</Text>
          ) : (
            building.entrances.map((entrance) => (
              <View key={entrance.id} style={styles.entranceRow}>
                <Ionicons
                  name={entrance.isMain ? 'enter' : 'git-merge-outline'}
                  size={16}
                  color={entrance.isMain ? accent : '#606070'}
                />
                <View style={styles.entranceContent}>
                  <Text style={styles.entranceName}>{entrance.name}</Text>
                  {entrance.isMain && (
                    <View style={[styles.mainBadge, { backgroundColor: accent + '22' }]}>
                      <Text style={[styles.mainBadgeText, { color: accent }]}>Main</Text>
                    </View>
                  )}
                </View>
                {entrance.accessibilityNotes && (
                  <Ionicons name="accessibility-outline" size={14} color="#606070" />
                )}
              </View>
            ))
          )}
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">Actions</Text>
          <View style={styles.actionGrid}>
            <ActionButton
              icon="trash"
              label="Delete"
              color="#F06292"
              onPress={handleDelete}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatBox({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statBox} accessible accessibilityLabel={`${value} ${label}`}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function MetaField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.metaField}>
      <Text style={styles.metaFieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function ActionButton({
  icon,
  label,
  color,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.actionBtn,
        { backgroundColor: `${color}22`, borderColor: `${color}44` },
        pressed && styles.actionBtnPressed,
      ]}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#111116',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { flex: 1, gap: 6 },
  buildingName: { color: '#F0F0F5', fontSize: 20, fontWeight: '700' },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  categoryText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  shortName: { color: '#606070', fontSize: 13 },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#111116',
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#1E1E26',
  },
  statValue: { color: '#F0F0F5', fontSize: 16, fontWeight: '700' },
  statLabel: { color: '#606070', fontSize: 10, textTransform: 'uppercase' },
  section: {
    backgroundColor: '#111116',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#1E1E26',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: { color: '#808090', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  editToggle: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  editToggleLabel: { fontSize: 13, fontWeight: '600' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#0D0D12',
  },
  metaLabel: { color: '#808090', fontSize: 12, width: 80 },
  metaValue: { color: '#F0F0F5', fontSize: 13, fontWeight: '500', flex: 1 },
  metaField: { gap: 4 },
  metaFieldLabel: { color: '#808090', fontSize: 12, fontWeight: '600' },
  metaInput: {
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
  metaInputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  cancelEditBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#1E1E26',
  },
  cancelEditLabel: { color: '#808090', fontSize: 13, fontWeight: '600' },
  entranceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#0D0D12',
  },
  entranceContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  entranceName: { color: '#c8c8e8', fontSize: 14 },
  mainBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  mainBadgeText: { fontSize: 10, fontWeight: '700' },
  emptyText: { color: '#404050', fontSize: 13, fontStyle: 'italic' },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 44,
  },
  actionBtnPressed: { opacity: 0.75 },
  actionLabel: { fontSize: 13, fontWeight: '600' },
});
