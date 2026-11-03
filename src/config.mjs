function required(env, name) {
  const value = env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`请配置 ${name}`);
  }
  return value;
}

function integer(env, name, fallback, min, max) {
  const raw = env[name] || String(fallback);
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} 必须是 ${min}–${max} 之间的整数`);
  }
  return value;
}

export function loadConfig(env = process.env) {
  const rawUrl = env.SITE_BASE_URL || 'https://www.150cn.com';
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('SITE_BASE_URL 必须是 HTTPS 站点根地址');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('SITE_BASE_URL 必须是无账号、路径、查询或片段的 HTTPS 站点根地址');
  }
  const headless = env.BROWSER_HEADLESS || 'true';
  if (!['true', 'false'].includes(headless)) {
    throw new Error('BROWSER_HEADLESS 必须为 true 或 false');
  }
  const minDelayMs = integer(env, 'ACTION_DELAY_MIN_MS', 500, 0, 60_000);
  const maxDelayMs = integer(env, 'ACTION_DELAY_MAX_MS', 1500, 0, 60_000);
  if (minDelayMs > maxDelayMs) {
    throw new Error('ACTION_DELAY_MIN_MS 不能大于 ACTION_DELAY_MAX_MS');
  }
  return {
    baseUrl: url.origin,
    username: required(env, 'SITE_USERNAME'),
    password: required(env, 'SITE_PASSWORD'),
    headless: headless === 'true',
    timeoutMs: integer(env, 'BROWSER_TIMEOUT_MS', 30_000, 1000, 120_000),
    minDelayMs,
    maxDelayMs,
  };
}
