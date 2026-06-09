const fs = require("fs");
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
};

function log(type, message) {
  const prefix = `${colors.cyan}[Browser]${colors.reset}`;
  let color = colors.reset;
  let symbol = "ℹ";
  
  if (type === "error") { color = colors.red; symbol = "✗"; }
  if (type === "success") { color = colors.green; symbol = "✓"; }
  if (type === "warn") { color = colors.yellow; symbol = "⚠"; }
  
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
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

function getRandomUA() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// Sleep function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
      `--user-agent=${userAgent}`
    ]
  };
  
  let browser = null;
  
  try {
    log("info", `[${id}] Launching with proxy: ${proxy}`);
    
    browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    
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
    
    // Get page info
    const title = await page.title();
    const url = page.url();
    
    log("success", `[${id}] Loaded: ${title} (${url})`);
    
    // Get cookies
    const cookies = await page.cookies();
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    
    // Check if blocked
    if (title.includes("Just a moment") || title.includes("Attention Required")) {
      log("warn", `[${id}] Cloudflare detected, waiting...`);
      await sleep(5000);
    }
    
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
      userAgent: userAgent
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

// Thread worker
async function worker(proxy, id, retries = 0) {
  const result = await openBrowser(proxy, id);
  
  if (!result.success && retries < MAX_RETRIES) {
    log("warn", `[${id}] Retry ${retries + 1}/${MAX_RETRIES} for ${proxy}`);
    await sleep(2000);
    return worker(proxy, id, retries + 1);
  }
  
  return result;
}

// Main function
async function main() {
  log("info", `Target: ${targetURL}`);
  log("info", `Threads: ${threads}`);
  log("info", `Duration: ${duration} seconds`);
  log("info", `Total proxies: ${proxies.length}`);
  
  // Create a queue of proxies to test
  const proxyQueue = [...proxies];
  let activeThreads = 0;
  let completed = 0;
  let successCount = 0;
  let failCount = 0;
  
  // Process function
  async function processProxy(proxy, id) {
    activeThreads++;
    const result = await worker(proxy, id);
    activeThreads--;
    completed++;
    
    if (result.success) {
      successCount++;
      log("success", `[${id}] ✅ SUCCESS - Proxy: ${proxy} | Title: ${result.title}`);
      // Log cookie for flood.js if needed
      if (result.cookies) {
        console.log(`[COOKIES] ${result.cookies}`);
      }
    } else {
      failCount++;
      log("error", `[${id}] ❌ FAILED - Proxy: ${proxy} | Error: ${result.error}`);
    }
    
    // Log progress
    if (completed % 10 === 0 || completed === proxyQueue.length) {
      log("info", `Progress: ${completed}/${proxyQueue.length} | Success: ${successCount} | Failed: ${failCount}`);
    }
    
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
  
  // Wait for duration or completion
  const endTime = startTime + (duration * 1000);
  
  const waitInterval = setInterval(() => {
    if (Date.now() >= endTime) {
      log("warn", "Time limit reached, stopping...");
      clearInterval(waitInterval);
      process.exit(0);
    }
  }, 1000);
  
  // Wait for all to complete
  while (completed < proxies.length && Date.now() < endTime) {
    await sleep(1000);
  }
  
  clearInterval(waitInterval);
  
  log("success", `\n=== FINAL RESULTS ===`);
  log("success", `Total tested: ${completed}`);
  log("success", `Successful: ${successCount}`);
  log("error", `Failed: ${failCount}`);
  log("success", `Success rate: ${((successCount / completed) * 100).toFixed(2)}%`);
  
  process.exit(0);
}

// Run main function
main().catch(error => {
  log("error", `Fatal error: ${error.message}`);
  process.exit(1);
});
