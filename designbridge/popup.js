// DesignBridge Popup Script — Apple HIG controls

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
const stylePreset = document.getElementById('stylePreset');
const depthValue = document.getElementById('depthValue');
const depthMinus = document.getElementById('depthMinus');
const depthPlus = document.getElementById('depthPlus');
const screenshotToggle = document.getElementById('screenshotToggle');
const bridgeUrl = document.getElementById('bridgeUrl');
const promptPrefix = document.getElementById('promptPrefix');

let currentDepth = 3;
let screenshotOn = true;

// Load saved settings
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

// Save settings
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

// Stepper controls
depthMinus.addEventListener('click', () => {
  if (currentDepth > 1) {
    currentDepth--;
    depthValue.textContent = currentDepth;
    saveSettings();
  }
});

depthPlus.addEventListener('click', () => {
  if (currentDepth < 5) {
    currentDepth++;
    depthValue.textContent = currentDepth;
    saveSettings();
  }
});

// Screenshot toggle (Apple-style)
screenshotToggle.addEventListener('click', () => {
  screenshotOn = !screenshotOn;
  screenshotToggle.classList.toggle('active', screenshotOn);
  saveSettings();
});

// Other inputs
stylePreset.addEventListener('change', saveSettings);
bridgeUrl.addEventListener('change', saveSettings);
promptPrefix.addEventListener('change', saveSettings);

// Check bridge server status
async function checkBridge() {
  try {
    const url = bridgeUrl.value || DEFAULTS.bridgeUrl;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(url + '/health', {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      statusDot.className = 'status-indicator connected';
      statusText.textContent = data.project ? data.project : 'Connected';
    } else {
      statusDot.className = 'status-indicator disconnected';
      statusText.textContent = 'Bridge error';
    }
  } catch (e) {
    statusDot.className = 'status-indicator disconnected';
    statusText.textContent = 'Clipboard mode';
  }
}

checkBridge();

// Inspect toggle (Apple-style toggle switch)
toggleBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'toggleInspect' }, (response) => {
        if (response?.inspectMode) {
          toggleBtn.classList.add('active');
        } else {
          toggleBtn.classList.remove('active');
        }
      });
    }
  });
});

// Check current inspect state on popup open
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]) {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'getStatus' }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response?.inspectMode) {
        toggleBtn.classList.add('active');
      }
    });
  }
});
