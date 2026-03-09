/**
 * ALP-950: Bottom sheet for voice annotation at waypoints.
 *
 * Flow:
 *   1. Idle  → user taps mic button → startRecording()
 *   2. Recording → user taps stop (or 60s auto-stop) → moves to preview
 *   3. Preview   → user: Save | Re-record | Discard
 *   4. Save  → confirm(waypointLocalId) → onSave(transcript, audioUri, key) → sheet closes
 *
 * Accessibility: mic button labelled; recording state changes announced via
 * AccessibilityInfo.announceForAccessibility.
 */
import React, { useCallback, forwardRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';

import { useVoiceAnnotation } from '../hooks/useVoiceAnnotation';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VoiceAnnotationSheetProps {
  waypointLocalId: string;
  onSave: (params: {
    transcript: string;
    audioUri: string | null;
    uploadedKey: string | null;
  }) => void;
  onDismiss: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const VoiceAnnotationSheet = forwardRef<BottomSheet, VoiceAnnotationSheetProps>(
  ({ waypointLocalId, onSave, onDismiss }, ref) => {
    const {
      state,
      startRecording,
      stopRecording,
      dismissSilencePrompt,
      confirm,
      discard,
      reRecord,
      openMicSettings,
    } = useVoiceAnnotation();

    const handleSave = useCallback(async () => {
      const result = await confirm(waypointLocalId);
      if (result) {
        onSave(result);
      }
    }, [confirm, waypointLocalId, onSave]);

    const handleDiscard = useCallback(() => {
      Alert.alert('Discard annotation?', 'Your recording will be lost.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            discard();
            onDismiss();
          },
        },
      ]);
    }, [discard, onDismiss]);

    const handlePermissionError = useCallback(() => {
      Alert.alert(
        'Microphone access required',
        'Go to Settings and allow microphone access for EchoEcho Admin.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: openMicSettings },
        ],
      );
    }, [openMicSettings]);

    return (
      <BottomSheet
        ref={ref}
        snapPoints={['40%', '60%']}
        enablePanDownToClose
        onClose={onDismiss}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.handleIndicator}
      >
        <BottomSheetView style={styles.container}>
          <Text style={styles.title} accessibilityRole="header">Voice Annotation</Text>

          {/* Silence prompt */}
          {state.showSilencePrompt && (
            <View style={styles.warningBanner}>
              <Text style={styles.warningText}>No audio detected. Speak closer to the mic.</Text>
              <Pressable
                onPress={dismissSilencePrompt}
                accessibilityLabel="Dismiss warning"
                accessibilityRole="button"
                hitSlop={16}
                style={styles.dismissBtn}
              >
                <Ionicons name="close" size={16} color="#fff" />
              </Pressable>
            </View>
          )}

          {/* Error state */}
          {state.phase === 'error' && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={32} color="#e53e3e" />
              <Text style={styles.errorText}>{state.errorMessage}</Text>
              {state.errorMessage?.includes('permission') ? (
                <ActionButton label="Open Settings" onPress={handlePermissionError} color="#6c63ff" />
              ) : (
                <ActionButton label="Try Again" onPress={() => void startRecording()} color="#6c63ff" />
              )}
            </View>
          )}

          {/* Idle */}
          {state.phase === 'idle' && (
            <View style={styles.centeredContent}>
              <Pressable
                style={styles.micButton}
                onPress={() => void startRecording()}
                accessibilityLabel="Record voice annotation"
                accessibilityRole="button"
              >
                <Ionicons name="mic" size={40} color="#fff" />
              </Pressable>
              <Text style={styles.hint}>Tap to start recording</Text>
            </View>
          )}

          {/* Recording */}
          {state.phase === 'recording' && (
            <View style={styles.centeredContent}>
              <Pressable
                style={[styles.micButton, styles.micButtonActive]}
                onPress={() => void stopRecording()}
                accessibilityLabel="Stop recording"
                accessibilityRole="button"
              >
                <Ionicons name="stop" size={40} color="#fff" />
              </Pressable>

              {state.isTimeLimitReached ? (
                <Text style={styles.limitText}>60s limit reached</Text>
              ) : (
                <Text style={styles.hint}>Recording... tap to stop</Text>
              )}

              {state.transcript.length > 0 && (
                <View style={styles.transcriptBox}>
                  <Text style={styles.transcriptText}>{state.transcript}</Text>
                </View>
              )}
            </View>
          )}

          {/* Preview */}
          {state.phase === 'preview' && (
            <View style={styles.previewContainer}>
              <Text style={styles.previewLabel}>Review your annotation</Text>

              <View style={styles.transcriptBox}>
                <Text style={styles.transcriptText}>
                  {state.transcript || '(No transcript — audio recorded)'}
                </Text>
              </View>

              <View style={styles.actionRow}>
                <ActionButton label="Re-record" onPress={reRecord} color="#718096" />
                <ActionButton label="Discard" onPress={handleDiscard} color="#e53e3e" />
                <ActionButton label="Save" onPress={() => void handleSave()} color="#48bb78" />
              </View>
            </View>
          )}

          {/* Uploading */}
          {state.phase === 'uploading' && (
            <View style={styles.centeredContent} accessibilityLiveRegion="polite">
              <ActivityIndicator size="large" color="#6c63ff" accessibilityLabel="Saving annotation" />
              <Text style={styles.hint}>Saving annotation...</Text>
            </View>
          )}
        </BottomSheetView>
      </BottomSheet>
    );
  },
);

VoiceAnnotationSheet.displayName = 'VoiceAnnotationSheet';

// ── Sub-components ─────────────────────────────────────────────────────────────

function ActionButton({
  label,
  onPress,
  color,
}: {
  label: string;
  onPress: () => void;
  color: string;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.actionBtn, { backgroundColor: color }, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      <Text style={styles.actionBtnLabel}>{label}</Text>
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sheetBackground: { backgroundColor: '#1a1a2e' },
  handleIndicator: { backgroundColor: '#4a4a6a' },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 8 },
  title: {
    color: '#e8e8f0',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  centeredContent: { alignItems: 'center', gap: 16, paddingTop: 8 },
  micButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#6c63ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonActive: { backgroundColor: '#e53e3e' },
  hint: { color: '#8888aa', fontSize: 14 },
  limitText: { color: '#e53e3e', fontSize: 14, fontWeight: '600' },
  transcriptBox: {
    backgroundColor: '#0f0f1a',
    borderRadius: 8,
    padding: 12,
    width: '100%',
    minHeight: 60,
  },
  transcriptText: { color: '#e8e8f0', fontSize: 15, lineHeight: 22 },
  previewContainer: { gap: 16 },
  previewLabel: { color: '#8888aa', fontSize: 13, textAlign: 'center' },
  actionRow: { flexDirection: 'row', gap: 10, justifyContent: 'center', flexWrap: 'wrap' },
  actionBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    minWidth: 90,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.75 },
  actionBtnLabel: { color: '#fff', fontWeight: '700', fontSize: 14 },
  warningBanner: {
    backgroundColor: '#c05621',
    borderRadius: 8,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  warningText: { color: '#fff', fontSize: 13, flex: 1 },
  errorContainer: { alignItems: 'center', gap: 12, paddingTop: 12 },
  errorText: { color: '#e8e8f0', fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
