// Test-only launch hook for the ephemeral self-signed local HTTPS fixture.
// The production CLI never imports this module or disables certificate validation.
import { chromium } from 'playwright';

const launch = chromium.launch.bind(chromium);
chromium.launch = async (options) => {
  const browser = await launch(options);
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (options) => {
    return newContext({ ...options, ignoreHTTPSErrors: true });
  };
  return browser;
};
