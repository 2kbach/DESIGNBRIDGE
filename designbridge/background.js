// DesignBridge Background Service Worker
// Handles: keyboard shortcut, screenshot capture, bridge communication

// Toggle inspect mode on keyboard shortcut
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-inspect') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'toggleInspect' });
      }
    });
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'captureScreenshot') {
    // Capture the visible tab
    chrome.tabs.captureVisibleTab(
      sender.tab.windowId,
      { format: 'png' },
      (dataUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
          return;
        }

        // Crop to the element's bounding box
        const rect = msg.rect;
        const dpr = sender.tab.devicePixelRatio || 1;

        cropImage(dataUrl, rect, dpr).then((croppedDataUrl) => {
          sendResponse({ dataUrl: croppedDataUrl });
        }).catch((err) => {
          sendResponse({ error: err.message });
        });
      }
    );
    return true; // Keep message channel open for async response
  }

  if (msg.type === 'toggleInspect') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'toggleInspect' }, sendResponse);
      }
    });
    return true;
  }
});

// Crop an image to a specific rect using OffscreenCanvas
async function cropImage(dataUrl, rect, dpr) {
  // Use offscreen document for image processing in MV3
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  // Calculate crop area with padding (40px around the element)
  const padding = 40;
  const x = Math.max(0, Math.round((rect.x - padding) * dpr));
  const y = Math.max(0, Math.round((rect.y - padding) * dpr));
  const w = Math.min(bitmap.width - x, Math.round((rect.width + padding * 2) * dpr));
  const h = Math.min(bitmap.height - y, Math.round((rect.height + padding * 2) * dpr));

  // For very small elements, expand to include parent context
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

// Extension icon click — toggle inspect on the active tab
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { type: 'toggleInspect' });
});
