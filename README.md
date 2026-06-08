## **Run this command**

```node browser.js https://target.com 10 proxies.txt 100 60```


## **Install This**


```
# Remove corrupted cache
rm -rf ~/.cache/puppeteer
rm -rf node_modules
rm package-lock.json

# Skip Chrome download and use system Chrome
PUPPETEER_SKIP_DOWNLOAD=true npm install puppeteer

# Install Chromium as alternative
apt-get update && apt-get install -y chromium



# Install Chrome on your system
wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add -
echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list
apt-get update
apt-get install -y google-chrome-stable

# Find Chrome path
which google-chrome-stable
# Output: /usr/bin/google-chrome-stable

# Install puppeteer without downloading Chrome
PUPPETEER_SKIP_DOWNLOAD=true npm install puppeteer





# One-liner to fix everything
rm -rf ~/.cache/puppeteer node_modules package-lock.json && \
apt-get update && apt-get install -y chromium && \
PUPPETEER_SKIP_DOWNLOAD=true npm install puppeteer && \
node -e "console.log('✅ Puppeteer installed successfully!')"




rm -rf node_modules package-lock.json ~/.cache/puppeteer
apt-get update && apt-get install -y chromium
PUPPETEER_SKIP_DOWNLOAD=true npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth





# Install older stable versions without deprecation warnings
npm install puppeteer@19.11.1 puppeteer-extra@3.3.4 puppeteer-extra-plugin-stealth@2.11.1

```
