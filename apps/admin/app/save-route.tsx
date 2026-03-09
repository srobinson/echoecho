/**
 * ALP-953: Route metadata form shown immediately after recording stops.
 *
 * Collects name, start/end buildings, difficulty, and tags before initiating
 * the save sequence. A "New Building" inline flow persists a building stub
 * before the route transaction begins.
 *
 * Save stages:
 *   validation → uploading audio → uploading photos → saving to database → done
 *
 * On success the recording session is cleared and the user is redirected to
 * the routes list. On failure the form stays open with an actionable error.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  AccessibilityInfo,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '../src/lib/supabase';
import { useRecordingStore } from '../src/stores/recordingStore';
import {
  saveRoute,
  createBuildingStub,
  type RouteDifficulty,
  type RouteTag,
  type RouteSaveMetadata,
  type SaveStage,
} from '../src/services/routeSaveService';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BuildingOption {
  id: string;
  name: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DIFFICULTIES: RouteDifficulty[] = ['easy', 'moderate', 'hard'];

const ALL_TAGS: RouteTag[] = [
  'indoor',
  'outdoor',
  'mixed',
  'stairs',
  'elevator',
  'accessible',
];

const STAGE_LABELS: Record<SaveStage, string> = {
  uploading_audio:    'Uploading audio annotations…',
  uploading_photos:   'Uploading waypoint photos…',
  saving_to_database: 'Saving route…',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function SaveRouteScreen() {
  const { session, clearSession } = useRecordingStore();

  // Form state
  const [name, setName]                             = useState('');
  const [difficulty, setDifficulty]                 = useState<RouteDifficulty>('easy');
  const [tags, setTags]                             = useState<RouteTag[]>([]);
  const [startBuildingId, setStartBuildingId]       = useState('');
  const [endBuildingId, setEndBuildingId]           = useState('');

  // Building fetch
  const [buildings, setBuildings]                   = useState<BuildingOption[]>([]);
  const [buildingsLoading, setBuildingsLoading]     = useState(true);

  // Inline building creation
  const [showNewBuilding, setShowNewBuilding]       = useState<'start' | 'end' | null>(null);
  const [newBuildingName, setNewBuildingName]       = useState('');
  const [buildingCreating, setBuildingCreating]     = useState(false);

  // Save progress
  const [saving, setSaving]                         = useState(false);
  const [saveStageLabel, setSaveStageLabel]         = useState('');
  const [saveError, setSaveError]                   = useState<string | null>(null);

  // If there's no session (e.g. direct navigation), go back
  useEffect(() => {
    if (!session) {
      router.replace('/(tabs)/routes');
    }
  }, [session]);

  // Fetch buildings for the current campus
  useEffect(() => {
    if (!session?.campusId) return;

    supabase
      .from('buildings')
      .select('id, name')
      .eq('campus_id', session.campusId)
      .is('deleted_at', null)
      .order('name')
      .then(({ data, error }) => {
        setBuildingsLoading(false);
        if (error) return;
        setBuildings((data ?? []) as BuildingOption[]);
      });
  }, [session?.campusId]);

  // ── Tag toggle ──────────────────────────────────────────────────────────────

  const toggleTag = useCallback((tag: RouteTag) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }, []);

  // ── Inline building creation ────────────────────────────────────────────────

  const handleCreateBuilding = useCallback(async () => {
    if (!newBuildingName.trim() || !session?.campusId) return;

    // Use the track point closest to where the building is: first point for
    // the start building, last point for the end building.
    const locationPoint =
      showNewBuilding === 'end'
        ? session.trackPoints[session.trackPoints.length - 1]
        : session.trackPoints[0];

    if (!locationPoint) {
      Alert.alert('No GPS data', 'Cannot create a building without a recorded location.');
      return;
    }

    setBuildingCreating(true);
    const result = await createBuildingStub(
      session.campusId,
      newBuildingName.trim(),
      locationPoint.latitude,
      locationPoint.longitude,
    );
    setBuildingCreating(false);

    if (!result.ok) {
      Alert.alert('Error', `Could not create building: ${result.error}`);
      return;
    }

    const newBuilding: BuildingOption = { id: result.buildingId, name: newBuildingName.trim() };
    setBuildings((prev) => [...prev, newBuilding].sort((a, b) => a.name.localeCompare(b.name)));

    if (showNewBuilding === 'start') setStartBuildingId(result.buildingId);
    if (showNewBuilding === 'end')   setEndBuildingId(result.buildingId);

    setShowNewBuilding(null);
    setNewBuildingName('');
  }, [newBuildingName, session, showNewBuilding]);

  // ── Save ───────────────────────────────────────────────────────────────────

  const validate = useCallback((): string | null => {
    if (!name.trim())                        return 'Route name is required.';
    if (!startBuildingId)                    return 'Start building is required.';
    if (!endBuildingId)                      return 'End building is required.';
    if (!session?.campusId)                  return 'No campus associated with this session.';
    if ((session?.trackPoints.length ?? 0) === 0) return 'No GPS data recorded. Cannot save an empty route.';
    return null;
  }, [name, startBuildingId, endBuildingId, session]);

  const handleSave = useCallback(async () => {
    const validationError = validate();
    if (validationError) {
      Alert.alert('Incomplete', validationError);
      return;
    }
    if (!session) return;

    setSaving(true);
    setSaveError(null);

    const metadata: RouteSaveMetadata = {
      name:            name.trim(),
      startBuildingId,
      endBuildingId,
      difficulty,
      tags,
    };

    const result = await saveRoute(session, metadata, (stage) => {
      const label = STAGE_LABELS[stage];
      setSaveStageLabel(label);
      AccessibilityInfo.announceForAccessibility(label);
    });

    setSaving(false);

    if (!result.ok) {
      const stageLabel =
        result.stage === 'upload_audio'  ? 'audio upload' :
        result.stage === 'upload_photo'  ? 'photo upload' :
        'database save';
      const message = `Failed during ${stageLabel}: ${result.error}`;
      setSaveError(message);
      AccessibilityInfo.announceForAccessibility(`Error: ${message}`);
      return;
    }

    AccessibilityInfo.announceForAccessibility('Route saved successfully.');
    clearSession();
    router.replace('/(tabs)/routes');
  }, [validate, session, name, startBuildingId, endBuildingId, difficulty, tags, clearSession]);

  // ── Discard ────────────────────────────────────────────────────────────────

  const handleDiscard = useCallback(() => {
    Alert.alert(
      'Discard Recording',
      'The recorded track and waypoints will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            clearSession();
            router.replace('/(tabs)/routes');
          },
        },
      ],
    );
  }, [clearSession]);

  if (!session) return null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading} accessibilityRole="header">
          Save Route
        </Text>

        <Text style={styles.subheading}>
          {session.pendingWaypoints.length} waypoint
          {session.pendingWaypoints.length !== 1 ? 's' : ''} recorded
        </Text>

        {/* ── Route name ────────────────────────────────────────────────── */}
        <Text style={styles.label}>Route name *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Main entrance to gymnasium"
          placeholderTextColor="#888"
          accessibilityLabel="Route name, required"
          autoCapitalize="sentences"
          returnKeyType="done"
        />

        {/* ── Start building ────────────────────────────────────────────── */}
        <Text style={styles.label}>Start building *</Text>
        {buildingsLoading ? (
          <ActivityIndicator style={styles.loader} color="#6c63ff" />
        ) : (
          <BuildingPicker
            value={startBuildingId}
            buildings={buildings}
            onSelect={setStartBuildingId}
            onNew={() => setShowNewBuilding('start')}
            placeholder="Select start building"
          />
        )}

        {/* ── End building ──────────────────────────────────────────────── */}
        <Text style={styles.label}>End building *</Text>
        {buildingsLoading ? (
          <ActivityIndicator style={styles.loader} color="#6c63ff" />
        ) : (
          <BuildingPicker
            value={endBuildingId}
            buildings={buildings}
            onSelect={setEndBuildingId}
            onNew={() => setShowNewBuilding('end')}
            placeholder="Select end building"
          />
        )}

        {/* ── Inline building creation ──────────────────────────────────── */}
        {showNewBuilding && (
          <View style={styles.newBuildingBox} accessibilityLiveRegion="polite">
            <Text style={styles.label}>
              New building name ({showNewBuilding === 'start' ? 'start' : 'end'})
            </Text>
            <TextInput
              style={styles.input}
              value={newBuildingName}
              onChangeText={setNewBuildingName}
              placeholder="Building name"
              placeholderTextColor="#888"
              accessibilityLabel="New building name"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreateBuilding}
            />
            <View style={styles.row}>
              <Pressable
                style={[styles.chipButton, styles.chipButtonSecondary]}
                onPress={() => { setShowNewBuilding(null); setNewBuildingName(''); }}
                accessibilityRole="button"
                accessibilityLabel="Cancel new building"
              >
                <Text style={styles.chipButtonSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.chipButton, (buildingCreating || !newBuildingName.trim()) && styles.chipButtonDisabled]}
                onPress={handleCreateBuilding}
                disabled={buildingCreating || !newBuildingName.trim()}
                accessibilityRole="button"
                accessibilityLabel="Create building"
              >
                {buildingCreating
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.chipButtonText}>Create</Text>
                }
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Difficulty ────────────────────────────────────────────────── */}
        <Text style={styles.label}>Difficulty</Text>
        <View style={styles.row} accessibilityRole="radiogroup">
          {DIFFICULTIES.map((d) => (
            <Pressable
              key={d}
              style={[styles.chip, difficulty === d && styles.chipSelected]}
              onPress={() => setDifficulty(d)}
              accessibilityRole="radio"
              accessibilityState={{ checked: difficulty === d }}
              accessibilityLabel={d}
            >
              <Text style={[styles.chipText, difficulty === d && styles.chipTextSelected]}>
                {d}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ── Tags ──────────────────────────────────────────────────────── */}
        <Text style={styles.label}>Tags</Text>
        <View style={styles.tagGrid} accessible accessibilityLabel="Route tags">
          {ALL_TAGS.map((tag) => (
            <Pressable
              key={tag}
              style={[styles.chip, tags.includes(tag) && styles.chipSelected]}
              onPress={() => toggleTag(tag)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: tags.includes(tag) }}
              accessibilityLabel={tag}
            >
              <Text style={[styles.chipText, tags.includes(tag) && styles.chipTextSelected]}>
                {tag}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ── Save error ────────────────────────────────────────────────── */}
        {saveError && (
          <View
            style={styles.errorBox}
            accessibilityLiveRegion="assertive"
            accessibilityRole="alert"
          >
            <Text style={styles.errorText}>{saveError}</Text>
            <Text style={styles.errorHint}>
              Your recording is intact. Fix the issue and try again.
            </Text>
          </View>
        )}

        {/* ── Save progress ─────────────────────────────────────────────── */}
        {saving && (
          <View style={styles.progressBox} accessibilityLiveRegion="polite">
            <ActivityIndicator color="#6c63ff" />
            <Text style={styles.progressText}>{saveStageLabel}</Text>
          </View>
        )}

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <View style={styles.actions}>
          <Pressable
            style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Save route"
            accessibilityState={{ disabled: saving }}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.primaryButtonText}>Save Route</Text>
            }
          </Pressable>

          <Pressable
            style={styles.discardButton}
            onPress={handleDiscard}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Discard recording"
            accessibilityState={{ disabled: saving }}
          >
            <Text style={styles.discardButtonText}>Discard Recording</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── BuildingPicker ────────────────────────────────────────────────────────────

interface BuildingPickerProps {
  value: string;
  buildings: BuildingOption[];
  placeholder: string;
  onSelect: (id: string) => void;
  onNew: () => void;
}

function BuildingPicker({ value, buildings, placeholder, onSelect, onNew }: BuildingPickerProps) {
  const selected = buildings.find((b) => b.id === value);

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.buildingRow}
      >
        {buildings.map((b) => (
          <Pressable
            key={b.id}
            style={[styles.buildingChip, value === b.id && styles.buildingChipSelected]}
            onPress={() => onSelect(b.id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: value === b.id }}
            accessibilityLabel={b.name}
          >
            <Text
              style={[
                styles.buildingChipText,
                value === b.id && styles.buildingChipTextSelected,
              ]}
              numberOfLines={1}
            >
              {b.name}
            </Text>
          </Pressable>
        ))}

        <Pressable
          style={styles.newBuildingChip}
          onPress={onNew}
          accessibilityRole="button"
          accessibilityLabel="Create new building"
        >
          <Text style={styles.newBuildingChipText}>+ New</Text>
        </Pressable>
      </ScrollView>

      {!selected && (
        <Text style={styles.placeholderNote}>{placeholder}</Text>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const C = {
  bg:         '#0f0f1a',
  surface:    '#1a1a2e',
  border:     '#2d2d4a',
  accent:     '#6c63ff',
  accentDim:  '#3d3878',
  text:       '#f0f0ff',
  textMuted:  '#888',
  error:      '#e53e3e',
  errorBg:    '#2d1515',
};

const styles = StyleSheet.create({
  container:            { flex: 1, backgroundColor: C.bg },
  scroll:               { padding: 20, paddingBottom: 40 },
  heading:              { fontSize: 24, fontWeight: '700', color: C.text, marginBottom: 4 },
  subheading:           { fontSize: 14, color: C.textMuted, marginBottom: 24 },
  label:                { fontSize: 14, color: C.textMuted, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  input: {
    backgroundColor:    C.surface,
    borderWidth:        1,
    borderColor:        C.border,
    borderRadius:       8,
    padding:            12,
    color:              C.text,
    fontSize:           16,
    minHeight:          48,
  },
  loader:               { marginVertical: 12 },
  row:                  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  tagGrid:              { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    paddingHorizontal:  14,
    paddingVertical:    8,
    borderRadius:       20,
    borderWidth:        1,
    borderColor:        C.border,
    backgroundColor:    C.surface,
    minHeight:          44,
    justifyContent:     'center',
  },
  chipSelected:         { backgroundColor: C.accent, borderColor: C.accent },
  chipText:             { fontSize: 14, color: C.textMuted },
  chipTextSelected:     { color: '#fff', fontWeight: '600' },
  chipButton: {
    flex:               1,
    paddingVertical:    12,
    borderRadius:       8,
    backgroundColor:    C.accent,
    alignItems:         'center',
    justifyContent:     'center',
    minHeight:          48,
  },
  chipButtonSecondary:  { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  chipButtonDisabled:   { opacity: 0.5 },
  chipButtonText:       { color: '#fff', fontWeight: '600', fontSize: 15 },
  chipButtonSecondaryText: { color: C.text, fontSize: 15 },
  buildingRow:          { gap: 8, paddingBottom: 4 },
  buildingChip: {
    paddingHorizontal:  14,
    paddingVertical:    10,
    borderRadius:       8,
    borderWidth:        1,
    borderColor:        C.border,
    backgroundColor:    C.surface,
    maxWidth:           180,
    minHeight:          44,
    justifyContent:     'center',
  },
  buildingChipSelected: { backgroundColor: C.accent, borderColor: C.accent },
  buildingChipText:     { fontSize: 14, color: C.textMuted },
  buildingChipTextSelected: { color: '#fff', fontWeight: '600' },
  newBuildingChip: {
    paddingHorizontal:  14,
    paddingVertical:    10,
    borderRadius:       8,
    borderWidth:        1,
    borderColor:        C.accentDim,
    minHeight:          44,
    justifyContent:     'center',
  },
  newBuildingChipText:  { color: C.accent, fontSize: 14 },
  placeholderNote:      { fontSize: 12, color: C.textMuted, marginTop: 4 },
  newBuildingBox: {
    backgroundColor:    C.surface,
    borderRadius:       10,
    padding:            16,
    marginTop:          12,
    borderWidth:        1,
    borderColor:        C.accentDim,
  },
  errorBox: {
    backgroundColor:    C.errorBg,
    borderRadius:       8,
    padding:            14,
    marginTop:          20,
    borderWidth:        1,
    borderColor:        C.error,
  },
  errorText:            { color: C.error, fontSize: 14, fontWeight: '600', marginBottom: 4 },
  errorHint:            { color: C.textMuted, fontSize: 13 },
  progressBox: {
    flexDirection:      'row',
    alignItems:         'center',
    gap:                12,
    marginTop:          20,
    padding:            14,
    backgroundColor:    C.surface,
    borderRadius:       8,
  },
  progressText:         { color: C.text, fontSize: 14 },
  actions:              { marginTop: 32, gap: 12 },
  primaryButton: {
    backgroundColor:    C.accent,
    borderRadius:       10,
    paddingVertical:    16,
    alignItems:         'center',
    justifyContent:     'center',
    minHeight:          56,
  },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText:    { color: '#fff', fontSize: 17, fontWeight: '700' },
  discardButton: {
    borderRadius:       10,
    paddingVertical:    14,
    alignItems:         'center',
    justifyContent:     'center',
    minHeight:          48,
  },
  discardButtonText:    { color: C.error, fontSize: 15 },
});
