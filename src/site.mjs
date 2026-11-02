/* global document, location */
import { randomInt } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

// Only fixed diagnostic text leaves this module. Playwright errors can contain input values.
export class SiteError extends Error {}

function assertOrigin(page, config) {
  if (new URL(page.url()).origin !== config.baseUrl) {
    throw new SiteError('页面跳转到了非配置站点，已停止操作。');
  }
}

function checkResponse(response) {
  if (!response || !response.ok()) {
    throw new SiteError('站点返回 HTTP 错误或没有有效响应。');
  }
}

async function pause(config) {
  await delay(randomInt(config.minDelayMs, config.maxDelayMs + 1));
}

async function navigate(page, path, config) {
  const response = await page.goto(new URL(path, config.baseUrl).href, {
    waitUntil: 'domcontentloaded',
  });
  checkResponse(response);
  assertOrigin(page, config);
}

async function requireSession(page, config) {
  assertOrigin(page, config);
  if (!new URL(page.url()).pathname.startsWith('/manager/')) {
    throw new SiteError('登录未完成或会话已失效。');
  }
  await page.locator('a[href="/manager/logout.asp"]').first().waitFor({ state: 'attached' });
}

async function login(page, config) {
  try {
    await navigate(page, '/login/', config);
    const form = page.locator('#login_form');
    await form.locator('input[name="user"]').fill(config.username);
    await pause(config);
    await form.locator('input[name="pass"]').fill(config.password);
    await pause(config);
    const [response] = await Promise.all([
      page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          url.origin === config.baseUrl &&
          url.pathname === '/login/json/index.asp' &&
          response.request().method() === 'POST'
        );
      }),
      form.locator('#submit').click(),
    ]);
    checkResponse(response);
    // Observe the actual browser outcome instead of reading a response body
    // which Chromium may discard when the login page redirects immediately.
    await page.waitForFunction(
      () => location.pathname !== '/login/' || document.querySelector('#msg')?.textContent.trim(),
    );
    if (new URL(page.url()).pathname !== '/manager/') {
      throw new SiteError('登录失败：账号密码无效或需要额外验证。');
    }
    await page.waitForURL((url) => url.origin === config.baseUrl && url.pathname === '/manager/');
    await requireSession(page, config);
  } catch (error) {
    if (error instanceof SiteError) throw error;
    throw new SiteError('登录异常：页面结构变化、连接失败或等待超时。');
  }
}

async function discoverRenewals(page, config) {
  try {
    await navigate(page, '/manager/server/', config);
    await requireSession(page, config);
    const table = page.locator('table.manager-table');
    await table.waitFor({ state: 'visible' });
    // An unrecognized page must not be mistaken for an empty account.
    const headers = await table.locator('th').allTextContents();
    if (
      !headers.some((text) => text.includes('型号')) ||
      !headers.some((text) => text.includes('到期日期'))
    ) {
      throw new SiteError('服务器列表结构变化，无法确认免费延期目标。');
    }
    const links = await table
      .locator('a')
      .evaluateAll((anchors) =>
        anchors
          .filter(
            (a) =>
              a.textContent.trim() === '免费延期' ||
              a.getAttribute('href')?.includes('server_free_renew'),
          )
          .map((a) => a.getAttribute('href')),
      );
    const targets = new Map();
    for (const href of links) {
      const url = new URL(href, page.url());
      const id = url.searchParams.get('id');
      if (
        url.origin !== config.baseUrl ||
        url.pathname !== '/manager/server/server_free_renew.html' ||
        !/^\d+$/.test(id ?? '') ||
        url.searchParams.size !== 1 ||
        url.hash
      ) {
        throw new SiteError('免费延期链接异常，已停止操作。');
      }
      targets.set(id, url.href);
    }
    return [...targets].map(([id, url]) => ({ id, url }));
  } catch (error) {
    if (error instanceof SiteError) throw error;
    throw new SiteError('获取服务器列表异常：页面结构变化、连接失败或等待超时。');
  }
}

