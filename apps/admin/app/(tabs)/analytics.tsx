import { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCampusStore } from '../../src/stores/campusStore';
import { useAnalytics } from '../../src/hooks/useAnalytics';
import { RouteUsageChart } from '../../src/components/analytics/RouteUsageChart';
import { TimeOfDayChart } from '../../src/components/analytics/TimeOfDayChart';
import { CompletionRateList } from '../../src/components/analytics/CompletionRateList';
import { CoverageCard } from '../../src/components/analytics/CoverageCard';
import { TopDestinationsCard } from '../../src/components/analytics/TopDestinationsCard';
import { OffRouteHeatmap } from '../../src/components/analytics/OffRouteHeatmap';
import { tabColors } from '@echoecho/ui';
import { SectionColorProvider, useSectionColor } from '../../src/contexts/SectionColorContext';

const TSBVI_CENTER: [number, number] = [-97.7468, 30.3495];

export default function AnalyticsDashboardScreen() {
  return (
    <SectionColorProvider value={tabColors.analytics}>
      <AnalyticsDashboardScreenInner />
    </SectionColorProvider>
  );
}

function AnalyticsDashboardScreenInner() {
  const accent = useSectionColor();
  const { activeCampus } = useCampusStore();
  const campusId = activeCampus?.id ?? null;

  const {
    routeUsage,
    timeOfDay,
    offRoutePoints,
    topDestinations,
    coverage,
    completionRates,
    isLoading,
    isRefreshing,
    error,
    refresh,
  } = useAnalytics(campusId);

  const center: [number, number] = activeCampus?.center
    ? [activeCampus.center.longitude, activeCampus.center.latitude]
    : TSBVI_CENTER;

  const handleRefresh = useCallback(() => {
    void refresh();
  }, [refresh]);

  if (!activeCampus) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centered} accessibilityRole="alert">
          <Text style={styles.emptyTitle}>No campus selected</Text>
          <Text style={styles.emptyBody}>
            Select a campus in Settings to view analytics.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centered} accessibilityLiveRegion="polite">
          <ActivityIndicator size="large" color={accent} accessibilityLabel="Loading analytics" />
          <Text style={styles.loadingText}>Loading analytics...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centered} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={40} color="#F06292" />
          <Text style={styles.emptyTitle}>Failed to load analytics</Text>
          <Text style={styles.emptyBody}>{error}</Text>
          <Pressable
            onPress={handleRefresh}
            style={[styles.retryButton, { backgroundColor: accent }]}
            accessibilityLabel="Retry loading analytics"
            accessibilityRole="button"
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={accent}
            colors={[accent]}
          />
        }
      >
        <CoverageCard data={coverage} />
        <RouteUsageChart data={routeUsage} />
        <TimeOfDayChart data={timeOfDay} />
        <CompletionRateList data={completionRates} />
        <TopDestinationsCard data={topDestinations} />
        <OffRouteHeatmap data={offRoutePoints} center={center} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24 },
  scrollContent: { padding: 16, gap: 16, paddingBottom: 32 },
  emptyTitle: { color: '#606070', fontSize: 20, fontWeight: '700' },
  emptyBody: { color: '#404050', fontSize: 14, textAlign: 'center', maxWidth: 280 },
  loadingText: { color: '#606070', fontSize: 14, marginTop: 12 },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: 'transparent', // overridden inline with accent
    borderRadius: 8,
  },
  retryButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
