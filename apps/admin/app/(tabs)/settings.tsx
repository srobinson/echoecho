/**
 * Settings tab — campus selector, user account, app configuration.
 */
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCampusStore } from '../../src/stores/campusStore';

export default function SettingsScreen() {
  const { activeCampus } = useCampusStore();

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Active Campus</Text>
        <View style={styles.row}>
          <Ionicons name="school-outline" size={20} color="#6c63ff" />
          <Text style={styles.rowText}>
            {activeCampus?.name ?? 'No campus selected'}
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#8888aa" />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => Alert.alert('Sign out', 'Sign out will be implemented with ALP-945 auth flow.')}
          accessibilityRole="button"
        >
          <Ionicons name="log-out-outline" size={20} color="#e53e3e" />
          <Text style={[styles.rowText, { color: '#e53e3e' }]}>Sign Out</Text>
        </Pressable>
      </View>

      <Text style={styles.version}>EchoEcho Admin v0.1.0</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a', padding: 16 },
  section: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    marginBottom: 16,
    overflow: 'hidden',
  },
  sectionTitle: {
    color: '#8888aa',
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
  rowText: { color: '#e8e8f0', flex: 1, fontSize: 15 },
  version: { color: '#4444aa', fontSize: 12, textAlign: 'center', marginTop: 'auto' },
});
