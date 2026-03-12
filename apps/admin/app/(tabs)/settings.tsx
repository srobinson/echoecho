/**
 * Settings tab — campus selector, user account, app configuration.
 */
import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  FlatList,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { useCampusStore } from '../../src/stores/campusStore';
import { useAuthStore } from '../../src/stores/authStore';
import type { Campus } from '@echoecho/shared';
import { tabColors } from '@echoecho/ui';
import { SectionColorProvider, useSectionColor } from '../../src/contexts/SectionColorContext';
import { useHasRole } from '../../src/hooks/useProtectedRoute';
import { createCampus, softDeleteCampus } from '../../src/services/campusService';

const LOCATION_TIMEOUT_MS = 10_000;

function getCurrentPosition(): Promise<Location.LocationObject> {
  return Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Location timed out')), LOCATION_TIMEOUT_MS)
    ),
  ]);
}

export default function SettingsScreen() {
  return (
    <SectionColorProvider value={tabColors.settings}>
      <SettingsScreenInner />
    </SectionColorProvider>
  );
}

function SettingsScreenInner() {
  const accent = useSectionColor();
  const { activeCampus, campuses, setActiveCampus, addCampus, removeCampus } = useCampusStore();
  const { signOut, session, refreshProfile } = useAuthStore();
  const isAdmin = useHasRole('admin');
  const [newCampusName, setNewCampusName] = useState('');
  const [isCreatingCampus, setIsCreatingCampus] = useState(false);
  const [isDeletingCampusId, setIsDeletingCampusId] = useState<string | null>(null);
  const [menuCampusId, setMenuCampusId] = useState<string | null>(null);

  const handleSwitchCampus = (campus: Campus) => {
    setActiveCampus(campus);
    setMenuCampusId(null);
  };

  const handleCreateCampus = async () => {
    const trimmedName = newCampusName.trim();
    if (!trimmedName) {
      Alert.alert('Required', 'Enter a campus name before creating it.');
      return;
    }

    setIsCreatingCampus(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Location permission is required to create a campus from your current position.');
      }

      const cached = await Location.getLastKnownPositionAsync({ maxAge: 30_000 });
      const loc = cached ?? await getCurrentPosition();

      const createdCampus = await createCampus({
        name: trimmedName,
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        isBootstrap: campuses.length === 0,
      });

      addCampus(createdCampus);
      setActiveCampus(createdCampus);
      setNewCampusName('');

      if (campuses.length === 0) {
        await refreshProfile();
      }
    } catch (err) {
      Alert.alert('Create Campus Failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsCreatingCampus(false);
    }
  };

  const confirmDeleteCampus = (campus: Campus) => {
    if (campuses.length <= 1) {
      Alert.alert('Cannot Delete Campus', 'At least one campus must remain configured.');
      return;
    }

    Alert.alert(
      'Delete Campus',
      `Remove ${campus.name} from the active campus list? Existing campus-linked records will be hidden rather than hard-deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void handleDeleteCampus(campus),
        },
      ],
    );
  };

  const handleDeleteCampus = async (campus: Campus) => {
    setIsDeletingCampusId(campus.id);
    try {
      const nextCampus = activeCampus?.id === campus.id
        ? (campuses.find((item) => item.id !== campus.id) ?? null)
        : activeCampus;

      await softDeleteCampus(campus.id);
      removeCampus(campus.id, nextCampus);
      setMenuCampusId(null);
    } catch (err) {
      Alert.alert('Delete Campus Failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsDeletingCampusId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
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
        <Text style={styles.sectionTitle}>Campuses</Text>
        {campuses.map((campus) => {
          const isActive = campus.id === activeCampus?.id;
          const isDeleting = isDeletingCampusId === campus.id;
          const isMenuOpen = menuCampusId === campus.id;

          return (
            <View
              key={campus.id}
              style={[
                styles.campusListRow,
                isActive && { backgroundColor: accent + '10' },
                isMenuOpen && styles.campusListRowMenuOpen,
              ]}
            >
              <Pressable
                style={({ pressed }) => [
                  styles.campusRowButton,
                  pressed && styles.rowPressed,
                ]}
                onPress={() => handleSwitchCampus(campus)}
                accessibilityLabel={`Switch to ${campus.name}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <View style={[
                  styles.activeIndicator,
                  isActive && { backgroundColor: accent },
                ]} />
                <Ionicons
                  name={isActive ? 'radio-button-on' : 'radio-button-off'}
                  size={18}
                  color={isActive ? accent : '#404050'}
                />
                <View style={styles.campusTextBlock}>
                  <Text style={[
                    styles.campusNameText,
                    isActive && { color: accent, fontWeight: '700' },
                  ]}>
                    {campus.name}
                  </Text>
                  <Text style={styles.campusMetaText}>
                    {isActive ? 'Active campus' : 'Tap to switch to this campus'}
                  </Text>
                </View>
              </Pressable>
              {isAdmin && (
                <View style={styles.menuWrapper}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.iconButton,
                      pressed && styles.rowPressed,
                    ]}
                    onPress={() => setMenuCampusId((current) => current === campus.id ? null : campus.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`More actions for ${campus.name}`}
                  >
                    <Ionicons name="ellipsis-horizontal" size={18} color="#A0A0B8" />
                  </Pressable>
                  {menuCampusId === campus.id && (
                    <View style={styles.contextMenu}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.contextMenuItem,
                          pressed && styles.rowPressed,
                          (isDeleting || campuses.length <= 1) && styles.buttonDisabled,
                        ]}
                        onPress={() => confirmDeleteCampus(campus)}
                        disabled={isDeleting || campuses.length <= 1}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${campus.name}`}
                      >
                        {isDeleting ? (
                          <ActivityIndicator size="small" color="#F06292" />
                        ) : (
                          <>
                            <Ionicons name="trash-outline" size={16} color="#F06292" />
                            <Text style={styles.contextMenuDeleteText}>Delete campus</Text>
                          </>
                        )}
                      </Pressable>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>

      {isAdmin && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Campus Management</Text>
          <View style={styles.formBlock}>
            <Text style={styles.fieldLabel}>Create Campus At Current Location</Text>
            <TextInput
              style={styles.input}
              value={newCampusName}
              onChangeText={setNewCampusName}
              placeholder="New campus name"
              placeholderTextColor="#404050"
              accessibilityLabel="New campus name"
            />
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.rowPressed,
                isCreatingCampus && styles.buttonDisabled,
              ]}
              onPress={() => void handleCreateCampus()}
              disabled={isCreatingCampus}
              accessibilityRole="button"
              accessibilityLabel="Create campus using current location"
            >
              {isCreatingCampus ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>Create Campus</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      )}

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
    overflow: 'visible',
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
  formBlock: {
    padding: 14,
    gap: 12,
  },
  fieldLabel: {
    color: '#A0A0B8',
    fontSize: 13,
    fontWeight: '600',
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
  },
  primaryButton: {
    backgroundColor: '#1A5F7A',
    borderRadius: 10,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  campusListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#0D0D12',
  },
  campusListRowMenuOpen: {
    zIndex: 20,
    elevation: 20,
  },
  campusRowButton: {
    flex: 1,
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  activeIndicator: {
    width: 3,
    height: 28,
    borderRadius: 999,
    backgroundColor: 'transparent',
  },
  campusTextBlock: {
    flex: 1,
    gap: 2,
  },
  campusNameText: {
    color: '#F0F0F5',
    fontSize: 14,
  },
  campusMetaText: {
    color: '#606070',
    fontSize: 12,
  },
  menuWrapper: {
    position: 'relative',
    zIndex: 30,
    elevation: 30,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D0D12',
  },
  contextMenu: {
    position: 'absolute',
    top: 40,
    right: 0,
    minWidth: 148,
    backgroundColor: '#181820',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2A34',
    padding: 6,
    zIndex: 40,
    elevation: 40,
  },
  contextMenuItem: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  contextMenuDeleteText: {
    color: '#F06292',
    fontSize: 13,
    fontWeight: '600',
  },
  version: { color: '#1A5F7A', fontSize: 12, textAlign: 'center', marginTop: 'auto' },
});
