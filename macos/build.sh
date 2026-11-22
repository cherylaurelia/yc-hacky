#!/usr/bin/env bash
# Builds macos/build/Coworker.app (universal, ad-hoc signed) with plain swiftc. Command Line Tools are enough.
set -euo pipefail
cd "$(dirname "$0")"

APP=build/Coworker.app
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" build/obj

for arch in arm64 x86_64; do
  swiftc -O -swift-version 5 -target "$arch-apple-macos13.3" Coworker/*.swift -o "build/obj/Coworker-$arch"
done
lipo -create build/obj/Coworker-arm64 build/obj/Coworker-x86_64 -output "$APP/Contents/MacOS/Coworker"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>dev.coworker.menubar</string>
  <key>CFBundleName</key><string>Coworker</string>
  <key>CFBundleDisplayName</key><string>Coworker</string>
  <key>CFBundleExecutable</key><string>Coworker</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>13.3</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSMicrophoneUsageDescription</key><string>Coworker listens while you hold fn so you can talk to your voice coworker.</string>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict>
</plist>
PLIST

codesign --force --deep -s - "$APP"
codesign --verify --strict "$APP"
echo "built $APP"
