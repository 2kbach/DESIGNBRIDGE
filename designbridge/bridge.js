#!/usr/bin/env node

// DesignBridge — Local Bridge Server
// Receives prompts from the Chrome extension, pipes them to Claude Code CLI
//
// Usage:
//   node bridge.js /path/to/your/project
//   node bridge.js                          # uses current directory

const http = require('http');
const { execSync } = require('child_process');
const path = require('path');

const projectDir = process.argv[2] || process.cwd();
const projectName = path.basename(projectDir);
const PORT = process.env.DESIGNBRIDGE_PORT || 7890;

const server = http.createServer((req, res) => {
  // CORS headers so the Chrome extension can reach it
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check endpoint (used by popup to show connection status)
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      project: projectName,
      projectDir: projectDir,
      version: '0.1.0'
    }));
    return;
  }

  // Main endpoint — receive prompt, pipe to Claude
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { prompt, screenshot } = JSON.parse(body);

        if (!prompt) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'No prompt provided' }));
          return;
        }

        console.log('\n' + '='.repeat(60));
        console.log('DesignBridge request received');
        console.log('='.repeat(60));
        console.log('Prompt length:', prompt.length, 'chars');
        console.log('Screenshot:', screenshot ? 'included' : 'none');
        console.log('-'.repeat(60));

        // Pipe the prompt to Claude Code CLI
        // Using --print for non-interactive mode
        // Use absolute path — native host doesn't inherit shell PATH
        const claudePath = process.env.CLAUDE_PATH || '/Users/kevinauerbach/.local/bin/claude';
        const escapedPrompt = prompt.replace(/'/g, "'\\''");
        const result = execSync(
          `echo '${escapedPrompt}' | ${claudePath} --print`,
          {
            cwd: projectDir,
            encoding: 'utf8',
            timeout: 120000,  // 2 minute timeout
            maxBuffer: 1024 * 1024 * 10  // 10MB buffer
          }
        );

        console.log('-'.repeat(60));
        console.log('Claude response length:', result.length, 'chars');
        console.log('='.repeat(60));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          response: result.trim()
        }));

      } catch (err) {
        console.error('Error:', err.message);

        let errorMsg = err.message;
        if (err.status) {
          errorMsg = `Claude CLI exited with code ${err.status}`;
          if (err.stderr) errorMsg += ': ' + err.stderr.toString().trim();
        }

        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: errorMsg
        }));
      }
    });
    return;
  }

  // Unknown route
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log('');
  console.log('  DesignBridge server running');
  console.log('  -------------------------');
  console.log(`  URL:     http://localhost:${PORT}`);
  console.log(`  Project: ${projectDir}`);
  console.log(`  Health:  http://localhost:${PORT}/health`);
  console.log('');
  console.log('  Waiting for requests from Chrome extension...');
  console.log('');
});
