/**
 * Buildings tab — manage campus buildings.
 * ALP-966: Full building management (ALP-990 sprint)
 */
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function BuildingsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.centered}>
        <Ionicons name="business-outline" size={64} color="#2a2a3e" />
        <Text style={styles.title}>Buildings</Text>
        <Text style={styles.body}>
          Building management is implemented in the ALP-966 issue.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24 },
  title: { color: '#8888aa', fontSize: 20, fontWeight: '700' },
  body: { color: '#5555aa', fontSize: 14, textAlign: 'center' },
});
