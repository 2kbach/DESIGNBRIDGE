// DesignBridge Content Script
// Handles: hover detection, element highlighting, click-to-select,
// DOM context capture, floating panel UI

(() => {
  // Avoid double-injection
  if (window.__designBridgeActive) return;
  window.__designBridgeActive = true;

  // State
  let inspectMode = false;
  let hoveredElement = null;
  let selectedElement = null;
  let panelElement = null;
  let highlightOverlay = null;
  let labelBadge = null;
  let statusTimeout = null;

  // Settings (synced from popup)
  let settings = {
    stylePreset: 'all',
    contextDepth: 3,
    includeScreenshot: true,
    promptPrefix: '',
    bridgeUrl: 'http://localhost:7890'
  };

  // Load settings from storage
  try {
    chrome.storage?.local.get('designbridge_settings', (data) => {
      if (data.designbridge_settings) {
        settings = { ...settings, ...data.designbridge_settings };
      }
    });
  } catch (e) { /* extension context may not be available */ }

  // ========== OVERLAY ELEMENTS ==========

  function createOverlayElements() {
    // Highlight overlay
    highlightOverlay = document.createElement('div');
    highlightOverlay.id = 'designbridge-highlight';
    highlightOverlay.style.cssText = 'display:none;';
    document.body.appendChild(highlightOverlay);

    // Label badge
    labelBadge = document.createElement('div');
    labelBadge.id = 'designbridge-label';
    labelBadge.style.cssText = 'display:none;';
    document.body.appendChild(labelBadge);
  }

  function positionOverlay(el) {
    if (!el || !highlightOverlay) return;
    const rect = el.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    highlightOverlay.style.display = 'block';
    highlightOverlay.style.top = (rect.top + scrollY) + 'px';
    highlightOverlay.style.left = (rect.left + scrollX) + 'px';
    highlightOverlay.style.width = rect.width + 'px';
    highlightOverlay.style.height = rect.height + 'px';

    // Label badge
    const tag = el.tagName.toLowerCase();
    const cls = el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\s+/).join('.')
      : '';
    const id = el.id ? '#' + el.id : '';
    labelBadge.textContent = tag + id + cls;
    labelBadge.style.display = 'block';
    labelBadge.style.top = Math.max(0, rect.top + scrollY - 22) + 'px';
    labelBadge.style.left = (rect.left + scrollX) + 'px';
  }

  function hideOverlay() {
    if (highlightOverlay) highlightOverlay.style.display = 'none';
    if (labelBadge) labelBadge.style.display = 'none';
  }

  // ========== CSS SELECTOR GENERATION ==========

  function getCssSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);

    const parts = [];
    let current = el;
    while (current && current !== document.body && current !== document.documentElement) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector = '#' + CSS.escape(current.id);
        parts.unshift(selector);
        break;
      }

      if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\s+/).filter(c => c);
        if (classes.length > 0) {
          selector += '.' + classes.map(c => CSS.escape(c)).join('.');
        }
      }

      // Add nth-child if needed for uniqueness
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          s => s.tagName === current.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += ':nth-child(' + index + ')';
        }
      }

      parts.unshift(selector);
      current = current.parentElement;
    }

    return parts.join(' > ');
  }

  // ========== STYLE CAPTURE ==========

  const STYLE_PRESETS = {
    layout: [
      'display', 'position', 'flex-direction', 'justify-content', 'align-items',
      'gap', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
      'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
      'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
      'grid-template-columns', 'grid-template-rows', 'overflow'
    ],
    typography: [
      'font-family', 'font-size', 'font-weight', 'font-style',
      'line-height', 'letter-spacing', 'text-align', 'text-decoration',
      'text-transform', 'white-space', 'word-break', 'color'
    ],
    colors: [
      'color', 'background-color', 'border-color', 'outline-color',
      'opacity', 'box-shadow', 'text-shadow'
    ],
    all: [
      'display', 'position', 'flex-direction', 'justify-content', 'align-items',
      'gap', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
      'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
      'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
      'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
      'text-align', 'text-decoration', 'text-transform', 'color', 'background-color',
      'border', 'border-radius', 'box-shadow', 'opacity',
      'grid-template-columns', 'grid-template-rows', 'overflow',
      'z-index', 'cursor', 'transition'
    ]
  };

  function captureStyles(el) {
    const computed = window.getComputedStyle(el);
    const props = STYLE_PRESETS[settings.stylePreset] || STYLE_PRESETS.all;
    const styles = {};

    for (const prop of props) {
      const val = computed.getPropertyValue(prop);
      // Skip default/empty values
      if (val && val !== 'none' && val !== 'normal' && val !== 'auto' && val !== '0px'
          && val !== 'rgba(0, 0, 0, 0)' && val !== 'transparent') {
        styles[prop] = val;
      }
    }

    return styles;
  }

  // ========== PARENT / CHILDREN CONTEXT ==========

  function getParentContext(el, depth) {
    const levels = [];
    let current = el.parentElement;
    for (let i = 0; i < depth && current && current !== document.body; i++) {
      const tag = current.tagName.toLowerCase();
      const cls = current.className && typeof current.className === 'string'
        ? ' class="' + current.className.trim() + '"'
        : '';
      const id = current.id ? ' id="' + current.id + '"' : '';
      levels.unshift({ tag, html: `<${tag}${id}${cls}>` });
      current = current.parentElement;
    }
    return levels;
  }

  function getElementHTML(el, maxChildren = 5) {
    const tag = el.tagName.toLowerCase();
    const attrs = [];
    for (const attr of el.attributes) {
      if (['class', 'id', 'data-testid', 'data-component', 'role', 'aria-label', 'href', 'src', 'type'].includes(attr.name)
          || attr.name.startsWith('data-')) {
        attrs.push(`${attr.name}="${attr.value}"`);
      }
    }
    const attrStr = attrs.length ? ' ' + attrs.join(' ') : '';

    // Get children representation
    const children = el.children;
    let innerContent = '';

    if (children.length === 0) {
      // Text-only element
      const text = el.textContent.trim();
      innerContent = text.length > 200 ? text.substring(0, 200) + '...' : text;
    } else {
      const lines = [];
      const limit = Math.min(children.length, maxChildren);
      for (let i = 0; i < limit; i++) {
        const child = children[i];
        const childTag = child.tagName.toLowerCase();
        const childCls = child.className && typeof child.className === 'string'
          ? ' class="' + child.className.trim() + '"'
          : '';
        const childId = child.id ? ' id="' + child.id + '"' : '';
        const childText = child.textContent.trim();
        const truncText = childText.length > 80 ? childText.substring(0, 80) + '...' : childText;
        lines.push(`  <${childTag}${childId}${childCls}>${truncText}</${childTag}>`);
      }
      if (children.length > maxChildren) {
        lines.push(`  <!-- ... ${children.length - maxChildren} more children -->`);
      }
      innerContent = '\n' + lines.join('\n') + '\n';
    }

    return `<${tag}${attrStr}>${innerContent}</${tag}>`;
  }

  function getParentHTML(el, depth) {
    let current = el;
    let parents = [];

    for (let i = 0; i < depth && current.parentElement && current.parentElement !== document.body; i++) {
      parents.push(current.parentElement);
      current = current.parentElement;
    }

    // Build from outermost parent
    parents.reverse();
    let indent = '';
    let result = '';

    for (const parent of parents) {
      const tag = parent.tagName.toLowerCase();
      const cls = parent.className && typeof parent.className === 'string'
        ? ' class="' + parent.className.trim() + '"'
        : '';
      const id = parent.id ? ' id="' + parent.id + '"' : '';
      result += indent + `<${tag}${id}${cls}>\n`;
      indent += '  ';
    }

    // The selected element with marker
    const selectedHTML = getElementHTML(el);
    const lines = selectedHTML.split('\n');
    for (const line of lines) {
      result += indent + line;
      if (line === lines[0]) result += '    \u2190 SELECTED';
      result += '\n';
    }

    // Close parents
    parents.forEach(() => {
      indent = indent.slice(2);
      result += indent + '</...>\n';
    });

    return result.trim();
  }

  // ========== PROMPT ASSEMBLY ==========

  function assemblePrompt(el, instruction, screenshotDataUrl) {
    const selector = getCssSelector(el);
    const tag = el.tagName.toLowerCase();
    const cls = el.className && typeof el.className === 'string' ? el.className.trim() : '';
    const id = el.id || '';
    const text = el.textContent.trim();
    const truncText = text.length > 200 ? text.substring(0, 200) + '...' : text;

    const styles = captureStyles(el);
    const styleLines = Object.entries(styles)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join('\n');

    const parentHTML = getParentHTML(el, settings.contextDepth);

    const rect = el.getBoundingClientRect();
    const viewport = `${window.innerWidth} x ${window.innerHeight}`;

    let prompt = `You are receiving a visual edit request from DesignBridge. A designer has selected an element in their running web app and described what they want changed. Your job is to find the source file, make the edit, and respond with a brief confirmation. Do not refactor surrounding code. Do not ask clarifying questions \u2014 just make the most reasonable interpretation of the instruction and apply it. If you truly cannot determine the right file, say so.

---

I'm looking at my running app and I've selected an element that needs to change. Here's the context:

**Page:** ${window.location.href}
**Selected element:** \`${selector}\`
**Element:** <${tag}${id ? ' id="' + id + '"' : ''}${cls ? ' class="' + cls + '"' : ''}>${truncText}</${tag}>
**Element dimensions:** ${Math.round(rect.width)} x ${Math.round(rect.height)}px

**Computed styles:**
${styleLines}

**Parent structure:**
\`\`\`html
${parentHTML}
\`\`\`

**Viewport:** ${viewport}`;

    if (settings.promptPrefix) {
      prompt += `\n\n**Additional context:** ${settings.promptPrefix}`;
    }

    prompt += `\n\n**What I want changed:**\n${instruction}`;

    prompt += '\n\n---\nPlease find the source file for this component, make the changes, and let me know what you changed.';

    return prompt;
  }

  // ========== FLOATING PANEL ==========

  function createPanel(el) {
    removePanel();

    const rect = el.getBoundingClientRect();
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;

    panelElement = document.createElement('div');
    panelElement.id = 'designbridge-panel';

    const tag = el.tagName.toLowerCase();
    const cls = el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\s+/).join('.')
      : '';
    const id = el.id ? '#' + el.id : '';
    const selectorPath = getCssSelector(el);

    panelElement.innerHTML = `
      <div class="designbridge-panel-header">
        <span class="designbridge-panel-tag">${tag}${id}${cls}</span>
        <button class="designbridge-panel-close" title="Cancel (Esc)">
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1 1L7 7M7 1L1 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="designbridge-panel-selector">${selectorPath}</div>
      <textarea
        class="designbridge-panel-input"
        placeholder="What should change?"
        rows="3"
      ></textarea>
      <div class="designbridge-panel-actions">
        <div class="designbridge-panel-status"></div>
        <button class="designbridge-panel-btn secondary" data-action="copy">Copy</button>
        <button class="designbridge-panel-btn primary" data-action="send">Send to Claude</button>
      </div>
      <div class="designbridge-panel-hint">\u2318\u21e7 Enter to send \u00b7 Esc to cancel</div>
    `;

    document.body.appendChild(panelElement);

    // Position: below element, or above if near bottom
    const panelHeight = 220;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    let top, left;
    if (spaceBelow > panelHeight + 16 || spaceBelow > spaceAbove) {
      top = rect.bottom + scrollY + 8;
    } else {
      top = rect.top + scrollY - panelHeight - 8;
    }
    left = Math.max(8, Math.min(rect.left + scrollX, window.innerWidth - 336));

    panelElement.style.top = top + 'px';
    panelElement.style.left = left + 'px';

    // Focus input
    const textarea = panelElement.querySelector('.designbridge-panel-input');
    setTimeout(() => textarea.focus(), 50);

    // Event listeners
    const closeBtn = panelElement.querySelector('.designbridge-panel-close');
    closeBtn.addEventListener('click', cancelSelection);

    const sendBtn = panelElement.querySelector('[data-action="send"]');
    sendBtn.addEventListener('click', () => handleSend(el));

    const copyBtn = panelElement.querySelector('[data-action="copy"]');
    copyBtn.addEventListener('click', () => handleCopy(el));

    textarea.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSend(el);
      }
    });
  }

  function removePanel() {
    if (panelElement) {
      panelElement.remove();
      panelElement = null;
    }
  }

  function showStatus(message, type = 'info') {
    if (!panelElement) return;
    const statusEl = panelElement.querySelector('.designbridge-panel-status');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = 'designbridge-panel-status ' + type;

    if (statusTimeout) clearTimeout(statusTimeout);
    if (type === 'success') {
      statusTimeout = setTimeout(() => {
        if (statusEl) statusEl.textContent = '';
      }, 5000);
    }
  }

  // ========== SEND / COPY HANDLERS ==========

  async function handleSend(el) {
    const textarea = panelElement?.querySelector('.designbridge-panel-input');
    if (!textarea || !textarea.value.trim()) {
      showStatus('Please describe what should change', 'error');
      return;
    }

    const instruction = textarea.value.trim();
    showStatus('Capturing element...', 'info');

    // Capture screenshot via background script
    let screenshotDataUrl = null;
    if (settings.includeScreenshot) {
      try {
        screenshotDataUrl = await captureScreenshot(el);
      } catch (e) {
        console.warn('DesignBridge: screenshot capture failed', e);
      }
    }

    const prompt = assemblePrompt(el, instruction, screenshotDataUrl);
    showStatus('Sending to Claude...', 'info');

    // Disable buttons while sending
    const buttons = panelElement.querySelectorAll('.designbridge-panel-btn');
    buttons.forEach(b => b.disabled = true);

    try {
      const response = await fetch(settings.bridgeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, screenshot: screenshotDataUrl })
      });

      const data = await response.json();

      if (data.success) {
        showStatus('Change applied!', 'success');
        // Show Claude's response in the panel
        showResponse(data.response);
      } else {
        showStatus('Error: ' + (data.error || 'Unknown error'), 'error');
      }
    } catch (err) {
      // Bridge not reachable — fall back to clipboard
      showStatus('Bridge unreachable \u2014 copied to clipboard', 'warning');
      await copyToClipboard(prompt);
    }

    buttons.forEach(b => b.disabled = false);
  }

  async function handleCopy(el) {
    const textarea = panelElement?.querySelector('.designbridge-panel-input');
    if (!textarea || !textarea.value.trim()) {
      showStatus('Please describe what should change', 'error');
      return;
    }

    const instruction = textarea.value.trim();
    const prompt = assemblePrompt(el, instruction, null);

    await copyToClipboard(prompt);
    showStatus('Copied to clipboard!', 'success');
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }

  function showResponse(response) {
    if (!panelElement) return;
    const existing = panelElement.querySelector('.designbridge-panel-response');
    if (existing) existing.remove();

    const responseDiv = document.createElement('div');
    responseDiv.className = 'designbridge-panel-response';
    responseDiv.textContent = response;
    panelElement.appendChild(responseDiv);

    // Expand panel height
    panelElement.style.maxHeight = '500px';
  }

  // ========== SCREENSHOT CAPTURE ==========

  function captureScreenshot(el) {
    return new Promise((resolve, reject) => {
      const rect = el.getBoundingClientRect();

      // Request screenshot from background script
      chrome.runtime.sendMessage(
        { type: 'captureScreenshot', rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        }},
        (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else if (response?.dataUrl) {
            resolve(response.dataUrl);
          } else {
            reject(new Error('No screenshot data'));
          }
        }
      );
    });
  }

  // ========== INSPECT MODE ==========

  function enableInspect() {
    if (inspectMode) return;
    inspectMode = true;
    createOverlayElements();
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.body.style.cursor = 'crosshair';
  }

  function disableInspect() {
    inspectMode = false;
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.body.style.cursor = '';
    hideOverlay();
    removePanel();
    selectedElement = null;
    hoveredElement = null;

    // Remove overlay elements
    if (highlightOverlay) { highlightOverlay.remove(); highlightOverlay = null; }
    if (labelBadge) { labelBadge.remove(); labelBadge = null; }
  }

  function cancelSelection() {
    removePanel();
    selectedElement = null;
    if (inspectMode) {
      // Return to hover mode
      document.addEventListener('mousemove', onMouseMove, true);
      document.addEventListener('click', onClick, true);
    }
  }

  // ========== EVENT HANDLERS ==========

  function isDesignBridgeElement(el) {
    if (!el) return false;
    return el.closest('#designbridge-panel') ||
           el.closest('#designbridge-highlight') ||
           el.closest('#designbridge-label') ||
           el.id?.startsWith('designbridge-');
  }

  function onMouseMove(e) {
    if (!inspectMode || selectedElement) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isDesignBridgeElement(el)) {
      hideOverlay();
      return;
    }

    if (el !== hoveredElement) {
      hoveredElement = el;
      positionOverlay(el);
    }
  }

  function onClick(e) {
    if (!inspectMode) return;
    if (isDesignBridgeElement(e.target)) return;

    e.preventDefault();
    e.stopPropagation();

    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isDesignBridgeElement(el)) return;

    selectedElement = el;
    positionOverlay(el);

    // Stop hover tracking while panel is open
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);

    createPanel(el);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      if (panelElement) {
        cancelSelection();
      } else {
        disableInspect();
      }
    }
  }

  // ========== MESSAGE HANDLER (from background / popup) ==========

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'toggleInspect') {
      if (inspectMode) {
        disableInspect();
      } else {
        enableInspect();
      }
      sendResponse({ inspectMode });
    } else if (msg.type === 'getStatus') {
      sendResponse({ inspectMode });
    } else if (msg.type === 'updateSettings') {
      settings = { ...settings, ...msg.settings };
    }
    return true;
  });

})();
