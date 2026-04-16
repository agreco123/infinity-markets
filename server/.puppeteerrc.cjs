const { join } = require('path');

/** @type {import("puppeteer").Configuration} */
module.exports = {
  // Store Chrome in project dir so it is persisted in the Render deploy artifact
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};

