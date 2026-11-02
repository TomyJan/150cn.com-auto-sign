import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../src/config.mjs';
import { formatReport, redact } from '../src/report.mjs';

const env = {
  SITE_BASE_URL: 'https://example.test',
  SITE_USERNAME: 'fixture-account',
  SITE_PASSWORD: 'fixture password & value',
};

// Catches trimming or silently rewriting a password read from Secrets.
test('credentials are required and passwords are preserved exactly', () => {
  assert.equal(loadConfig(env).password, 'fixture password & value');
  assert.equal(loadConfig({ ...env, SITE_PASSWORD: ' space ' }).password, ' space ');
  for (const key of ['SITE_BASE_URL', 'SITE_USERNAME', 'SITE_PASSWORD']) {
    assert.throws(() => loadConfig({ ...env, [key]: '' }), new RegExp(key));
  }
});

// Catches sending credentials to a path, embedded userinfo or insecure origin.
test('only a clean HTTPS origin is accepted', () => {
  assert.equal(
    loadConfig({ ...env, SITE_BASE_URL: 'https://example.test/' }).baseUrl,
    'https://example.test',
  );
  for (const baseUrl of [
    'http://example.test',
    'https://user:pass@example.test',
    'https://example.test/login/',
    'https://example.test?token=x',
    'https://example.test#section',
    'not a url',
  ]) {
    assert.throws(() => loadConfig({ ...env, SITE_BASE_URL: baseUrl }), /SITE_BASE_URL/);
  }
});

// Catches Boolean('false'), unbounded waits and inverted random-delay ranges.
test('browser settings are parsed and constrained', () => {
  const config = loadConfig({
    ...env,
    BROWSER_HEADLESS: 'false',
    BROWSER_TIMEOUT_MS: '1200',
    ACTION_DELAY_MIN_MS: '0',
    ACTION_DELAY_MAX_MS: '0',
  });
  assert.equal(config.headless, false);
  assert.equal(config.timeoutMs, 1200);
  assert.equal(config.minDelayMs, 0);
  assert.equal(config.maxDelayMs, 0);
  for (const [key, value] of [
    ['BROWSER_HEADLESS', 'yes'],
    ['BROWSER_TIMEOUT_MS', '0'],
    ['BROWSER_TIMEOUT_MS', '120001'],
    ['BROWSER_TIMEOUT_MS', 'NaN'],
    ['ACTION_DELAY_MIN_MS', '-1'],
    ['ACTION_DELAY_MAX_MS', '60001'],
    ['ACTION_DELAY_MIN_MS', '0.5'],
    ['ACTION_DELAY_MIN_MS', '2000'],
  ]) {
    assert.throws(() => loadConfig({ ...env, [key]: value }));
  }
});

// Catches raw or URL-encoded credentials leaking through diagnostics or summaries.
test('reporting redacts credentials and neutralizes extra lines', () => {
  const secrets = ['fixture-account', 'fixture password & value'];
  const message = `fixture-account ${encodeURIComponent(secrets[1])}\n::error::private`;
  const clean = redact(message, secrets);
  assert.ok(!clean.includes('fixture-account'));
  assert.ok(!clean.includes(encodeURIComponent(secrets[1])));
  assert.ok(!clean.includes('\n'));
  const report = formatReport(
    {
      login: 'success',
      renewals: [{ status: 'rejected', message }],
    },
    secrets,
  );
  assert.match(report, /登录成功/);
  assert.match(report, /rejected/);
  assert.ok(!report.includes(secrets[0]));
  assert.ok(!report.includes(encodeURIComponent(secrets[1])));
});

test('a run with no free servers has an explicit successful report', () => {
  assert.match(formatReport({ login: 'success', renewals: [] }), /未发现/);
});
