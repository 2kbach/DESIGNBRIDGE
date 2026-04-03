// DesignBridge Popup Script

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
const contextDepth = document.getElementById('contextDepth');
const includeScreenshot = document.getElementById('includeScreenshot');
const bridgeUrl = document.getElementById('bridgeUrl');
const promptPrefix = document.getElementById('promptPrefix');

// Load saved settings
chrome.storage.local.get('designbridge_settings', (data) => {
  const s = { ...DEFAULTS, ...(data.designbridge_settings || {}) };
  stylePreset.value = s.stylePreset;
  contextDepth.value = s.contextDepth;
  includeScreenshot.checked = s.includeScreenshot;
  bridgeUrl.value = s.bridgeUrl;
  promptPrefix.value = s.promptPrefix;
});

// Save settings on change
function saveSettings() {
  const settings = {
    stylePreset: stylePreset.value,
    contextDepth: parseInt(contextDepth.value, 10),
    includeScreenshot: includeScreenshot.checked,
    promptPrefix: promptPrefix.value,
    bridgeUrl: bridgeUrl.value
  };

  chrome.storage.local.set({ designbridge_settings: settings });

  // Push to content script
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'updateSettings', settings });
    }
  });
}

stylePreset.addEventListener('change', saveSettings);
contextDepth.addEventListener('change', saveSettings);
includeScreenshot.addEventListener('change', saveSettings);
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
      statusDot.className = 'status-dot connected';
      statusText.textContent = 'Bridge connected' + (data.project ? ' — ' + data.project : '');
    } else {
      statusDot.className = 'status-dot disconnected';
      statusText.textContent = 'Bridge error (HTTP ' + res.status + ')';
    }
  } catch (e) {
    statusDot.className = 'status-dot disconnected';
    statusText.textContent = 'Bridge not running — clipboard mode';
  }
}

checkBridge();

// Toggle inspect mode
toggleBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'toggleInspect' }, (response) => {
        if (response?.inspectMode) {
          toggleBtn.classList.add('active');
          toggleBtn.textContent = 'Inspecting...';
        } else {
          toggleBtn.classList.remove('active');
          toggleBtn.textContent = 'Inspect';
        }
      });
    }
  });
});

// Check current inspect state
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]) {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'getStatus' }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response?.inspectMode) {
        toggleBtn.classList.add('active');
        toggleBtn.textContent = 'Inspecting...';
      }
    });
  }
});
