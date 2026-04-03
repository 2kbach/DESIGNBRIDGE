#!/opt/homebrew/bin/node

// DesignBridge Native Messaging Host
// Chrome launches this via Native Messaging API.
// It receives commands over stdin, spawns bridge.js, and replies over stdout.
// Protocol: 4-byte little-endian length prefix + JSON payload

const { spawn, execSync } = require('child_process');
const path = require('path');

let bridgeProcess = null;
let bridgePort = 7890;

// ========== NATIVE MESSAGING I/O ==========

function sendMessage(msg) {
  const json = JSON.stringify(msg);
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(json.length, 0);
  process.stdout.write(buf);
  process.stdout.write(json);
}

function readMessage(callback) {
  let headerBuf = Buffer.alloc(0);

  const onReadable = () => {
    // Read 4-byte header
    if (headerBuf.length < 4) {
      const chunk = process.stdin.read(4 - headerBuf.length);
      if (!chunk) return;
      headerBuf = Buffer.concat([headerBuf, chunk]);
      if (headerBuf.length < 4) return;
    }

    const msgLen = headerBuf.readUInt32LE(0);
    const bodyChunk = process.stdin.read(msgLen);
    if (!bodyChunk) return;

    headerBuf = Buffer.alloc(0);

    try {
      const msg = JSON.parse(bodyChunk.toString('utf8'));
      callback(msg);
    } catch (e) {
      sendMessage({ type: 'error', error: 'Failed to parse message: ' + e.message });
    }
  };

  process.stdin.on('readable', onReadable);
}

// ========== FOLDER PICKER (macOS AppleScript) ==========

function pickFolder() {
  try {
    const result = execSync(
      `osascript -e 'set chosenFolder to POSIX path of (choose folder with prompt "Select your project folder for DesignBridge:")' 2>/dev/null`,
      { encoding: 'utf8', timeout: 60000 }
    );
    // Remove trailing newline and slash
    return result.trim().replace(/\/$/, '');
  } catch (e) {
    // User cancelled the dialog
    return null;
  }
}

// ========== BRIDGE SERVER MANAGEMENT ==========

function startBridge(projectDir) {
  if (bridgeProcess) {
    stopBridge();
  }

  const bridgeScript = path.join(__dirname, 'bridge.js');
  const port = bridgePort;

  bridgeProcess = spawn('node', [bridgeScript, projectDir], {
    env: { ...process.env, DESIGNBRIDGE_PORT: String(port) },
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: false
  });

  const projectName = path.basename(projectDir);

  // Wait a moment for the server to start, then verify
  setTimeout(() => {
    if (bridgeProcess && !bridgeProcess.killed) {
      sendMessage({
        type: 'started',
        port: port,
        project: projectName,
        projectDir: projectDir
      });
    }
  }, 500);

  bridgeProcess.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) {
      sendMessage({ type: 'log', level: 'error', message: msg });
    }
  });

  bridgeProcess.on('exit', (code) => {
    bridgeProcess = null;
    sendMessage({ type: 'stopped', code: code });
  });

  bridgeProcess.on('error', (err) => {
    bridgeProcess = null;
    sendMessage({ type: 'error', error: 'Failed to start bridge: ' + err.message });
  });
}

function stopBridge() {
  if (bridgeProcess) {
    bridgeProcess.kill('SIGTERM');
    bridgeProcess = null;
    sendMessage({ type: 'stopped', code: 0 });
  }
}

// ========== MESSAGE HANDLER ==========

readMessage(function handleMessage(msg) {
  switch (msg.type) {
    case 'ping':
      sendMessage({ type: 'pong' });
      break;

    case 'pickFolder':
      const folder = pickFolder();
      if (folder) {
        sendMessage({ type: 'folderPicked', projectDir: folder });
      } else {
        sendMessage({ type: 'folderCancelled' });
      }
      break;

    case 'start':
      if (!msg.projectDir) {
        // No dir provided — open picker first
        const picked = pickFolder();
        if (picked) {
          startBridge(picked);
        } else {
          sendMessage({ type: 'folderCancelled' });
        }
      } else {
        startBridge(msg.projectDir);
      }
      break;

    case 'stop':
      stopBridge();
      break;

    case 'status':
      sendMessage({
        type: 'status',
        running: bridgeProcess !== null && !bridgeProcess.killed,
        port: bridgePort
      });
      break;

    default:
      sendMessage({ type: 'error', error: 'Unknown message type: ' + msg.type });
  }

  // Keep listening for more messages
  readMessage(handleMessage);
});

// Cleanup on exit
process.on('SIGTERM', () => { stopBridge(); process.exit(0); });
process.on('SIGINT', () => { stopBridge(); process.exit(0); });
process.on('exit', () => { stopBridge(); });
