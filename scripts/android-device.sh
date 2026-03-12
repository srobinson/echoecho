#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/android-device.sh <admin|student> <device-serial> [--build] [--fresh] [--metro]

Examples:
  scripts/android-device.sh admin 'adb-R5CR50X37XA-ADP1cS._adb-tls-connect._tcp' --build
  scripts/android-device.sh student emulator-5554 --build --metro

Flags:
  --build   Rebuild the debug APK before installing.
  --fresh   Uninstall the existing app first to clear stale native/dev-client state.
  --metro   Start Expo Metro in dev-client mode after installation.
EOF
}

if [[ $# -eq 1 && ( "$1" == "--help" || "$1" == "-h" ) ]]; then
  usage
  exit 0
fi

if [[ $# -lt 2 ]]; then
  usage
  exit 1
fi

APP_NAME="$1"
DEVICE_SERIAL="$2"
shift 2

BUILD_APK=0
FRESH_INSTALL=0
START_METRO=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build)
      BUILD_APK=1
      ;;
    --fresh)
      FRESH_INSTALL=1
      ;;
    --metro)
      START_METRO=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

if ! command -v adb >/dev/null 2>&1; then
  echo "adb is required but not installed or not on PATH." >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

case "$APP_NAME" in
  admin)
    APP_DIR="$REPO_ROOT/apps/admin"
    APK_PATH="$APP_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
    APPLICATION_ID="io.echoecho.admin"
    ;;
  student)
    APP_DIR="$REPO_ROOT/apps/student"
    APK_PATH="$APP_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
    APPLICATION_ID="io.echoecho.student"
    ;;
  *)
    echo "Unknown app: $APP_NAME" >&2
    usage
    exit 1
    ;;
esac

if ! adb devices | awk 'NR>1 {print $1}' | grep -Fxq "$DEVICE_SERIAL"; then
  echo "Device not connected: $DEVICE_SERIAL" >&2
  echo >&2
  adb devices -l >&2
  exit 1
fi

if [[ $BUILD_APK -eq 1 || ! -f "$APK_PATH" ]]; then
  echo "Building $APP_NAME debug APK..."
  (
    cd "$APP_DIR"
    ./android/gradlew -p android assembleDebug
  )
fi

if [[ ! -f "$APK_PATH" ]]; then
  echo "APK not found at: $APK_PATH" >&2
  exit 1
fi

if [[ $FRESH_INSTALL -eq 1 ]]; then
  echo "Uninstalling existing $APPLICATION_ID from $DEVICE_SERIAL..."
  adb -s "$DEVICE_SERIAL" uninstall "$APPLICATION_ID" >/dev/null 2>&1 || true
fi

echo "Installing $APK_PATH to $DEVICE_SERIAL..."
adb -s "$DEVICE_SERIAL" install -r "$APK_PATH"

echo "Installed $APPLICATION_ID on $DEVICE_SERIAL."
echo "Open the app manually from the launcher."

if [[ $START_METRO -eq 1 ]]; then
  echo "Starting Metro for $APP_NAME..."
  cd "$APP_DIR"
  exec npx expo start --dev-client
fi
