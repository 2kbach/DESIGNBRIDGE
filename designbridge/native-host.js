#!/opt/homebrew/bin/node

// DesignBridge Native Messaging Host
// Chrome launches this via Native Messaging API.
// It receives commands over stdin, spawns bridge.js, and replies over stdout.
// Protocol: 4-byte little-endian length prefix + JSON payload

const { spawn, execSync } = require('child_process');
const path = require('path');

let bridgeProcess = null;
const bridgePort = 7890;

// ========== NATIVE MESSAGING I/O ==========

function sendMessage(msg) {
  const json = Buffer.from(JSON.stringify(msg), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  process.stdout.write(header);
  process.stdout.write(json);
}

// Buffered stdin reader for native messaging protocol
let inputBuffer = Buffer.alloc(0);

process.stdin.on('data', (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  processInput();
});

function processInput() {
  // Need at least 4 bytes for the length header
  while (inputBuffer.length >= 4) {
    const msgLen = inputBuffer.readUInt32LE(0);

    // Sanity check — messages shouldn't be larger than 1MB
    if (msgLen > 1024 * 1024) {
      sendMessage({ type: 'error', error: 'Message too large: ' + msgLen });
      inputBuffer = Buffer.alloc(0);
      return;
    }

    // Wait for the full message body
    if (inputBuffer.length < 4 + msgLen) return;

    const msgBody = inputBuffer.slice(4, 4 + msgLen).toString('utf8');
    inputBuffer = inputBuffer.slice(4 + msgLen);

    try {
      const msg = JSON.parse(msgBody);
      handleMessage(msg);
    } catch (e) {
      sendMessage({ type: 'error', error: 'Failed to parse: ' + e.message });
    }
  }
}

// ========== FOLDER PICKER (macOS AppleScript) ==========

function pickFolder() {
  try {
    const result = execSync(
      `osascript -e 'set chosenFolder to POSIX path of (choose folder with prompt "Select your project folder for DesignBridge:")' 2>/dev/null`,
      { encoding: 'utf8', timeout: 60000 }
    );
    return result.trim().replace(/\/$/, '');
  } catch (e) {
    return null;
  }
}

// ========== BRIDGE SERVER MANAGEMENT ==========

function startBridge(projectDir) {
  if (bridgeProcess) {
    stopBridge();
  }

  const bridgeScript = path.join(__dirname, 'bridge.js');
  const projectName = path.basename(projectDir);

  bridgeProcess = spawn(process.execPath, [bridgeScript, projectDir], {
    env: { ...process.env, DESIGNBRIDGE_PORT: String(bridgePort) },
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: false
  });

  // Wait for server to start, then confirm
  setTimeout(() => {
    if (bridgeProcess && !bridgeProcess.killed) {
      sendMessage({
        type: 'started',
        port: bridgePort,
        project: projectName,
        projectDir: projectDir
      });
    }
  }, 800);

  bridgeProcess.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) sendMessage({ type: 'log', level: 'error', message: msg });
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
  }
}

// ========== MESSAGE HANDLER ==========

function handleMessage(msg) {
  switch (msg.type) {
    case 'ping':
      sendMessage({ type: 'pong' });
      break;

    case 'start':
      if (!msg.projectDir) {
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
      sendMessage({ type: 'stopped', code: 0 });
      break;

    case 'status':
      sendMessage({
        type: 'status',
        running: bridgeProcess !== null && !bridgeProcess.killed,
        port: bridgePort
      });
      break;

    default:
      sendMessage({ type: 'error', error: 'Unknown type: ' + msg.type });
  }
}

// Cleanup on exit
process.on('SIGTERM', () => { stopBridge(); process.exit(0); });
process.on('SIGINT', () => { stopBridge(); process.exit(0); });
process.on('exit', () => { stopBridge(); });
