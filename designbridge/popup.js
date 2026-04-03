// DesignBridge Popup Script — with auto-start bridge support

const DEFAULTS = {
  stylePreset: 'all',
  contextDepth: 3,
  includeScreenshot: true,
  promptPrefix: '',
  bridgeUrl: 'http://localhost:7890'
};

// DOM elements
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const toggleBtn = document.getElementById('toggleBtn');
const connectCard = document.getElementById('connectCard');
const pickFolderBtn = document.getElementById('pickFolderBtn');
const stylePreset = document.getElementById('stylePreset');
const depthValue = document.getElementById('depthValue');
const depthMinus = document.getElementById('depthMinus');
const depthPlus = document.getElementById('depthPlus');
const screenshotToggle = document.getElementById('screenshotToggle');
const bridgeUrl = document.getElementById('bridgeUrl');
const promptPrefix = document.getElementById('promptPrefix');

let currentDepth = 3;
let screenshotOn = true;

// ========== SETTINGS ==========

chrome.storage.local.get('designbridge_settings', (data) => {
  const s = { ...DEFAULTS, ...(data.designbridge_settings || {}) };
  stylePreset.value = s.stylePreset;
  currentDepth = s.contextDepth;
  depthValue.textContent = currentDepth;
  screenshotOn = s.includeScreenshot;
  screenshotToggle.classList.toggle('active', screenshotOn);
  bridgeUrl.value = s.bridgeUrl;
  promptPrefix.value = s.promptPrefix;
});

function saveSettings() {
  const settings = {
    stylePreset: stylePreset.value,
    contextDepth: currentDepth,
    includeScreenshot: screenshotOn,
    promptPrefix: promptPrefix.value,
    bridgeUrl: bridgeUrl.value
  };
  chrome.storage.local.set({ designbridge_settings: settings });
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'updateSettings', settings });
    }
  });
}

depthMinus.addEventListener('click', () => {
  if (currentDepth > 1) { currentDepth--; depthValue.textContent = currentDepth; saveSettings(); }
});
depthPlus.addEventListener('click', () => {
  if (currentDepth < 5) { currentDepth++; depthValue.textContent = currentDepth; saveSettings(); }
});
screenshotToggle.addEventListener('click', () => {
  screenshotOn = !screenshotOn;
  screenshotToggle.classList.toggle('active', screenshotOn);
  saveSettings();
});
stylePreset.addEventListener('change', saveSettings);
bridgeUrl.addEventListener('change', saveSettings);
promptPrefix.addEventListener('change', saveSettings);

// ========== BRIDGE STATUS ==========

function showConnected(projectName) {
  statusDot.className = 'status-indicator connected';
  statusText.textContent = projectName || 'Connected';
  connectCard.style.display = 'none';
  pickFolderBtn.disabled = false;
  pickFolderBtn.textContent = 'Select Project Folder';
}

function showDisconnected() {
  statusDot.className = 'status-indicator disconnected';
  statusText.textContent = 'Not connected';
  connectCard.style.display = 'block';
  pickFolderBtn.disabled = false;
  pickFolderBtn.textContent = 'Select Project Folder';
}

function showConnecting() {
  statusDot.className = 'status-indicator';
  statusText.textContent = 'Starting bridge...';
  pickFolderBtn.disabled = true;
  pickFolderBtn.textContent = 'Starting...';
}

// Check bridge via HTTP health endpoint
async function checkBridge() {
  try {
    const url = bridgeUrl.value || DEFAULTS.bridgeUrl;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(url + '/health', { method: 'GET', signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      showConnected(data.project);
      return true;
    }
  } catch (e) { /* not running */ }

  // Bridge not reachable — show the connect button immediately
  showDisconnected();

  // Also check if background already has a running bridge via native messaging
  try {
    chrome.runtime?.sendMessage({ type: 'getBridgeStatus' }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response?.running) {
        showConnected(response.project);
      }
    });
  } catch (e) { /* not in extension context */ }

  return false;
}

checkBridge();

// Listen for bridge status updates from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'bridgeStatus') {
    if (msg.running) {
      showConnected(msg.project);
    } else {
      showDisconnected();
    }
  }
});

// ========== FOLDER PICKER / AUTO-START ==========

pickFolderBtn.addEventListener('click', () => {
  showConnecting();

  try {
    chrome.runtime.sendMessage({ type: 'pickFolder' }, (response) => {
      if (chrome.runtime.lastError) {
        showDisconnected();
        statusText.textContent = chrome.runtime.lastError.message || 'Native host error';
      }
    });
  } catch (e) {
    showDisconnected();
    statusText.textContent = 'Error: ' + e.message;
  }

  // Timeout fallback
  setTimeout(() => {
    if (statusText.textContent === 'Starting bridge...') {
      checkBridge();
    }
  }, 8000);
});

// ========== INSPECT TOGGLE ==========

toggleBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'toggleInspect' }, (response) => {
        toggleBtn.classList.toggle('active', response?.inspectMode);
      });
    }
  });
});

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]) {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'getStatus' }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response?.inspectMode) toggleBtn.classList.add('active');
    });
  }
});
