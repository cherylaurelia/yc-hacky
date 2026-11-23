#!/usr/bin/env bash
# Builds macos/build/Coworker.app (universal, ad-hoc signed) with plain swiftc, and build/Coworker.zip to hand to others.
# Command Line Tools are enough.
set -euo pipefail
cd "$(dirname "$0")"

APP=build/Coworker.app
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" build/obj

for arch in arm64 x86_64; do
  swiftc -O -swift-version 5 -target "$arch-apple-macos13.3" Coworker/*.swift -o "build/obj/Coworker-$arch"
done
lipo -create build/obj/Coworker-arm64 build/obj/Coworker-x86_64 -output "$APP/Contents/MacOS/Coworker"

VERSION="$(tr -d '[:space:]' < VERSION)"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "macos/VERSION must be x.y.z, got '$VERSION'" >&2; exit 1; }
mkdir -p "$APP/Contents/Resources/bin"
cp Resources/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"
# The CLI agents call (coworker ask, hooks); Settings > Agents links it into the user's PATH.
if [ -f ../bin/coworker ]; then install -m 755 ../bin/coworker "$APP/Contents/Resources/bin/coworker"; fi

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>dev.coworker.menubar</string>
  <key>CFBundleName</key><string>Coworker</string>
  <key>CFBundleDisplayName</key><string>Coworker</string>
  <key>CFBundleExecutable</key><string>Coworker</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>LSMinimumSystemVersion</key><string>13.3</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSMicrophoneUsageDescription</key><string>Coworker listens while you hold the talk key so you can talk to your voice coworker.</string>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict>
</plist>
PLIST

codesign --force --deep -s - "$APP"
codesign --verify --strict "$APP"

# ditto keeps the signature and symlinks intact; the zip unpacks to a Coworker.app that opens via right-click > Open.
rm -f build/Coworker.zip
ditto -c -k --norsrc --keepParent "$APP" build/Coworker.zip
check="$(mktemp -d)"
trap 'rm -rf "$check"' EXIT
ditto -x -k build/Coworker.zip "$check"
codesign --verify --strict "$check/Coworker.app"

# The installer people download: drag Coworker into Applications.
stage="$(mktemp -d)"
trap 'rm -rf "$check" "$stage"' EXIT
ditto "$APP" "$stage/Coworker.app"
ln -s /Applications "$stage/Applications"
rm -f build/Coworker.dmg
hdiutil create -quiet -volname "Coworker $VERSION" -srcfolder "$stage" -fs HFS+ -format UDZO -ov build/Coworker.dmg
hdiutil verify -quiet build/Coworker.dmg
echo "built $APP $VERSION, build/Coworker.zip and build/Coworker.dmg"
