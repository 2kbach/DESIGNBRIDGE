// DesignBridge Background Service Worker
// Handles: keyboard shortcut, screenshot capture, native messaging bridge management

const NATIVE_HOST = 'com.designbridge.host';

// State
let nativePort = null;
let bridgeRunning = false;
let bridgeProject = null;
let bridgeProjectDir = null;
let pendingCallbacks = {};
let callbackId = 0;

// ========== NATIVE MESSAGING ==========

function connectNative() {
  if (nativePort) return;

  try {
    console.log('DesignBridge: connecting to native host', NATIVE_HOST);
    nativePort = chrome.runtime.connectNative(NATIVE_HOST);

    nativePort.onMessage.addListener((msg) => {
      console.log('DesignBridge: native message received', msg);
      handleNativeMessage(msg);
    });

    nativePort.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError?.message || 'disconnected';
      console.error('DesignBridge: native host disconnected:', err);
      nativePort = null;
      bridgeRunning = false;
      bridgeProject = null;
      bridgeProjectDir = null;
      Object.values(pendingCallbacks).forEach(cb => cb({ error: err }));
      pendingCallbacks = {};
    });

    console.log('DesignBridge: native connection established');
  } catch (e) {
    console.error('DesignBridge: connectNative failed:', e);
    nativePort = null;
  }
}

function sendNative(msg) {
  if (!nativePort) connectNative();
  if (nativePort) {
    nativePort.postMessage(msg);
  }
}

function handleNativeMessage(msg) {
  switch (msg.type) {
    case 'started':
      bridgeRunning = true;
      bridgeProject = msg.project;
      bridgeProjectDir = msg.projectDir;
      // Notify popup
      broadcastStatus();
      break;

    case 'stopped':
      bridgeRunning = false;
      bridgeProject = null;
      bridgeProjectDir = null;
      broadcastStatus();
      break;

    case 'folderPicked':
      // Folder was picked — now start the bridge with it
      sendNative({ type: 'start', projectDir: msg.projectDir });
      break;

    case 'folderCancelled':
      broadcastStatus();
      break;

    case 'error':
      broadcastStatus();
      break;

    case 'pong':
      break;
  }
}

function broadcastStatus() {
  // Send status to any open popup
  chrome.runtime.sendMessage({
    type: 'bridgeStatus',
    running: bridgeRunning,
    project: bridgeProject,
    projectDir: bridgeProjectDir
  }).catch(() => { /* popup might not be open */ });
}

// ========== MESSAGE HANDLER (from popup & content script) ==========

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'captureScreenshot') {
    chrome.tabs.captureVisibleTab(
      sender.tab.windowId,
      { format: 'png' },
      (dataUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
          return;
        }
        const rect = msg.rect;
        cropImage(dataUrl, rect, 1).then((croppedDataUrl) => {
          sendResponse({ dataUrl: croppedDataUrl });
        }).catch((err) => {
          sendResponse({ error: err.message });
        });
      }
    );
    return true;
  }

  if (msg.type === 'toggleInspect') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'toggleInspect' }, sendResponse);
      }
    });
    return true;
  }

  // Native messaging commands from popup
  if (msg.type === 'startBridge') {
    connectNative();
    if (msg.projectDir) {
      sendNative({ type: 'start', projectDir: msg.projectDir });
    } else {
      // Open folder picker then start
      sendNative({ type: 'start' });
    }
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'stopBridge') {
    sendNative({ type: 'stop' });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'pickFolder') {
    connectNative();
    sendNative({ type: 'start' });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'getBridgeStatus') {
    sendResponse({
      running: bridgeRunning,
      project: bridgeProject,
      projectDir: bridgeProjectDir
    });
    return true;
  }

  return false;
});

// ========== KEYBOARD SHORTCUT ==========

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-inspect') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'toggleInspect' });
      }
    });
  }
});

// ========== SCREENSHOT CROP ==========

async function cropImage(dataUrl, rect, dpr) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  const padding = 40;
  const x = Math.max(0, Math.round((rect.x - padding) * dpr));
  const y = Math.max(0, Math.round((rect.y - padding) * dpr));
  const w = Math.min(bitmap.width - x, Math.round((rect.width + padding * 2) * dpr));
  const h = Math.min(bitmap.height - y, Math.round((rect.height + padding * 2) * dpr));

  const minSize = 100 * dpr;
  const cropW = Math.max(w, minSize);
  const cropH = Math.max(h, minSize);

  const canvas = new OffscreenCanvas(cropW, cropH);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, x, y, cropW, cropH, 0, 0, cropW, cropH);

  const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
  const reader = new FileReader();

  return new Promise((resolve) => {
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(croppedBlob);
  });
}
