import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { runSite } from '../src/site.mjs';
import { createFixture, fixtureCredentials } from './helpers/site-fixture.mjs';

let browser;
before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
});

async function visit(t, options = {}, overrides = {}) {
  const fixture = await createFixture(options);
  const context = await browser.newContext();
  t.after(async () => {
    await context.close();
    await fixture.close();
  });
  const page = await context.newPage();
  const submissionRequests = [];
  context.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== fixture.baseUrl || url.pathname.endsWith('_sub.asp')) {
      submissionRequests.push({ url: request.url(), method: request.method() });
    }
  });
  const config = {
    ...fixtureCredentials,
    baseUrl: fixture.baseUrl,
    timeoutMs: 1200,
    minDelayMs: 0,
    maxDelayMs: 0,
    ...overrides,
  };
  return { fixture, submissionRequests, result: () => runSite(page, config) };
}

// Catches filling the decoy form, hardcoded IDs and treating a business rejection as a failure.
test('logs in with supplied credentials and submits a discovered free renewal', async (t) => {
  const { fixture, result } = await visit(t);
  const actual = await result();
  assert.equal(actual.login, 'success');
  assert.deepEqual(
    actual.renewals.map((r) => r.status),
    ['already-renewed'],
  );
  assert.deepEqual(fixture.credentials, [fixtureCredentials]);
  assert.deepEqual(fixture.submissions, [
    { path: '/manager/server/server_free_renew_sub.asp', id: '101' },
  ]);
});

for (const [message, status] of [
  ['服务器延期成功！', 'renewed'],
  ['今日已经续费过了！', 'already-renewed'],
  ['未到续费时间，暂时不能延期！', 'rejected'],
  ['延期仅限到期前1天内办理，暂时不能延期！', 'rejected'],
]) {
  test(`business response: ${message} completes normally`, async (t) => {
    const { result } = await visit(t, { message });
    const actual = await result();
    assert.equal(actual.renewals[0].status, status);
  });
}

test('an authenticated empty server list succeeds without submitting anything', async (t) => {
  const { fixture, result } = await visit(t, { ids: [] });
  assert.deepEqual((await result()).renewals, []);
  assert.equal(fixture.submissions.length, 0);
});

test('duplicate links submit once and all distinct servers are handled', async (t) => {
  const { fixture, result } = await visit(t, { ids: ['713', '713', '825'] });
  assert.equal((await result()).renewals.length, 2);
  assert.deepEqual(
    fixture.submissions.map((s) => s.id),
    ['713', '825'],
  );
});

test('a technical failure on one server does not skip the next server', async (t) => {
  const { fixture, result } = await visit(t, {
    ids: ['713', '825'],
    results: { 713: '未知内容', 825: '服务器延期成功！' },
  });
  assert.deepEqual(
    (await result()).renewals.map((r) => r.status),
    ['error', 'renewed'],
  );
  assert.deepEqual(
    fixture.submissions.map((s) => s.id),
    ['713', '825'],
  );
});

for (const [name, options, config] of [
  ['invalid credentials', {}, { password: 'wrong' }],
  ['additional verification', { challenge: true }],
  ['a fake successful login without an authenticated marker', { fakeLogin: true }],
  ['a broken server list', { brokenList: true }],
  ['an expired session on the list', { expired: true }],
  ['a server list HTTP failure', { listStatus: 503 }],
  [
    'an off-origin renewal link',
    { link: 'https://other.test/manager/server/server_free_renew.html?id=101' },
  ],
  ['a paid renewal link disguised as free', { link: 'server_renew.html?id=101' }],
]) {
  test(`${name} fails before any renewal submission`, async (t) => {
    const { fixture, result } = await visit(t, options, config);
    await assert.rejects(result);
    assert.equal(fixture.submissions.length, 0);
  });
}

for (const [name, options] of [
  ['a non-zero price', { price: '￥5.0' }],
  ['a missing price', { price: '' }],
  ['an ambiguous zero price', { price: '￥0.0 + 5元' }],
  ['a paid form action', { action: 'server_renew_sub.asp' }],
  ['an off-origin form action', { action: 'https://other.test/submit' }],
  ['a mismatched form ID', { hiddenId: '999' }],
  ['an expired session on the form', { formExpired: true }],
  ['a form HTTP error', { formStatus: 500 }],
  [
    'a button overriding to a paid action',
    { buttonAttributes: 'formaction="server_renew_sub.asp"' },
  ],
  [
    'a button overriding to an external action',
    { buttonAttributes: 'formaction="https://other.test/submit"' },
  ],
  ['a button overriding the method', { buttonAttributes: 'formmethod="get"' }],
  ['a button overriding the target', { buttonAttributes: 'formtarget="_blank"' }],
]) {
  test(`${name} is a technical error and never submits`, async (t) => {
    const { fixture, submissionRequests, result } = await visit(t, options);
    assert.equal((await result()).renewals[0].status, 'error');
    assert.equal(fixture.submissions.length, 0);
    assert.equal(submissionRequests.length, 0);
  });
}

test('a button explicitly preserving the free action and POST method still works', async (t) => {
  const { fixture, result } = await visit(t, {
    buttonAttributes: 'formaction="server_free_renew_sub.asp" formmethod="post" formtarget="_self"',
  });
  assert.equal((await result()).renewals[0].status, 'already-renewed');
  assert.equal(fixture.submissions.length, 1);
});

for (const [name, options] of [
  ['HTTP 500', { submitStatus: 500 }],
  ['expired session', { submitExpired: true }],
  ['unknown result page', { unknownResult: true }],
  ['unknown business message', { message: '数据库出现异常' }],
  ['an expired-login message', { message: '登录状态已失效，无法续费，请重新登录！' }],
  ['a network-failure message', { message: '网络连接超时，续费失败！' }],
  ['an ambiguous failure message', { message: '延期失败，请联系管理员！' }],
  ['a negated success message', { message: '延期不成功，请联系管理员！' }],
  ['response timeout', { noResponse: true }],
]) {
  test(`${name} after submitting remains an error and is not retried`, async (t) => {
    const { fixture, result } = await visit(t, options);
    assert.equal((await result()).renewals[0].status, 'error');
    assert.equal(fixture.submissions.length, 1);
  });
}
