/**
 * Trial log for the ALP-974 haptic test harness.
 *
 * Captures: timestamp, device model, OS version, platform, scheme ID, cue name,
 * duration scale, pause scale, intensity override, and tester rating.
 * Exports to JSON or CSV via React Native's Share sheet.
 */
import { useState, useCallback } from 'react';
import { Platform, Alert, Share } from 'react-native';

export interface HarnessTrial {
  id: string;
  timestamp: string;
  platform: 'ios' | 'android';
  deviceModel: string;
  osVersion: string;
  schemeId: 1 | 2 | 3 | 4;
  cueName: string;
  durationScale: number;
  pauseScale: number;
  intensityOverride: string | null;
  rating: 1 | 2 | 3 | 4 | 5;
  notes: string;
}

function getDeviceInfo(): { deviceModel: string; osVersion: string } {
  // Platform.constants is typed differently per platform; cast through unknown.
  const c = Platform.constants as unknown as Record<string, string | number>;
  if (Platform.OS === 'ios') {
    return {
      deviceModel: `${c.systemName ?? 'iOS'} ${c.Model ?? 'Unknown'}`,
      osVersion: String(Platform.Version),
    };
  }
  return {
    deviceModel: `${c.Manufacturer ?? ''} ${c.Model ?? 'Unknown'}`.trim(),
    osVersion: `Android ${Platform.Version}`,
  };
}

function trialToCSVRow(t: HarnessTrial): string {
  const fields: Array<string | number | null> = [
    t.id, t.timestamp, t.platform, t.deviceModel, t.osVersion,
    t.schemeId, t.cueName, t.durationScale, t.pauseScale,
    t.intensityOverride, t.rating, t.notes,
  ];
  return fields
    .map((v) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    })
    .join(',');
}

const CSV_HEADERS = [
  'id', 'timestamp', 'platform', 'deviceModel', 'osVersion',
  'schemeId', 'cueName', 'durationScale', 'pauseScale',
  'intensityOverride', 'rating', 'notes',
].join(',');

export function useTrialLog() {
  const [trials, setTrials] = useState<HarnessTrial[]>([]);

  const addTrial = useCallback(
    (
      params: Pick<
        HarnessTrial,
        'schemeId' | 'cueName' | 'durationScale' | 'pauseScale' | 'intensityOverride' | 'rating' | 'notes'
      >,
    ) => {
      const { deviceModel, osVersion } = getDeviceInfo();
      const trial: HarnessTrial = {
        id: Math.random().toString(36).slice(2, 10),
        timestamp: new Date().toISOString(),
        platform: Platform.OS as 'ios' | 'android',
        deviceModel,
        osVersion,
        ...params,
      };
      setTrials((prev) => [...prev, trial]);
      return trial;
    },
    [],
  );

  const clearTrials = useCallback(() => setTrials([]), []);

  const exportJSON = useCallback(async () => {
    if (trials.length === 0) {
      Alert.alert('No trials', 'Log at least one trial before exporting.');
      return;
    }
    await Share.share({
      title: 'Haptic Trial Data (JSON)',
      message: JSON.stringify(trials, null, 2),
    });
  }, [trials]);

  const exportCSV = useCallback(async () => {
    if (trials.length === 0) {
      Alert.alert('No trials', 'Log at least one trial before exporting.');
      return;
    }
    const rows = [CSV_HEADERS, ...trials.map(trialToCSVRow)].join('\n');
    await Share.share({
      title: 'Haptic Trial Data (CSV)',
      message: rows,
    });
  }, [trials]);

  return { trials, addTrial, clearTrials, exportJSON, exportCSV };
}
