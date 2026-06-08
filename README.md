## **Run this command**

```node browser.js https://target.com 10 proxies.txt 100 60```


## **Install This**


```
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

```
