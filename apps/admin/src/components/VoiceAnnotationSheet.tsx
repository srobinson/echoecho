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
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';

import { useVoiceAnnotation } from '../hooks/useVoiceAnnotation';
import { useSectionColor } from '../contexts/SectionColorContext';

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
      audioSupport,
      startRecording,
      stopRecording,
      dismissSilencePrompt,
      confirm,
      discard,
      reRecord,
      openMicSettings,
    } = useVoiceAnnotation();
    const accent = useSectionColor();
    const hasCapturedAudio = state.audioUri != null;
    const isTranscriptOnlyDevice = !audioSupport.supported;
    const transcriptOnlyExplanation = audioSupport.explanation
      ?? 'This device does not support playback clips. You can still save the transcript.';

    const handleSave = useCallback(async () => {
      const result = await confirm(waypointLocalId);
      if (result) {
        onSave(result);
      }
    }, [confirm, waypointLocalId, onSave]);

    const handleTranscriptOnlySave = useCallback(() => {
      Alert.alert(
        isTranscriptOnlyDevice ? 'Save Transcript?' : 'Save Transcript Only?',
        isTranscriptOnlyDevice
          ? `${transcriptOnlyExplanation} Saving now will keep the transcript only.`
          : 'No verified audio clip was found for this take. You can re-record, or continue and save only the transcript text.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: isTranscriptOnlyDevice ? 'Save Transcript' : 'Save Transcript Only',
            onPress: () => void handleSave(),
          },
        ],
      );
    }, [handleSave, isTranscriptOnlyDevice, transcriptOnlyExplanation]);

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
        snapPoints={['55%', '80%']}
        enablePanDownToClose
        onClose={onDismiss}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.handleIndicator}
      >
        <BottomSheetScrollView contentContainerStyle={styles.container}>
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
              <Ionicons name="alert-circle" size={32} color="#F06292" />
              <Text style={styles.errorText}>{state.errorMessage}</Text>
              {state.errorMessage?.includes('permission') ? (
                <ActionButton label="Open Settings" onPress={handlePermissionError} color={accent} />
              ) : (
                <ActionButton label="Try Again" onPress={() => void startRecording()} color={accent} />
              )}
            </View>
          )}

          {/* Idle */}
          {state.phase === 'idle' && (
            <View style={styles.centeredContent}>
              <Pressable
                style={[styles.micButton, { backgroundColor: accent }]}
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
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveBadgeText}>Recording live</Text>
              </View>

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
                <Text style={styles.hint}>Listening now. Tap stop when you are done speaking.</Text>
              )}

              {state.transcript.length > 0 && (
                <View style={styles.transcriptBox}>
                  <Text style={styles.transcriptText}>{state.transcript}</Text>
                </View>
              )}
            </View>
          )}

          {state.phase === 'processing' && (
            <View style={styles.centeredContent} accessibilityLiveRegion="polite">
              <ActivityIndicator
                size="large"
                color={accent}
                accessibilityLabel={isTranscriptOnlyDevice ? 'Finishing transcript' : 'Finalizing audio clip'}
              />
              <Text style={styles.hint}>
                {isTranscriptOnlyDevice ? 'Finishing transcript...' : 'Finalizing audio clip...'}
              </Text>
              <Text style={styles.supportingHint}>
                {isTranscriptOnlyDevice
                  ? transcriptOnlyExplanation
                  : 'This usually takes 1 to 5 seconds. We are waiting for the speech engine to finish writing the local playback file.'}
              </Text>
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

              {!state.transcript && (
                <Text style={styles.supportingHint}>
                  {isTranscriptOnlyDevice
                    ? 'No transcription was returned, and this device does not support playback clips for this take.'
                    : 'No transcription was returned, but the audio clip can still be saved with this waypoint.'}
                </Text>
              )}

              <View
                style={[
                  styles.captureStatus,
                  hasCapturedAudio ? styles.captureStatusReady : styles.captureStatusTranscriptOnly,
                ]}
              >
                <Ionicons
                  name={hasCapturedAudio ? 'checkmark-circle' : 'document-text-outline'}
                  size={16}
                  color={hasCapturedAudio ? '#81C784' : '#A0AEC0'}
                />
                <Text
                  style={[
                    styles.captureStatusText,
                    hasCapturedAudio ? styles.captureStatusTextReady : styles.captureStatusTextTranscriptOnly,
                  ]}
                >
                  {hasCapturedAudio
                    ? 'Audio attached. Safe to save.'
                    : isTranscriptOnlyDevice
                      ? transcriptOnlyExplanation
                      : 'Transcript ready. Saving now will keep the text, but not an audio playback clip.'}
                </Text>
              </View>

              <View style={styles.actionRow}>
                {hasCapturedAudio ? (
                  <>
                    <ActionButton label="Re-record" onPress={reRecord} color="#718096" />
                    <ActionButton label="Discard" onPress={handleDiscard} color="#F06292" />
                    <ActionButton
                      label="Save"
                      onPress={() => void handleSave()}
                      color="#66BB6A"
                    />
                  </>
                ) : (
                  <>
                    <ActionButton label="Re-record" onPress={reRecord} color="#66BB6A" />
                    <ActionButton label="Discard" onPress={handleDiscard} color="#F06292" />
                    <ActionButton
                      label={isTranscriptOnlyDevice ? 'Save Transcript' : 'Save Transcript Only'}
                      onPress={handleTranscriptOnlySave}
                      color="#4A5568"
                    />
                  </>
                )}
              </View>
            </View>
          )}

          {/* Uploading */}
          {state.phase === 'uploading' && (
            <View style={styles.centeredContent} accessibilityLiveRegion="polite">
              <ActivityIndicator size="large" color={accent} accessibilityLabel="Saving annotation" />
              <Text style={styles.hint}>
                {hasCapturedAudio ? 'Uploading audio and saving annotation...' : 'Saving transcript annotation...'}
              </Text>
            </View>
          )}
        </BottomSheetScrollView>
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
  sheetBackground: { backgroundColor: '#111116' },
  handleIndicator: { backgroundColor: '#4a4a6a' },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 8 },
  title: {
    color: '#F0F0F5',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  centeredContent: { alignItems: 'center', gap: 16, paddingTop: 8 },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0629222',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#F0629244',
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F06292',
  },
  liveBadgeText: {
    color: '#F0F0F5',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  micButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonActive: { backgroundColor: '#F06292' },
  hint: { color: '#606070', fontSize: 14 },
  supportingHint: {
    color: '#808090',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  captureStatus: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  captureStatusReady: {
    backgroundColor: '#81C78418',
    borderColor: '#81C78433',
  },
  captureStatusTranscriptOnly: {
    backgroundColor: '#A0AEC018',
    borderColor: '#A0AEC033',
  },
  captureStatusText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  captureStatusTextReady: {
    color: '#C6F6D5',
  },
  captureStatusTextTranscriptOnly: {
    color: '#CBD5E0',
  },
  limitText: { color: '#F06292', fontSize: 14, fontWeight: '600' },
  transcriptBox: {
    backgroundColor: '#0A0A0F',
    borderRadius: 8,
    padding: 12,
    width: '100%',
    minHeight: 60,
  },
  transcriptText: { color: '#F0F0F5', fontSize: 15, lineHeight: 22 },
  previewContainer: { gap: 16 },
  previewLabel: { color: '#606070', fontSize: 13, textAlign: 'center' },
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
  errorText: { color: '#F0F0F5', fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
