## **Run this command**

```node browser.js https://target.com 10 proxies.txt 100 60```


## **Install This**


```
For Debian/Ubuntu

apt-get update && apt-get install -y wget gnupg
wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add -
echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list
apt-get update && apt-get install -y google-chrome-stable

# Then use the system Chrome
PUPPETEER_EXECUTABLE_PATH=$(which google-chrome-stable) node browser.js <args>


apt-get update && apt-get install -y chromium && PUPPETEER_SKIP_DOWNLOAD=true npm install puppeteer-core@22.15.0 puppeteer-extra puppeteer-extra-plugin-stealth async && node browser.js https://example.com 5 proxies.txt 100 60

```
