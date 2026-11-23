export function redact(text, secrets = []) {
  let value = String(text);
  const variants = secrets
    .filter(Boolean)
    .flatMap((secret) => [
      secret,
      encodeURIComponent(secret),
      new URLSearchParams({ value: secret }).get('value'),
      new URLSearchParams({ value: secret }).toString().slice('value='.length),
    ]);
  for (const secret of [...new Set(variants)].sort((a, b) => b.length - a.length)) {
    value = value.split(secret).join('[REDACTED]');
  }
  return value.replace(/[\r\n\u2028\u2029]/g, ' ').slice(0, 500);
}

function formatExpiryDate(value) {
  const text = String(value).trim();
  const match = text.match(
    /^(\d{4})(?:年|-)(\d{1,2})(?:月|-)(\d{1,2})日?(?:\s*[（(]?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*[）)]?)?$/,
  );
  if (!match) return text.replace(/[（(]/g, ' ').replace(/[）)]/g, '').replace(/\s+/g, ' ').trim();
  const [, year, month, day, hour, minute, second] = match;
  const date = `${year}年${Number(month)}月${Number(day)}日`;
  if (hour === undefined) return date;
  return `${date} ${hour.padStart(2, '0')}:${minute}:${second ?? '00'}`;
}

export function formatReport(result, secrets = []) {
  const lines = ['有益网络自动签到', '', '登录成功。'];
  if (result.renewals.length === 0) {
    lines.push('未发现可免费延期的挂机宝。');
  }
  result.renewals.forEach((renewal, i) => {
    lines.push(`${i + 1}. ${renewal.status}：${redact(renewal.message, secrets)}`);
    if (renewal.expiresAt) {
      lines.push(`到期时间：${formatExpiryDate(redact(renewal.expiresAt, secrets))}`);
    }
  });
  const errors = result.renewals.filter((item) => item.status === 'error').length;
  lines.push(
    '',
    errors ? `运行异常：${errors} 项技术故障。` : '运行完成，业务结果不影响工作流成功。',
  );
  return lines.join('\n');
}
