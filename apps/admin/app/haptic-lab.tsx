/**
 * Haptic Lab — ALP-974 test harness.
 *
 * Tests all four encoding schemes with adjustable parameters, per-trial logging,
 * JSON/CSV export, and the ALP-976 STT conflict latency test.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  HAPTIC_SCHEMES,
  S4_INTERVALS,
  S4_FAR,
  S4_MEDIUM,
  S4_CLOSE,
  S4_IMMINENT,
  type HapticTimingPattern,
  type SchemeDefinition,
  type SchemeCueName,
  type S4ProximityState,
} from '@echoecho/shared';
import * as player from '../src/services/hapticPatternPlayer';
import { useLowPowerMode } from '../src/hooks/useLowPowerMode';
import { useTrialLog } from '../src/hooks/useTrialLog';

// ─────────────────────────────────────────────────────────────────────────────
// Pattern scaling
// ─────────────────────────────────────────────────────────────────────────────

function scalePattern(
  pattern: HapticTimingPattern,
  durationScale: number,
  pauseScale: number,
): HapticTimingPattern {
  const result: HapticTimingPattern = [];
  let cursor = 0;
  for (const event of pattern) {
    const raw = event.endTime - event.startTime;
    const scaled = Math.round(raw * (event.isPause ? pauseScale : durationScale));
    result.push({ startTime: cursor, endTime: cursor + scaled, isPause: event.isPause });
    cursor += scaled;
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type IntensityOverride = 'auto' | 'light' | 'medium' | 'heavy';

// Maps intensity override label to the duration used to trigger durationToImpactStyle in the player.
// The player buckets: ≤120=Light, ≤300=Medium, >300=Heavy.
const INTENSITY_DURATION: Record<IntensityOverride, number> = {
  auto: 0, // not used directly
  light: 80,
  medium: 200,
  heavy: 400,
};

function applyIntensityOverride(
  pattern: HapticTimingPattern,
  override: IntensityOverride,
): HapticTimingPattern {
  if (override === 'auto') return pattern;
  const targetDuration = INTENSITY_DURATION[override];
  return pattern.map((e) =>
    e.isPause ? e : { ...e, endTime: e.startTime + targetDuration },
  );
}

const S4_PROXIMITY_STATES: { state: S4ProximityState; pattern: HapticTimingPattern; label: string }[] = [
  { state: 'FAR',      pattern: S4_FAR,      label: 'Far (2000ms)' },
  { state: 'MEDIUM',   pattern: S4_MEDIUM,   label: 'Medium (1000ms)' },
  { state: 'CLOSE',    pattern: S4_CLOSE,    label: 'Close (500ms)' },
  { state: 'IMMINENT', pattern: S4_IMMINENT, label: 'Imminent (300ms)' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

// Step control replaces Slider — no external dependency, more precise for a research tool.
const SCALE_STEPS = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.5, 2.0];

function ScaleControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const idx = SCALE_STEPS.indexOf(value);
  const dec = () => idx > 0 && onChange(SCALE_STEPS[idx - 1]);
  const inc = () => idx < SCALE_STEPS.length - 1 && onChange(SCALE_STEPS[idx + 1]);

  return (
    <View style={scaleStyles.row}>
      <Text style={scaleStyles.label}>{label}</Text>
      <View style={scaleStyles.controls}>
        <Pressable
          style={({ pressed }) => [scaleStyles.btn, pressed && { opacity: 0.6 }]}
          onPress={dec}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
        >
          <Text style={scaleStyles.btnText}>−</Text>
        </Pressable>
        <Text
          style={scaleStyles.value}
          accessibilityLabel={`${label} ${value.toFixed(1)} times`}
        >
          {value.toFixed(1)}×
        </Text>
        <Pressable
          style={({ pressed }) => [scaleStyles.btn, pressed && { opacity: 0.6 }]}
          onPress={inc}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
        >
          <Text style={scaleStyles.btnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const scaleStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  label: { color: '#b0b0d0', fontSize: 13, fontWeight: '600', flex: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#6c63ff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e1a3e',
  },
  btnText: { color: '#a78bfa', fontSize: 20, fontWeight: '700', lineHeight: 24 },
  value: { color: '#e8e8f0', fontWeight: '700', fontSize: 16, minWidth: 40, textAlign: 'center' },
});

function LowPowerBanner() {
  const lowPower = useLowPowerMode();
  if (!lowPower) return null;
  return (
    <View style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      <Ionicons name="warning-outline" size={18} color="#1a1a00" />
      <Text style={styles.bannerText}>
        Low Power Mode is ON — iOS Taptic Engine is silenced. Results will be null. Disable Low Power Mode before testing.
      </Text>
    </View>
  );
}

function SchemeTab({
  scheme,
  active,
  onPress,
}: {
  scheme: SchemeDefinition;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.schemeTab, active && styles.schemeTabActive]}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`Scheme ${scheme.id}: ${scheme.name}`}
    >
      <Text style={[styles.schemeTabId, active && styles.schemeTabIdActive]}>
        S{scheme.id}
      </Text>
      <Text style={[styles.schemeTabName, active && styles.schemeTabNameActive]}>
        {scheme.name}
      </Text>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────

export default function HapticLabScreen() {
  const [schemeIndex, setSchemeIndex] = useState(0);
  const [durationScale, setDurationScale] = useState(1.0);
  const [pauseScale, setPauseScale] = useState(1.0);
  const [intensityOverride, setIntensityOverride] = useState<IntensityOverride>('auto');
  const [activeS4State, setActiveS4State] = useState<S4ProximityState | null>(null);

  // ALP-976: STT conflict test
  const [sttActive, setSttActive] = useState(false);
  const [sttTrialCount, setSttTrialCount] = useState(0);
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  const latencyTrials = useRef<number[]>([]);

  // Trial logging
  const { trials, addTrial, clearTrials, exportJSON, exportCSV } = useTrialLog();
  const [pendingCue, setPendingCue] = useState<{ schemeId: 1 | 2 | 3 | 4; cueName: string } | null>(null);
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [trialNotes, setTrialNotes] = useState('');

  const scheme = HAPTIC_SCHEMES[schemeIndex];

  // Register latency callback for ALP-976
  useEffect(() => {
    player.setLatencyCallback((ms) => {
      setLastLatencyMs(ms);
      latencyTrials.current.push(ms);
      setSttTrialCount((n) => n + 1);
    });
    return () => player.setLatencyCallback(null);
  }, []);

  // Stop proximity loop when scheme changes away from S4
  useEffect(() => {
    if (scheme.id !== 4) {
      player.stopProximityLoop();
      setActiveS4State(null);
    }
  }, [scheme.id]);

  const fireScaled = useCallback(
    (pattern: HapticTimingPattern, cueName: string) => {
      let p = scalePattern(pattern, durationScale, pauseScale);
      if (Platform.OS === 'ios' && intensityOverride !== 'auto') {
        p = applyIntensityOverride(p, intensityOverride);
      }
      player.playPattern(p);
      setPendingCue({ schemeId: scheme.id as 1 | 2 | 3 | 4, cueName });
    },
    [durationScale, pauseScale, intensityOverride, scheme.id],
  );

  const fireS4Proximity = useCallback(
    (state: S4ProximityState, pattern: HapticTimingPattern) => {
      let p = scalePattern(pattern, durationScale, pauseScale);
      if (Platform.OS === 'ios' && intensityOverride !== 'auto') {
        p = applyIntensityOverride(p, intensityOverride);
      }
      const intervalMs = S4_INTERVALS[state];
      player.startProximityLoop(p, intervalMs);
      setActiveS4State(state);
      setPendingCue({ schemeId: 4, cueName: `S4_${state}` });
    },
    [durationScale, pauseScale, intensityOverride],
  );

  const stopAll = useCallback(() => {
    player.stopProximityLoop();
    player.stopCurrent();
    setActiveS4State(null);
  }, []);

  const toggleSTT = useCallback(() => {
    const next = !sttActive;
    setSttActive(next);
    player.setSTTActive(next);
  }, [sttActive]);

  const fireWhileSTTActive = useCallback(() => {
    if (!sttActive) {
      Alert.alert('STT not active', 'Activate STT first, then fire a pattern to queue it.');
      return;
    }
    const cues = Object.entries(scheme.cues);
    if (cues.length === 0) return;
    const [cueName, pattern] = cues[0];
    if (!pattern) return;
    const p = scalePattern(pattern, durationScale, pauseScale);
    player.playPattern(p); // queued behind STT mutex
    setPendingCue({ schemeId: scheme.id as 1 | 2 | 3 | 4, cueName });
    Alert.alert('Pattern queued', `"${cueName}" is queued. Deactivate STT to release it and measure latency.`);
  }, [sttActive, scheme, durationScale, pauseScale]);

  const logTrial = useCallback(() => {
    if (!pendingCue) {
      Alert.alert('Nothing to log', 'Fire a pattern first, then log your rating.');
      return;
    }
    addTrial({
      schemeId: pendingCue.schemeId,
      cueName: pendingCue.cueName,
      durationScale,
      pauseScale,
      intensityOverride: intensityOverride === 'auto' ? null : intensityOverride,
      rating,
      notes: trialNotes,
    });
    setPendingCue(null);
    setTrialNotes('');
    Alert.alert('Trial logged', `${trials.length + 1} trial(s) in session.`);
  }, [pendingCue, durationScale, pauseScale, intensityOverride, rating, trialNotes, addTrial, trials.length]);

  const clearLatency = useCallback(() => {
    latencyTrials.current = [];
    setSttTrialCount(0);
    setLastLatencyMs(null);
  }, []);

  const latencyStats = (() => {
    const arr = latencyTrials.current;
    if (arr.length === 0) return null;
    const sum = arr.reduce((a, b) => a + b, 0);
    const mean = Math.round(sum / arr.length);
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    const reliability = Math.round((arr.length / Math.max(sttTrialCount, arr.length)) * 100);
    return { mean, min, max, count: arr.length, reliability };
  })();

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Low Power Mode warning (iOS only) */}
        <LowPowerBanner />

        {/* ── Scheme selector ── */}
        <Text style={styles.sectionLabel}>SCHEME</Text>
        <View style={styles.schemeTabs} accessibilityRole="tablist">
          {HAPTIC_SCHEMES.map((s, i) => (
            <SchemeTab
              key={s.id}
              scheme={s}
              active={schemeIndex === i}
              onPress={() => setSchemeIndex(i)}
            />
          ))}
        </View>
        <Text style={styles.schemeDesc}>{scheme.description}</Text>

        {/* ── Pattern triggers ── */}
        <Text style={styles.sectionLabel}>FIRE PATTERN</Text>
        {scheme.id !== 4 ? (
          <View style={styles.cueGrid}>
            {(Object.entries(scheme.cues) as [SchemeCueName, HapticTimingPattern][]).map(([cue, pattern]) => (
              <Pressable
                key={cue}
                style={({ pressed }) => [
                  styles.cueButton,
                  pendingCue?.cueName === cue && styles.cueButtonPending,
                  pressed && styles.cueButtonPressed,
                ]}
                onPress={() => fireScaled(pattern, cue)}
                accessibilityRole="button"
                accessibilityLabel={`Fire ${cue} pattern`}
              >
                <Text style={styles.cueLabel}>{cue}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          /* Scheme 4 proximity controls */
          <>
            <View style={styles.cueGrid}>
              {S4_PROXIMITY_STATES.map(({ state, pattern, label }) => (
                <Pressable
                  key={state}
                  style={({ pressed }) => [
                    styles.cueButton,
                    activeS4State === state && styles.cueButtonActive,
                    pressed && styles.cueButtonPressed,
                  ]}
                  onPress={() => fireS4Proximity(state, pattern)}
                  accessibilityRole="button"
                  accessibilityLabel={`Start ${label} proximity loop`}
                  accessibilityState={{ selected: activeS4State === state }}
                >
                  <Text style={styles.cueLabel}>{label}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={({ pressed }) => [styles.stopButton, pressed && { opacity: 0.7 }]}
              onPress={stopAll}
              accessibilityRole="button"
              accessibilityLabel="Stop proximity loop"
            >
              <Ionicons name="stop-circle-outline" size={18} color="#ff6b6b" />
              <Text style={styles.stopButtonText}>Stop Loop</Text>
            </Pressable>
            <Text style={styles.hint}>
              Scheme 4 fires direction cue once at segment start, then loops by proximity state.
              Experimenter triggers states manually — no live GPS needed for the study.
            </Text>
          </>
        )}

        {/* ── Parameter controls ── */}
        <Text style={styles.sectionLabel}>PARAMETERS</Text>
        <View style={styles.paramSection}>
          <ScaleControl
            label="Duration Scale"
            value={durationScale}
            onChange={setDurationScale}
          />
          <ScaleControl
            label="Pause Scale"
            value={pauseScale}
            onChange={setPauseScale}
          />

          {Platform.OS === 'ios' && (
            <>
              <Text style={styles.paramLabel}>Intensity Override (iOS)</Text>
              <View style={styles.intensityRow}>
                {(['auto', 'light', 'medium', 'heavy'] as IntensityOverride[]).map((v) => (
                  <Pressable
                    key={v}
                    style={[styles.intensityChip, intensityOverride === v && styles.intensityChipActive]}
                    onPress={() => setIntensityOverride(v)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: intensityOverride === v }}
                    accessibilityLabel={v}
                  >
                    <Text
                      style={[styles.intensityChipText, intensityOverride === v && styles.intensityChipTextActive]}
                    >
                      {v.charAt(0).toUpperCase() + v.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.hint}>
                Auto uses vibration duration to select Light/Medium/Heavy. Override forces a specific style.
              </Text>
            </>
          )}
        </View>

        {/* ── ALP-976: STT Conflict test ── */}
        <Text style={styles.sectionLabel}>ALP-976 — STT CONFLICT TEST</Text>
        <View style={styles.sttSection}>
          <Text style={styles.hint}>
            Measures pause-to-haptic latency via the STT mutex. Activate STT, fire a pattern (queues it),
            then deactivate STT to release. Latency is recorded automatically.
            Run 20 consecutive trials to measure 95% reliability threshold.
          </Text>

          <View style={styles.sttControls}>
            <Pressable
              style={[styles.sttButton, sttActive && styles.sttButtonActive]}
              onPress={toggleSTT}
              accessibilityRole="button"
              accessibilityLabel={sttActive ? 'STT active — tap to deactivate' : 'STT inactive — tap to activate'}
              accessibilityState={{ checked: sttActive }}
            >
              <Ionicons
                name={sttActive ? 'mic' : 'mic-off'}
                size={18}
                color={sttActive ? '#1a1a00' : '#e8e8f0'}
              />
              <Text style={[styles.sttButtonText, sttActive && styles.sttButtonTextActive]}>
                {sttActive ? 'STT Active (tap to deactivate)' : 'STT Inactive (tap to activate)'}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.queueButton, pressed && { opacity: 0.7 }]}
              onPress={fireWhileSTTActive}
              accessibilityRole="button"
              accessibilityLabel="Queue pattern behind STT mutex"
            >
              <Ionicons name="layers-outline" size={16} color="#6c63ff" />
              <Text style={styles.queueButtonText}>Queue Pattern</Text>
            </Pressable>
          </View>

          {/* Latency readout */}
          <View style={styles.latencyBox}>
            <Text style={styles.latencyTitle}>Latency Results ({sttTrialCount} / 20 trials)</Text>
            {lastLatencyMs !== null && (
              <Text style={styles.latencyLast}>Last: {lastLatencyMs} ms</Text>
            )}
            {latencyStats && (
              <View style={styles.latencyStats}>
                <Text style={styles.latencyStat}>Mean: {latencyStats.mean} ms</Text>
                <Text style={styles.latencyStat}>Min: {latencyStats.min} ms</Text>
                <Text style={styles.latencyStat}>Max: {latencyStats.max} ms</Text>
                <Text style={[styles.latencyStat, latencyStats.reliability >= 95 && styles.latencyPass]}>
                  Reliability: {latencyStats.reliability}%{' '}
                  {latencyStats.reliability >= 95 ? '✓ PASS' : '✗ below 95% threshold'}
                </Text>
              </View>
            )}
            <Pressable
              style={({ pressed }) => [styles.clearButton, pressed && { opacity: 0.7 }]}
              onPress={clearLatency}
              accessibilityRole="button"
            >
              <Text style={styles.clearButtonText}>Reset Latency Data</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Trial logging ── */}
        <Text style={styles.sectionLabel}>LOG TRIAL ({trials.length} logged)</Text>
        <View style={styles.trialSection}>
          {pendingCue ? (
            <Text style={styles.pendingCue}>
              Pending: S{pendingCue.schemeId} / {pendingCue.cueName}
            </Text>
          ) : (
            <Text style={styles.hint}>Fire a pattern above, then rate and log.</Text>
          )}

          <Text style={styles.paramLabel}>Tester Rating</Text>
          <View style={styles.ratingRow}>
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <Pressable
                key={n}
                style={[styles.ratingChip, rating === n && styles.ratingChipActive]}
                onPress={() => setRating(n)}
                accessibilityRole="radio"
                accessibilityState={{ checked: rating === n }}
                accessibilityLabel={`Rating ${n} out of 5`}
              >
                <Text style={[styles.ratingChipText, rating === n && styles.ratingChipTextActive]}>
                  {n}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            style={styles.notesInput}
            placeholder="Optional notes..."
            placeholderTextColor="#5555aa"
            value={trialNotes}
            onChangeText={setTrialNotes}
            multiline
            accessibilityLabel="Trial notes"
          />

          <Pressable
            style={({ pressed }) => [styles.logButton, pressed && { opacity: 0.8 }, !pendingCue && styles.logButtonDisabled]}
            onPress={logTrial}
            disabled={!pendingCue}
            accessibilityRole="button"
            accessibilityLabel="Log trial"
          >
            <Ionicons name="save-outline" size={16} color={pendingCue ? '#fff' : '#8888aa'} />
            <Text style={[styles.logButtonText, !pendingCue && styles.logButtonTextDisabled]}>
              Log Trial
            </Text>
          </Pressable>

          {trials.length > 0 && (
            <Pressable
              style={({ pressed }) => [styles.clearButton, { marginTop: 8 }, pressed && { opacity: 0.7 }]}
              onPress={() => {
                Alert.alert('Clear trials', 'Remove all logged trials from this session?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Clear', style: 'destructive', onPress: clearTrials },
                ]);
              }}
              accessibilityRole="button"
            >
              <Text style={styles.clearButtonText}>Clear Session Trials</Text>
            </Pressable>
          )}
        </View>

        {/* ── Export ── */}
        <Text style={styles.sectionLabel}>EXPORT</Text>
        <View style={styles.exportRow}>
          <Pressable
            style={({ pressed }) => [styles.exportButton, pressed && { opacity: 0.7 }]}
            onPress={exportJSON}
            accessibilityRole="button"
            accessibilityLabel="Export as JSON"
          >
            <Ionicons name="code-download-outline" size={16} color="#6c63ff" />
            <Text style={styles.exportButtonText}>JSON</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.exportButton, pressed && { opacity: 0.7 }]}
            onPress={exportCSV}
            accessibilityRole="button"
            accessibilityLabel="Export as CSV"
          >
            <Ionicons name="grid-outline" size={16} color="#6c63ff" />
            <Text style={styles.exportButtonText}>CSV</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>
          Export includes: timestamp, device model, OS version, scheme ID, cue name, scales, intensity, rating, notes.
          Compatible with ALP-975 study data format.
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0f0f1a' },
  scroll: { padding: 16 },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffe066',
    borderRadius: 10,
    padding: 12,
    gap: 10,
    marginBottom: 16,
  },
  bannerText: { color: '#1a1a00', flex: 1, fontSize: 13, fontWeight: '600' },

  sectionLabel: {
    color: '#8888aa',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginTop: 20,
    marginBottom: 8,
  },

  schemeTabs: {
    flexDirection: 'row',
    gap: 8,
  },
  schemeTab: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    alignItems: 'center',
    padding: 10,
  },
  schemeTabActive: {
    borderColor: '#6c63ff',
    backgroundColor: '#1e1a3e',
  },
  schemeTabId: { color: '#6666aa', fontSize: 16, fontWeight: '800' },
  schemeTabIdActive: { color: '#a78bfa' },
  schemeTabName: { color: '#5555aa', fontSize: 10, marginTop: 2 },
  schemeTabNameActive: { color: '#c4b5fd' },
  schemeDesc: { color: '#6666aa', fontSize: 12, marginTop: 6, marginBottom: 4 },

  cueGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  cueButton: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3a3a5e',
    paddingVertical: 16,
    paddingHorizontal: 18,
    minWidth: 90,
    alignItems: 'center',
  },
  cueButtonPending: {
    borderColor: '#6c63ff',
    backgroundColor: '#1e1a3e',
  },
  cueButtonActive: {
    borderColor: '#00d4aa',
    backgroundColor: '#0a2a20',
  },
  cueButtonPressed: { opacity: 0.6 },
  cueLabel: { color: '#e8e8f0', fontSize: 14, fontWeight: '700' },

  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2a1a1a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ff6b6b',
    padding: 12,
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  stopButtonText: { color: '#ff6b6b', fontWeight: '600' },

  paramSection: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    padding: 14,
    gap: 8,
  },
  paramLabel: { color: '#b0b0d0', fontSize: 13, fontWeight: '600' },

  intensityRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  intensityChip: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a3a5e',
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  intensityChipActive: { borderColor: '#6c63ff', backgroundColor: '#1e1a3e' },
  intensityChipText: { color: '#8888aa', fontSize: 13 },
  intensityChipTextActive: { color: '#a78bfa', fontWeight: '700' },

  hint: { color: '#5555aa', fontSize: 11, lineHeight: 16, marginTop: 4 },

  sttSection: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    padding: 14,
    gap: 12,
  },
  sttControls: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  sttButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3a3a5e',
    padding: 12,
    flex: 1,
  },
  sttButtonActive: {
    backgroundColor: '#ffe066',
    borderColor: '#ffe066',
  },
  sttButtonText: { color: '#e8e8f0', fontSize: 13, flex: 1 },
  sttButtonTextActive: { color: '#1a1a00', fontWeight: '700' },
  queueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1e1a3e',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#6c63ff',
    padding: 12,
  },
  queueButtonText: { color: '#a78bfa', fontWeight: '600', fontSize: 13 },

  latencyBox: {
    backgroundColor: '#0f1a20',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a3a3e',
    padding: 12,
    gap: 6,
  },
  latencyTitle: { color: '#a0c0d0', fontWeight: '700', fontSize: 13 },
  latencyLast: { color: '#e8e8f0', fontSize: 22, fontWeight: '800' },
  latencyStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  latencyStat: { color: '#a0c0d0', fontSize: 12 },
  latencyPass: { color: '#00d4aa', fontWeight: '700' },

  trialSection: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    padding: 14,
    gap: 10,
  },
  pendingCue: {
    color: '#c4b5fd',
    fontWeight: '700',
    fontSize: 14,
  },
  ratingRow: { flexDirection: 'row', gap: 8 },
  ratingChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#3a3a5e',
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingChipActive: { borderColor: '#6c63ff', backgroundColor: '#1e1a3e' },
  ratingChipText: { color: '#6666aa', fontWeight: '700', fontSize: 16 },
  ratingChipTextActive: { color: '#a78bfa' },
  notesInput: {
    backgroundColor: '#0f0f20',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a3a5e',
    color: '#e8e8f0',
    padding: 10,
    fontSize: 13,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  logButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#6c63ff',
    borderRadius: 10,
    padding: 14,
  },
  logButtonDisabled: { backgroundColor: '#2a2a3e' },
  logButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  logButtonTextDisabled: { color: '#8888aa' },

  clearButton: {
    alignItems: 'center',
    padding: 8,
  },
  clearButtonText: { color: '#6666aa', fontSize: 12 },

  exportRow: {
    flexDirection: 'row',
    gap: 12,
  },
  exportButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#6c63ff',
    padding: 14,
  },
  exportButtonText: { color: '#a78bfa', fontWeight: '700', fontSize: 14 },
});
