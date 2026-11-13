import { appendFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { loadConfig } from './config.mjs';
import { formatReport, redact } from './report.mjs';
import { runSite, SiteError } from './site.mjs';
import { notifyTelegram } from './telegram.mjs';

let browser;
let report;
let config;
try {
  config = loadConfig();
} catch (error) {
  report = `配置错误：${error.message}`;
  process.exitCode = 1;
}

if (config) {
  const secrets = [
    config.username,
    config.password,
    process.env.TELEGRAM_BOT_TOKEN,
    process.env.TELEGRAM_CHAT_ID,
  ];
  try {
    browser = await chromium.launch({ headless: config.headless });
    const context = await browser.newContext({
      locale: 'zh-CN',
      viewport: { width: 1366, height: 900 },
    });
    const page = await context.newPage();
    const result = await runSite(page, config);
    report = formatReport(result, secrets);
    if (result.renewals.some((renewal) => renewal.status === 'error')) process.exitCode = 1;
  } catch (error) {
    report = `运行失败：${redact(
      error instanceof SiteError
        ? error.message
        : '浏览器运行异常，请检查浏览器安装、网络和运行环境。',
      secrets,
    )}`;
    process.exitCode = 1;
  } finally {
    try {
      await browser?.close();
    } catch {
      report += '\n浏览器关闭异常。';
      process.exitCode = 1;
    }
  }
}

console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) {
  try {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${report}\n`, 'utf8');
  } catch {
    report += '\n无法写入 Actions 运行摘要。';
    console.error('无法写入 Actions 运行摘要。');
    process.exitCode = 1;
  }
}

try {
  const notification = await notifyTelegram(report, { success: process.exitCode !== 1 });
  if (notification.status === 'sent') console.log('Telegram 推送成功。');
} catch (error) {
  // Preserve the website's exit code so notification failures cannot cause repeat submissions.
  console.error(error.message);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n${error.message}\n`, 'utf8').catch(
      () => {},
    );
  }
}