function classifyResult(message) {
  message = message.replace(/\s+/g, '');
  if (
    /登录|会话|身份验证|网络|连接|超时|数据库|系统(?:异常|错误|繁忙)|服务器(?:错误|异常)|程序错误/.test(
      message,
    )
  ) {
    throw new SiteError('延期响应包含认证、网络或站点技术故障。');
  }
  const beforeWindow =
    /(?:未到|尚未到|还未到|还没到)(?:免费)?(?:续费|延期|续期)(?:时间|日期|期限)/.test(message);
  const limitedWindow = /(?:仅限|只能|仅能)(?:在)?到期前\d+(?:天|小时)(?:内)?/.test(message);
  if ((beforeWindow || limitedWindow) && /续费|延期|续期/.test(message)) {
    return { status: 'rejected', message: '尚未满足站点免费延期时间条件。' };
  }
  if (/失败|不成功|未成功|无法|不能/.test(message)) {
    throw new SiteError('延期返回原因不明的失败提示，需要检查站点。');
  }
  if (/今[日天].*(已经|已).*(续费|延期)|已经.*(续费|延期).*过/.test(message)) {
    return { status: 'already-renewed', message: '今日已经续费过了。' };
  }
  if (/(延期|续费|续期).{0,8}成功|成功.{0,8}(延期|续费|续期)/.test(message)) {
    return { status: 'renewed', message: '免费延期成功。' };
  }
  throw new SiteError('无法识别延期结果，需检查站点是否改版。');
}

async function renew(page, target, config) {
  await navigate(page, target.url, config);
  await requireSession(page, config);
  const form = page.locator('form[name="autoopen"]');
  await form.waitFor({ state: 'visible' });
  const action = new URL(await form.getAttribute('action'), page.url());
  const method = (await form.getAttribute('method'))?.toLowerCase();
  const id = await form.locator('input[name="id"]').inputValue();
  const price = (await form.locator('#moneyprice').innerText()).trim();
  if (
    action.origin !== config.baseUrl ||
    action.pathname !== '/manager/server/server_free_renew_sub.asp' ||
    action.search ||
    action.hash ||
    method !== 'post' ||
    id !== target.id ||
    !/^[￥¥]?\s*0(?:\.0+)?\s*(?:元)?$/.test(price)
  ) {
    throw new SiteError('延期表单不是已确认的零费用操作，已停止提交。');
  }
  await pause(config);
  const button = form.getByRole('button', { name: /服务器延期/ });
  const submission = await button.evaluate((submitter) => {
    const owner = submitter.form;
    return {
      belongsToForm: owner === submitter.closest('form'),
      action: submitter.hasAttribute('formaction') ? submitter.formAction : owner?.action,
      method: submitter.hasAttribute('formmethod') ? submitter.formMethod : owner?.method,
      target: submitter.hasAttribute('formtarget') ? submitter.formTarget : owner?.target,
    };
  });
  if (
    !submission.belongsToForm ||
    submission.action !== action.href ||
    submission.method?.toLowerCase() !== 'post' ||
    !['', '_self'].includes(submission.target)
  ) {
    throw new SiteError('延期按钮覆盖了预期提交方式，已停止提交。');
  }
  const [response] = await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    button.click(),
  ]);
  checkResponse(response);
  assertOrigin(page, config);
  if (new URL(page.url()).pathname !== '/services/tip.html') {
    throw new SiteError('延期后未出现预期结果页，可能会话失效或站点改版。');
  }
  const message = await page.locator('.layui-layer-content').innerText();
  return classifyResult(message);
}

export async function runSite(page, config) {
  page.setDefaultTimeout(config.timeoutMs);
  page.setDefaultNavigationTimeout(config.timeoutMs);
  await login(page, config);
  const targets = await discoverRenewals(page, config);
  const renewals = [];
  for (const target of targets) {
    try {
      renewals.push(await renew(page, target, config));
    } catch (error) {
      renewals.push({
        status: 'error',
        message:
          error instanceof SiteError
            ? error.message
            : '延期操作异常：页面结构变化、连接失败或等待超时；未自动重试。',
      });
    }
  }
  return { login: 'success', renewals };
}
