#!/bin/bash
# DesignBridge — Native Messaging Host Installer
# Run this once after loading the extension in Chrome.
#
# Usage:
#   cd ~/Desktop/CLAUDE\ DESIGNED/designbridge && bash install-host.sh
#   bash install-host.sh <extension-id>    # if you know your extension ID

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_NAME="com.designbridge.host"
NATIVE_HOST_PATH="$SCRIPT_DIR/native-host.js"
TARGET_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"

echo ""
echo "  DesignBridge — Native Messaging Host Installer"
echo "  ================================================"
echo ""

# Get extension ID
if [ -n "$1" ]; then
  EXT_ID="$1"
else
  echo "  To find your extension ID:"
  echo "  1. Open chrome://extensions"
  echo "  2. Find 'DesignBridge'"
  echo "  3. Copy the ID (looks like: abcdefghijklmnopqrstuvwxyz)"
  echo ""
  read -p "  Paste your extension ID: " EXT_ID
fi

if [ -z "$EXT_ID" ]; then
  echo "  Error: No extension ID provided."
  exit 1
fi

# Ensure native host is executable
chmod +x "$NATIVE_HOST_PATH"

# Find node and patch the shebang so Chrome can find it
# (Chrome doesn't load shell profiles, so /usr/bin/env node fails)
NODE_PATH=$(which node)
if [ -z "$NODE_PATH" ]; then
  echo "  Error: Node.js not found. Install Node.js first."
  exit 1
fi

echo "  Node found at: $NODE_PATH"

# Replace the shebang with the absolute node path
sed -i '' "1s|^#!.*|#!${NODE_PATH}|" "$NATIVE_HOST_PATH"
echo "  Updated shebang to: #!${NODE_PATH}"

# Create target directory
mkdir -p "$TARGET_DIR"

# Write the native messaging manifest with the correct extension ID and path
cat > "$TARGET_DIR/$HOST_NAME.json" << EOF
{
  "name": "$HOST_NAME",
  "description": "DesignBridge native messaging host — starts bridge server and folder picker",
  "path": "$NATIVE_HOST_PATH",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXT_ID/"
  ]
}
EOF

echo ""
echo "  Installed successfully!"
echo ""
echo "  Host:      $HOST_NAME"
echo "  Path:      $NATIVE_HOST_PATH"
echo "  Manifest:  $TARGET_DIR/$HOST_NAME.json"
echo "  Extension: $EXT_ID"
echo ""
echo "  You can now use DesignBridge — it will auto-start"
echo "  the bridge server when you pick a project folder."
echo ""
