import assert from 'node:assert/strict';
import { test } from 'node:test';
import { request } from 'playwright';
import { notifyTelegram } from '../src/telegram.mjs';
import { createTelegramFixture } from './helpers/telegram-fixture.mjs';

const env = {
  TELEGRAM_BOT_TOKEN: '123456:fixture-token',
  TELEGRAM_CHAT_ID: '-100123456',
  SITE_USERNAME: 'fixture-user',
  SITE_PASSWORD: 'fixture password & value',
};

function localContext(url) {
  return async (options) => {
    const context = await request.newContext(options);
    const post = context.post.bind(context);
    context.post = (target, data) => post(`${url}${new URL(target).pathname}`, data);
    return context;
  };
}

// Catches omitting notifications or leaking credentials into the actual HTTP payload.
test('sends the run result as plain text with secrets redacted', async (t) => {
  const fixture = await createTelegramFixture(t);
  const result = await notifyTelegram(
    `登录成功。\n今日已经续费过了！\n${Object.values(env).join(' ')}\n${encodeURIComponent(env.SITE_PASSWORD)}`,
    { env, success: true, createContext: localContext(fixture.url) },
  );
  assert.equal(result.status, 'sent');
  assert.equal(fixture.messages.length, 1);
  const message = fixture.messages[0];
  assert.equal(message.path, '/bot123456:fixture-token/sendMessage');
  assert.equal(message.method, 'POST');
  assert.equal(message.data.chat_id, env.TELEGRAM_CHAT_ID);
  assert.match(message.data.text, /150cn/);
  assert.match(message.data.text, /✅/);
  assert.match(message.data.text, /登录成功/);
  assert.match(message.data.text, /今日已经续费/);
  assert.equal(message.data.parse_mode, undefined);
  assert.deepEqual(message.data.link_preview_options, { is_disabled: true });
  for (const secret of [...Object.values(env), encodeURIComponent(env.SITE_PASSWORD)]) {
    assert.ok(!message.data.text.includes(secret));
  }
});

test('sends technical failures with failure status', async (t) => {
  const fixture = await createTelegramFixture(t);
  await notifyTelegram('运行失败：登录异常。', {
    env,
    success: false,
    createContext: localContext(fixture.url),
  });
  assert.match(fixture.messages[0].data.text, /❌/);
  assert.match(fixture.messages[0].data.text, /登录异常/);
});

test('Telegram is optional but a partial configuration is reported', async () => {
  assert.equal((await notifyTelegram('正常结果', { env: {} })).status, 'disabled');
  await assert.rejects(
    notifyTelegram('正常结果', { env: { TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN } }),
    /TELEGRAM_CHAT_ID/,
  );
});

for (const response of [
  { status: 403, body: { ok: false, description: env.TELEGRAM_BOT_TOKEN } },
  { body: { ok: false, description: env.SITE_PASSWORD } },
  { body: 'not JSON' },
]) {
  test(`rejects failed Telegram responses safely: ${JSON.stringify(response)}`, async (t) => {
    const fixture = await createTelegramFixture(t, response);
    await assert.rejects(
      notifyTelegram('运行结果', { env, createContext: localContext(fixture.url) }),
      (error) => {
        assert.match(error.message, /Telegram/);
        for (const secret of Object.values(env)) assert.ok(!error.message.includes(secret));
        return true;
      },
    );
    assert.equal(fixture.messages.length, 1, 'notification failure must not retry POST');
  });
}

test('network errors never expose the request URL or proxy credentials', async () => {
  await assert.rejects(
    notifyTelegram('运行结果', {
      env,
      createContext: async () => {
        throw new Error(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`);
      },
    }),
    (error) => /Telegram/.test(error.message) && !error.message.includes(env.TELEGRAM_BOT_TOKEN),
  );
});

test('long reports fit the Telegram limit without losing the outcome', async (t) => {
  const fixture = await createTelegramFixture(t);
  await notifyTelegram(Array(100).fill('免费延期成功。'.repeat(20)).join('\n'), {
    env,
    success: true,
    createContext: localContext(fixture.url),
  });
  assert.equal(fixture.messages.length, 1);
  assert.ok(fixture.messages[0].data.text.length <= 4096);
  assert.match(fixture.messages[0].data.text, /完整结果/);
});
