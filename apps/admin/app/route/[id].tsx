/**
 * Route detail screen — ALP-968 (Admin Panel sprint).
 * Placeholder until ALP-990 sprint implements the full view.
 */
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RouteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.center}>
        <Text style={styles.text}>Route {id}</Text>
        <Text style={styles.sub}>Full detail view coming in ALP-968.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  text: { color: '#e8e8f0', fontSize: 18, fontWeight: '700' },
  sub:  { color: '#8888aa', fontSize: 14 },
});
