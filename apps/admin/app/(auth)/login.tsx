import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  AccessibilityInfo,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<'signin' | 'reset'>('signin');
  const [resetSent, setResetSent] = useState(false);

  const { signIn, resetPassword, isLoading, error } = useAuthStore();

  useEffect(() => {
    if (error) {
      AccessibilityInfo.announceForAccessibility(error);
    }
  }, [error]);

  async function handleSignIn() {
    if (!email || !password) return;
    try {
      await signIn(email.trim().toLowerCase(), password);
    } catch {
      // error displayed via store.error
    }
  }

  async function handleReset() {
    if (!email) {
      Alert.alert('Email required', 'Enter your email address above to receive a reset link.');
      return;
    }
    try {
      await resetPassword(email.trim().toLowerCase());
      setResetSent(true);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not send reset email.');
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>EchoEcho Admin</Text>
        <Text style={styles.subtitle}>
          {mode === 'signin' ? 'Sign in to continue' : 'Reset your password'}
        </Text>

        {error ? (
          <View accessibilityLiveRegion="assertive" accessibilityRole="alert">
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#666"
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
          accessibilityLabel="Email address"
        />

        {mode === 'signin' ? (
          <>
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Password"
                placeholderTextColor="#666"
                secureTextEntry={!showPassword}
                textContentType="password"
                value={password}
                onChangeText={setPassword}
                accessibilityLabel="Password"
                onSubmitEditing={handleSignIn}
                returnKeyType="go"
              />
              <Pressable
                style={styles.eyeButton}
                onPress={() => setShowPassword((prev) => !prev)}
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={22}
                  color="#8888aa"
                />
              </Pressable>
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
              onPress={handleSignIn}
              disabled={isLoading}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" accessibilityLabel="Signing in" />
              ) : (
                <Text style={styles.primaryButtonText}>Sign In</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => { setMode('reset'); setResetSent(false); }}
              accessibilityRole="button"
              accessibilityLabel="Forgot password"
            >
              <Text style={styles.linkText}>Forgot password?</Text>
            </TouchableOpacity>
          </>
        ) : resetSent ? (
          <>
            <Text style={styles.successText} accessibilityLiveRegion="polite">
              Reset link sent. Check your email.
            </Text>
            <TouchableOpacity onPress={() => setMode('signin')} accessibilityRole="button">
              <Text style={styles.linkText}>Back to sign in</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
              onPress={handleReset}
              disabled={isLoading}
              accessibilityRole="button"
              accessibilityLabel="Send reset link"
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>Send Reset Link</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setMode('signin')} accessibilityRole="button">
              <Text style={styles.linkText}>Back to sign in</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 28,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#e8e8f0',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0f0f1a',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#e8e8f0',
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f0f1a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#e8e8f0',
  },
  eyeButton: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#5b5bff',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkText: {
    color: '#5b5bff',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 4,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 14,
    textAlign: 'center',
  },
  successText: {
    color: '#6bffb8',
    fontSize: 14,
    textAlign: 'center',
  },
});
