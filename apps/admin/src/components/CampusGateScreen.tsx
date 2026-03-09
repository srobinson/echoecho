import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  FlatList,
  AccessibilityInfo,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCampusDetection } from '../hooks/useCampusDetection';
import { useCampusStore } from '../stores/campusStore';
import type { Campus } from '@echoecho/shared';

export function CampusGateScreen() {
  const { state, detect, selectCampus, createCampus } = useCampusDetection();
  const campuses = useCampusStore((s) => s.campuses);
  const [campusName, setCampusName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    void detect();
  }, [detect]);

  useEffect(() => {
    if (state.phase === 'found') {
      AccessibilityInfo.announceForAccessibility(
        `Welcome to ${state.campus.name}`,
      );
    }
  }, [state]);

  if (
    state.phase === 'idle' ||
    state.phase === 'requesting_permission' ||
    state.phase === 'locating' ||
    state.phase === 'checking'
  ) {
    const message =
      state.phase === 'requesting_permission'
        ? 'Requesting location access...'
        : state.phase === 'locating'
          ? 'Finding your location...'
          : state.phase === 'checking'
            ? 'Looking for nearby campuses...'
            : 'Starting up...';

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#6c63ff" />
          <Text style={styles.statusText}>{message}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (state.phase === 'no_permission') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Ionicons name="location-outline" size={48} color="#8888aa" />
          <Text style={styles.title}>Location Required</Text>
          <Text style={styles.subtitle}>
            EchoEcho needs your location to find or create a campus.
            Please enable location access in your device settings.
          </Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => void detect()}
            accessibilityLabel="Try again"
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnText}>Try Again</Text>
          </Pressable>
          {campuses.length > 0 && (
            <CampusList campuses={campuses} onSelect={selectCampus} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  if (state.phase === 'error') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={48} color="#e53e3e" />
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>{state.message}</Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => void detect()}
            accessibilityLabel="Retry"
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (state.phase === 'not_found') {
    const handleCreate = async () => {
      const trimmed = campusName.trim();
      if (!trimmed) {
        Alert.alert('Required', 'Please enter a campus name.');
        return;
      }
      setIsCreating(true);
      try {
        await createCampus(trimmed, state.latitude, state.longitude);
      } catch (err) {
        Alert.alert('Failed', (err as Error).message);
      } finally {
        setIsCreating(false);
      }
    };

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Ionicons name="school-outline" size={48} color="#6c63ff" />
          <Text style={styles.title}>No Campus Found</Text>
          <Text style={styles.subtitle}>
            No campus exists near your current location.
            Create one to get started.
          </Text>

          <View style={styles.formSection}>
            <Text style={styles.label}>Campus Name</Text>
            <TextInput
              style={styles.input}
              value={campusName}
              onChangeText={setCampusName}
              placeholder="e.g. TSBVI Austin Campus"
              placeholderTextColor="#5555aa"
              accessibilityLabel="Campus name"
              autoFocus
            />
            <Text style={styles.hint}>
              Location: {state.latitude.toFixed(4)}, {state.longitude.toFixed(4)}
            </Text>
          </View>

          <Pressable
            style={[styles.primaryBtn, isCreating && styles.btnDisabled]}
            onPress={() => void handleCreate()}
            disabled={isCreating}
            accessibilityLabel="Create campus"
            accessibilityRole="button"
          >
            {isCreating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Create Campus</Text>
            )}
          </Pressable>

          {campuses.length > 0 && (
            <>
              <Text style={styles.dividerText}>or select an existing campus</Text>
              <CampusList campuses={campuses} onSelect={selectCampus} />
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // phase === 'found' is handled by parent (shows tabs)
  return null;
}

function CampusList({
  campuses,
  onSelect,
}: {
  campuses: Campus[];
  onSelect: (c: Campus) => void;
}) {
  return (
    <FlatList
      data={campuses}
      keyExtractor={(c) => c.id}
      style={styles.list}
      renderItem={({ item }) => (
        <Pressable
          style={({ pressed }) => [styles.campusRow, pressed && styles.campusRowPressed]}
          onPress={() => onSelect(item)}
          accessibilityLabel={`Select ${item.name}`}
          accessibilityRole="button"
        >
          <Ionicons name="school" size={18} color="#6c63ff" />
          <Text style={styles.campusName}>{item.name}</Text>
          <Ionicons name="chevron-forward" size={16} color="#8888aa" />
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  content: { flex: 1, padding: 24, paddingTop: 60, alignItems: 'center', gap: 16 },
  title: { color: '#e8e8f0', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  subtitle: {
    color: '#8888aa',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
  statusText: { color: '#8888aa', fontSize: 15, marginTop: 12 },
  formSection: { width: '100%', gap: 8, marginTop: 8 },
  label: { color: '#9090cc', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  input: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    color: '#e8e8f0',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 48,
  },
  hint: { color: '#5555aa', fontSize: 12 },
  primaryBtn: {
    backgroundColor: '#6c63ff',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  btnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  dividerText: {
    color: '#5555aa',
    fontSize: 13,
    marginTop: 16,
  },
  list: { width: '100%', marginTop: 8 },
  campusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  campusRowPressed: { opacity: 0.7, backgroundColor: '#2a2a3e' },
  campusName: { color: '#e8e8f0', fontSize: 15, flex: 1 },
});
