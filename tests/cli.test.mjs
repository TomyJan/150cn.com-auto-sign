import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFixture, fixtureCredentials } from './helpers/site-fixture.mjs';

async function runCli(t, options, overrides = {}) {
  const fixture = await createFixture({ ...options, secure: true });
  const directory = await mkdtemp(join(tmpdir(), '150cn-test-'));
  t.after(async () => {
    await fixture.close();
    await rm(directory, { recursive: true, force: true });
  });
  const summary = join(directory, 'summary.md');
  const child = spawn(
    process.execPath,
    ['--import', './tests/helpers/browser-test-hook.mjs', 'src/cli.mjs'],
    {
      env: {
        ...process.env,
        SITE_BASE_URL: fixture.baseUrl,
        SITE_USERNAME: fixtureCredentials.username,
        SITE_PASSWORD: fixtureCredentials.password,
        BROWSER_HEADLESS: 'true',
        BROWSER_TIMEOUT_MS: '2000',
        ACTION_DELAY_MIN_MS: '0',
        ACTION_DELAY_MAX_MS: '0',
        GITHUB_STEP_SUMMARY: summary,
        ...overrides,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  return { code, output, fixture, summary };
}

// Catches turning normal business refusals into workflow failures, and omitting the summary.
test('CLI exits zero for a business refusal and writes a safe Actions summary', async (t) => {
  const run = await runCli(t, { message: '今日已经续费过了！' });
  assert.equal(run.code, 0, run.output);
  assert.match(run.output, /already-renewed/);
  assert.equal(run.fixture.submissions.length, 1);
  const summary = await readFile(run.summary, 'utf8');
  assert.match(summary, /登录成功/);
  assert.ok(!summary.includes(fixtureCredentials.username));
  assert.ok(!summary.includes(fixtureCredentials.password));
});

test('CLI exits nonzero for a technical error after a successful login', async (t) => {
  const run = await runCli(t, { submitStatus: 500 });
  assert.equal(run.code, 1, run.output);
  assert.match(run.output, /登录成功/);
  assert.match(run.output, /运行异常/);
  assert.equal(run.fixture.submissions.length, 1);
});

for (const message of ['登录状态已失效，无法续费，请重新登录！', '网络连接超时，续费失败！']) {
  test(`CLI exits nonzero for technical response: ${message}`, async (t) => {
    const run = await runCli(t, { message });
    assert.equal(run.code, 1, run.output);
    assert.match(run.output, /登录成功/);
    assert.match(run.output, /运行异常/);
    assert.equal(run.fixture.submissions.length, 1);
  });
}

test('CLI rejects a missing secret before visiting the website', async (t) => {
  const run = await runCli(t, {}, { SITE_PASSWORD: '' });
  assert.equal(run.code, 1);
  assert.match(run.output, /SITE_PASSWORD/);
  assert.equal(run.fixture.credentials.length, 0);
});

test('CLI redacts failed login diagnostics instead of printing password-bearing Playwright errors', async (t) => {
  const password = 'SECRET that should never appear';
  const run = await runCli(t, {}, { SITE_PASSWORD: password });
  assert.equal(run.code, 1);
  assert.ok(!run.output.includes(password));
  assert.ok(!run.output.includes(fixtureCredentials.username));
  assert.equal(run.fixture.submissions.length, 0);
});
