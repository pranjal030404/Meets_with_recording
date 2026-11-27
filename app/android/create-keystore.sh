#!/usr/bin/env bash
# Make your own Android release key, once:   bash app/android/create-keystore.sh [keystore-path]
# Asks for a password, writes the keystore (default ~/keys/minutes-release.jks, outside the project) and
# android/key.properties (git-ignored). BACK BOTH UP somewhere safe: without this key you can never ship an update
# that installs over the app people already have.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
STORE="${1:-$HOME/keys/minutes-release.jks}"
KEYTOOL="${KEYTOOL:-${JAVA_HOME:+$JAVA_HOME/bin/}keytool}"
command -v "$KEYTOOL" >/dev/null || { echo "keytool not found: set JAVA_HOME to your JDK" >&2; exit 1; }
[ -e "$STORE" ] && { echo "$STORE already exists: not overwriting it" >&2; exit 1; }
[ -e "$HERE/key.properties" ] && { echo "$HERE/key.properties already exists: not overwriting it" >&2; exit 1; }
if [ -z "${STORE_PASSWORD:-}" ]; then
  read -r -s -p "New keystore password (6 or more characters): " STORE_PASSWORD; echo
  read -r -s -p "Repeat it: " again; echo
  [ "$STORE_PASSWORD" = "$again" ] || { echo "The two did not match" >&2; exit 1; }
fi
[ ${#STORE_PASSWORD} -ge 6 ] || { echo "Too short" >&2; exit 1; }
umask 077
mkdir -p "$(dirname "$STORE")"
# the password goes through the environment, never the command line
STORE_PASSWORD="$STORE_PASSWORD" "$KEYTOOL" -genkeypair -keystore "$STORE" -storetype PKCS12 -alias minutes \
  -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=Minutes" -storepass:env STORE_PASSWORD -keypass:env STORE_PASSWORD
printf 'storeFile=%s\nstorePassword=%s\nkeyAlias=minutes\nkeyPassword=%s\n' "$(realpath "$STORE")" "$STORE_PASSWORD" "$STORE_PASSWORD" > "$HERE/key.properties"
echo "Created $STORE and $HERE/key.properties. Back both up now."
