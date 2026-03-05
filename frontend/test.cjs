const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    page.on('console', msg => {
        if (msg.type() === 'error')
            console.log(`PAGE ERROR: ${msg.text()}`);
    });

    page.on('pageerror', error => {
        console.log(`UNCAUGHT ERROR: ${error.message}`);
    });

    await page.goto('http://localhost:5173');
    await page.waitForTimeout(3000);
    await browser.close();
})();
