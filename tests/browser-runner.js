import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg'
};

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = parsedUrl.pathname;
  if (pathname === '/') pathname = '/examples/browser-test.html';

  const filePath = path.join(rootDir, pathname);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*'
  });
  fs.createReadStream(filePath).pipe(res);
});

const PORT = 8899;
server.listen(PORT, async () => {
  console.log(`HTTP test server listening on http://localhost:${PORT}`);

  // Find Chrome or Edge executable
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const browserExe = fs.existsSync(chromePath) ? chromePath : (fs.existsSync(edgePath) ? edgePath : null);

  if (!browserExe) {
    console.error('No supported browser found.');
    server.close();
    process.exit(1);
  }

  console.log(`Using browser executable: ${browserExe}`);

  // Launch browser with remote debugging port to fetch results
  const debugPort = 9222;
  const targetUrl = `http://localhost:${PORT}/examples/browser-test.html?autorun=1`;

  const browserProcess = spawn(browserExe, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-extensions',
    `--remote-debugging-port=${debugPort}`,
    targetUrl
  ], { stdio: 'ignore' });

  // Wait for browser CDP to be ready
  let connected = false;
  let pageTarget = null;

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const listRes = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const targets = await listRes.json();
      pageTarget = targets.find(t => t.type === 'page' && t.url.includes('browser-test.html'));
      if (pageTarget && pageTarget.webSocketDebuggerUrl) {
        connected = true;
        break;
      }
    } catch {}
  }

  if (!connected || !pageTarget) {
    console.error('Could not connect to browser DevTools target.');
    browserProcess.kill();
    server.close();
    process.exit(1);
  }

  console.log('Connected to headless browser via CDP.');

  // Use WebSocket to evaluate window.verificationResults
  // Node 22+ has global WebSocket built-in!
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

  let msgId = 1;
  const pending = new Map();

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data);
      pending.delete(data.id);
    }
  };

  function sendCommand(method, params = {}) {
    return new Promise((resolve) => {
      const id = msgId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.onopen = async () => {
    // Poll for window.verificationComplete
    let completed = false;
    let evalResult = null;

    for (let attempts = 0; attempts < 40; attempts++) {
      await new Promise(r => setTimeout(r, 500));
      const res = await sendCommand('Runtime.evaluate', {
        expression: 'JSON.stringify(window.verificationResults || null)',
        returnByValue: true
      });

      if (res && res.result && res.result.result && res.result.result.value) {
        const val = JSON.parse(res.result.result.value);
        if (val && (val.passCount > 0 || val.error)) {
          completed = true;
          evalResult = val;
          break;
        }
      }
    }

    ws.close();
    browserProcess.kill();
    server.close();

    if (!completed || !evalResult) {
      console.error('Browser tests timed out without reporting results.');
      process.exit(1);
    }

    if (evalResult.error) {
      console.error('Browser verification failed with error:', evalResult.error);
      process.exit(1);
    }

    console.log('\n--- REAL BROWSER VERIFICATION RESULTS ---');
    console.log('Tested Browser Agent:', evalResult.browser);
    console.log('Timestamp:', evalResult.timestamp);
    console.log(`Passed: ${evalResult.passCount}, Failed: ${evalResult.failCount}`);
    console.log('\nWeb APIs:');
    for (const [k, v] of Object.entries(evalResult.webApis)) {
      console.log(`  [${v.passed ? 'PASS' : 'FAIL'}] ${k}: ${v.details}`);
    }
    console.log('\nTools & Operations:');
    for (const [k, v] of Object.entries(evalResult.tools)) {
      console.log(`  [${v.passed ? 'PASS' : 'FAIL'}] ${k}: ${v.details}`);
    }

    if (evalResult.failCount > 0) {
      console.error(`Browser tests failed with ${evalResult.failCount} failures.`);
      process.exit(1);
    } else {
      console.log('\nALL REAL BROWSER TESTS PASSED!');
      process.exit(0);
    }
  };
});
