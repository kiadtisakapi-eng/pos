// Use the installed Chrome for local UI verification; no browser download needed.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const redirectPage = page => {
  const screenshot = page.screenshot.bind(page);
  page.screenshot = options => {
    if (options && options.path) {
      const dir = path.join(__dirname, 'codex-ui');
      fs.mkdirSync(dir, { recursive: true });
      options = { ...options, path: path.join(dir, path.basename(options.path)) };
    }
    return screenshot(options);
  };
};
const launch = chromium.launch.bind(chromium);
chromium.launch = options => {
  options = { ...options };
  if (!options.executablePath || !fs.existsSync(options.executablePath)) {
    options.executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  }
  return launch(options).then(browser => {
    const blockExternal = context => context.route('**/*', route => {
      const u = new URL(route.request().url());
      return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) ? route.continue() : route.abort();
    });
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async options => {
      const context = await newContext(options);
      await blockExternal(context);
      context.on('page', redirectPage);
      return context;
    };
    const newPage = browser.newPage.bind(browser);
    browser.newPage = async options => {
      const page = await newPage(options);
      await blockExternal(page.context());
      redirectPage(page);
      return page;
    };
    return browser;
  });
};
// Existing UI tests write screenshots into earlier audits. Keep those immutable.
const writeFileSync = fs.writeFileSync.bind(fs);
fs.writeFileSync = (file, ...args) => {
  if (path.basename(String(file)) === 'responsive-result.json') file = path.join(__dirname, 'codex-responsive-result.json');
  return writeFileSync(file, ...args);
};
