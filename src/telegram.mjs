import { request } from 'playwright';
import { redact } from './report.mjs';

export async function notifyTelegram(
  report,
  {
    env = process.env,
    success = false,
    createContext = (options) => request.newContext(options),
  } = {},
) {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  if (!token && !chatId) return { status: 'disabled' };
  if (!token || !chatId) {
    throw new Error('Telegram 推送失败：请同时配置 TELEGRAM_BOT_TOKEN 和 TELEGRAM_CHAT_ID。');
  }

  const secrets = [env.SITE_USERNAME, env.SITE_PASSWORD, token, chatId];
  const safeReport = String(report)
    .split('\n')
    .map((line) => redact(line, secrets))
    .join('\n');
  let text = [
    '📋 150cn 有益网络自动签到结果',
    '',
    `状态：${success ? '✅ 运行成功' : '❌ 运行异常'}`,
    '',
    safeReport,
  ].join('\n');
  // One bounded message: notification retries must never trigger another renewal.
  if (text.length > 4096) text = `${text.slice(0, 4000)}\n…（完整结果见运行日志）`;

  let context;
  try {
    let proxy;
    if (env.TELEGRAM_PROXY_URL?.trim()) {
      const url = new URL(env.TELEGRAM_PROXY_URL);
      if (!['http:', 'https:', 'socks5:'].includes(url.protocol)) throw new Error();
      proxy = {
        server: `${url.protocol}//${url.host}`,
        username: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
      };
    }
    // Isolated from the website's cookies, browser session and proxy settings.
    context = await createContext({ timeout: 20_000, proxy });
    const response = await context.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      data: { chat_id: chatId, text, link_preview_options: { is_disabled: true } },
      maxRedirects: 0,
      maxRetries: 0,
    });
    if (!response.ok() || (await response.json()).ok !== true) throw new Error();
    return { status: 'sent' };
  } catch {
    // API / Playwright errors may contain the bot-token URL or proxy credentials.
    throw new Error('Telegram 推送失败：请检查通知配置、代理和网络；未自动重试。');
  } finally {
    await context?.dispose().catch(() => {});
  }
}
