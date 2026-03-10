/**
 * Settings tab — campus selector, user account, app configuration.
 */
import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useCampusStore } from '../../src/stores/campusStore';
import { useAuthStore } from '../../src/stores/authStore';
import type { Campus } from '@echoecho/shared';
import { tabColors } from '@echoecho/ui';
import { SectionColorProvider, useSectionColor } from '../../src/contexts/SectionColorContext';

export default function SettingsScreen() {
  return (
    <SectionColorProvider value={tabColors.settings}>
      <SettingsScreenInner />
    </SectionColorProvider>
  );
}

function SettingsScreenInner() {
  const accent = useSectionColor();
  const { activeCampus, campuses, setActiveCampus } = useCampusStore();
  const { signOut, session } = useAuthStore();
  const [showCampusPicker, setShowCampusPicker] = useState(false);

  const handleSwitchCampus = (campus: Campus) => {
    setActiveCampus(campus);
    setShowCampusPicker(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Active Campus</Text>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => setShowCampusPicker(!showCampusPicker)}
          accessibilityLabel={`Active campus: ${activeCampus?.name ?? 'None'}. Tap to change.`}
          accessibilityRole="button"
        >
          <Ionicons name="school-outline" size={20} color={accent} />
          <Text style={styles.rowText}>
            {activeCampus?.name ?? 'No campus selected'}
          </Text>
          <Ionicons
            name={showCampusPicker ? 'chevron-up' : 'chevron-down'}
            size={16}
            color="#606070"
          />
        </Pressable>
        {showCampusPicker && campuses.length > 0 && (
          <FlatList
            data={campuses}
            keyExtractor={(c) => c.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.campusOption,
                  item.id === activeCampus?.id && { backgroundColor: accent + '11' },
                  pressed && styles.rowPressed,
                ]}
                onPress={() => handleSwitchCampus(item)}
                accessibilityLabel={`Switch to ${item.name}`}
                accessibilityRole="button"
                accessibilityState={{ selected: item.id === activeCampus?.id }}
              >
                <Ionicons
                  name={item.id === activeCampus?.id ? 'radio-button-on' : 'radio-button-off'}
                  size={18}
                  color={item.id === activeCampus?.id ? accent : '#404050'}
                />
                <Text style={[
                  styles.campusOptionText,
                  item.id === activeCampus?.id && [styles.campusOptionTextActive, { color: accent }],
                ]}>
                  {item.name}
                </Text>
              </Pressable>
            )}
          />
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Developer Tools</Text>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => router.push('/haptic-lab')}
          accessibilityRole="button"
          accessibilityLabel="Open Haptic Lab"
          accessibilityHint="Test and calibrate haptic patterns for the navigation engine"
        >
          <Ionicons name="pulse-outline" size={20} color={accent} />
          <Text style={styles.rowText}>Haptic Lab</Text>
          <Ionicons name="chevron-forward" size={16} color="#606070" />
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => {
            Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign Out', style: 'destructive', onPress: () => void signOut() },
            ]);
          }}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Ionicons name="log-out-outline" size={20} color="#F06292" />
          <Text style={[styles.rowText, { color: '#F06292' }]}>Sign Out</Text>
          {session?.user?.email && (
            <Text style={styles.emailText}>{session.user.email}</Text>
          )}
        </Pressable>
      </View>

      <Text style={styles.version}>EchoEcho Admin v0.1.0</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F', padding: 16 },
  section: {
    backgroundColor: '#111116',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E1E26',
    marginBottom: 16,
    overflow: 'hidden',
  },
  sectionTitle: {
    color: '#606070',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    padding: 12,
    paddingBottom: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  rowPressed: { opacity: 0.7 },
  rowText: { color: '#F0F0F5', flex: 1, fontSize: 15 },
  emailText: { color: '#606070', fontSize: 12 },
  campusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: '#0D0D12',
  },
  campusOptionActive: {},
  campusOptionText: {
    color: '#606070',
    fontSize: 14,
  },
  campusOptionTextActive: {
    fontWeight: '600',
  },
  version: { color: '#1A5F7A', fontSize: 12, textAlign: 'center', marginTop: 'auto' },
});
