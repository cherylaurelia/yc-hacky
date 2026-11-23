#!/usr/bin/env bash
# Builds macos/build/Terminal 1.app (universal) with plain swiftc, plus build/Terminal-1.zip and build/Terminal-1.dmg to hand to others.
# Command Line Tools are enough.
#   (default)           ad-hoc signed: opens via right-click > Open, not notarized.
#   DEVELOPER_ID="Developer ID Application: Name (TEAMID)"
#                       signed with that identity, hardened runtime and Terminal1.entitlements (what notarization needs).
#   NOTARY_PROFILE=name also submits the DMG with `xcrun notarytool` (a keychain profile from `notarytool store-credentials`)
#                       and staples the ticket to it. Needs DEVELOPER_ID.
set -euo pipefail
cd "$(dirname "$0")"

[[ -z "${NOTARY_PROFILE:-}" || -n "${DEVELOPER_ID:-}" ]] || { echo "NOTARY_PROFILE needs DEVELOPER_ID: only a Developer ID build can be notarized" >&2; exit 1; }

APP="build/Terminal 1.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" build/obj

for arch in arm64 x86_64; do
  swiftc -O -swift-version 5 -target "$arch-apple-macos13.3" Coworker/*.swift -o "build/obj/Terminal1-$arch"
done
lipo -create build/obj/Terminal1-arm64 build/obj/Terminal1-x86_64 -output "$APP/Contents/MacOS/Terminal1"

VERSION="$(tr -d '[:space:]' < VERSION)"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "macos/VERSION must be x.y.z, got '$VERSION'" >&2; exit 1; }
mkdir -p "$APP/Contents/Resources/bin" "$APP/Contents/Resources/hooks"
cp Resources/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"
# The CLI agents call (coworker ask, hooks), and the board hook it falls back to (found at ../hooks from bin/).
install -m 755 ../bin/coworker "$APP/Contents/Resources/bin/coworker"
install -m 755 ../hooks/coworker-hook.sh "$APP/Contents/Resources/hooks/coworker-hook.sh"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>com.terminal1.app</string>
  <key>CFBundleName</key><string>Terminal 1</string>
  <key>CFBundleDisplayName</key><string>Terminal 1</string>
  <key>CFBundleExecutable</key><string>Terminal1</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>LSMinimumSystemVersion</key><string>13.3</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSMicrophoneUsageDescription</key><string>Terminal 1 listens while you hold the talk key so you can talk to your agents and dictate.</string>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict>
</plist>
PLIST

if [[ -n "${DEVELOPER_ID:-}" ]]; then
  echo "signing: Developer ID ($DEVELOPER_ID), hardened runtime, Terminal1.entitlements"
  # No --deep: the bundle has no nested code, and Apple advises against it.
  codesign --force --options runtime --timestamp --entitlements Terminal1.entitlements -s "$DEVELOPER_ID" "$APP"
  codesign --verify --strict --verbose=2 "$APP"
else
  echo "signing: ad-hoc (set DEVELOPER_ID to sign for distribution)"
  codesign --force --deep -s - "$APP"
  codesign --verify --strict "$APP"
fi

# ditto keeps the signature and symlinks intact; the zip unpacks to a Terminal 1.app that opens via right-click > Open.
rm -f build/Terminal-1.zip
ditto -c -k --norsrc --keepParent "$APP" build/Terminal-1.zip
check="$(mktemp -d)"
trap 'rm -rf "$check"' EXIT
ditto -x -k build/Terminal-1.zip "$check"
codesign --verify --strict "$check/Terminal 1.app"

# The installer people download: drag Terminal 1 into Applications.
stage="$(mktemp -d)"
trap 'rm -rf "$check" "$stage"' EXIT
ditto "$APP" "$stage/Terminal 1.app"
ln -s /Applications "$stage/Applications"
DMG=build/Terminal-1.dmg
rm -f "$DMG"
hdiutil create -quiet -volname "Terminal 1 $VERSION" -srcfolder "$stage" -fs HFS+ -format UDZO -ov "$DMG"
hdiutil verify -quiet "$DMG"

notarized="not notarized"
if [[ -n "${DEVELOPER_ID:-}" ]]; then
  codesign --force --timestamp -s "$DEVELOPER_ID" "$DMG"
  codesign --verify --strict "$DMG"
  if [[ -n "${NOTARY_PROFILE:-}" ]]; then
    echo "notarizing: submitting $DMG with profile $NOTARY_PROFILE (this waits for Apple)"
    # notarytool can exit 0 for a rejected submission, so read the status, not the exit code.
    result="$(xcrun notarytool submit "$DMG" --keychain-profile "$NOTARY_PROFILE" --wait 2>&1)" || { echo "$result" >&2; echo "notarytool failed" >&2; exit 1; }
    echo "$result"
    grep -q 'status: Accepted' <<<"$result" || { echo "notarization was not accepted: run xcrun notarytool log <submission id> --keychain-profile $NOTARY_PROFILE" >&2; exit 1; }
    xcrun stapler staple "$DMG"
    xcrun stapler validate "$DMG"
    notarized="notarized and stapled"
  else
    echo "notarizing: skipped (set NOTARY_PROFILE to notarize and staple the DMG)"
  fi
fi
echo "built $APP $VERSION, build/Terminal-1.zip and $DMG ($notarized)"
