// Test-only launch hook for the ephemeral self-signed local HTTPS fixture.
// The production CLI never imports this module or disables certificate validation.
import { chromium, request } from 'playwright';

const launch = chromium.launch.bind(chromium);
chromium.launch = async (options) => {
  const browser = await launch(options);
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (options) => {
    return newContext({ ...options, ignoreHTTPSErrors: true });
  };
  return browser;
};

// Redirect only the external notification boundary to the local HTTP fixture.
const newRequestContext = request.newContext.bind(request);
request.newContext = async (options) => {
  const context = await newRequestContext(options);
  const post = context.post.bind(context);
  context.post = (url, options) =>
    post(`${process.env.TEST_TELEGRAM_URL}${new URL(url).pathname}`, options);
  return context;
};
