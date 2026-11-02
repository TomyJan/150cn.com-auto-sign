import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import { once } from 'node:events';
import { generate } from 'selfsigned';

export const fixtureCredentials = { username: 'test-user', password: 'test-password & value' };

const shell = (body) => `<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><body>
<a href="/manager/logout.asp">退出</a>${body}</body></html>`;

export async function createFixture(options = {}) {
  const submissions = [];
  const credentials = [];
  const handler = async (req, res) => {
    const url = new URL(req.url, 'http://fixture.test');
    const reply = (body, status = 200, headers = {}) => {
      res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', ...headers });
      res.end(body);
    };
    const redirect = (path) => reply('', 302, { location: path });
    if (url.pathname === '/login/') {
      return reply(`<!doctype html><meta charset="UTF-8"><form hidden>
        <input name="user"><input name="pass"></form>
        <form id="login_form" onsubmit="return false">
        <input name="user"><input name="pass" type="password">
        <button id="submit">登录</button><div id="msg"></div></form>
        <script>document.querySelector('#submit').onclick = async () => {
          const result = await fetch('/login/json/index.asp', { method:'POST',
            body: new URLSearchParams(new FormData(document.querySelector('#login_form'))) });
          const data = await result.json();
          if (data.code === 200) location.href='/manager/';
          else if (data.code === 501) location.href='/login/duo/';
          else document.querySelector('#msg').textContent = data.msg;
        };</script>`);
    }
    if (url.pathname === '/login/json/index.asp' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const form = new URLSearchParams(body);
      credentials.push({ username: form.get('user'), password: form.get('pass') });
      const valid =
        form.get('user') === fixtureCredentials.username &&
        form.get('pass') === fixtureCredentials.password;
      const code = options.challenge ? 501 : valid ? 200 : 400;
      return reply(JSON.stringify({ code, msg: '账号或密码错误' }), 200, {
        'set-cookie': valid ? 'session=fixture; Path=/; HttpOnly' : 'session=; Path=/',
      });
    }
    if (url.pathname === '/login/duo/') return reply('需要额外验证');
    if (!req.headers.cookie?.includes('session=fixture')) return redirect('/login/');
    if (url.pathname === '/manager/') {
      return reply(options.fakeLogin ? '欢迎' : shell('用户管理中心'));
    }
    if (url.pathname === '/manager/server/') {
      if (options.listStatus) return reply('server error', options.listStatus);
      if (options.expired) return redirect('/login/');
      if (options.brokenList) return reply(shell('未知页面'));
      const ids = options.ids ?? ['101'];
      return reply(
        shell(`<table class="manager-table"><tr><th>型号</th><th>到期日期</th>
        <th>管理</th></tr>${ids
          .map(
            (id) => `<tr><td>挂机宝免费版</td><td>2026-11-05</td><td>
        <a href="${options.link ?? `server_free_renew.html?id=${id}`}">免费延期</a>
        <a href="server_renew.html?id=${id}">付费续费</a></td></tr>`,
          )
          .join('')}</table>`),
      );
    }
    if (url.pathname === '/manager/server/server_free_renew.html') {
      if (options.formStatus) return reply('error', options.formStatus);
      if (options.formExpired) return redirect('/login/');
      const id = url.searchParams.get('id');
      return reply(
        shell(`<form name="autoopen" method="post" action="${options.action ?? 'server_free_renew_sub.asp'}">
        <div class="manager-title">免费版延期</div>
        <span id="moneyprice">${options.price ?? '￥0.0'}</span>
        <input type="hidden" name="id" value="${options.hiddenId ?? id}">
        <input type="submit" id="submit" value="\u3000服务器延期\u3000" ${options.buttonAttributes ?? ''}></form>`),
      );
    }
    if (req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const id = new URLSearchParams(body).get('id');
      submissions.push({ path: url.pathname, id });
      if (options.submitStatus) return reply('server error', options.submitStatus);
      if (options.submitExpired) return redirect('/login/');
      if (options.unknownResult) return reply(shell('未知页面'));
      if (options.noResponse) return; // Response timeout: the POST must never be retried.
      return redirect(`/services/tip.html?id=${id}`);
    }
    if (url.pathname === '/services/tip.html') {
      const id = url.searchParams.get('id');
      const message = options.results?.[id] ?? options.message ?? '今日已经续费过了！';
      return reply(`<meta charset="UTF-8"><div class="layui-layer-content">${message}</div>`);
    }
    return reply('not found', 404);
  };
  const server = options.secure
    ? createSecureServer(
        await generate([{ name: 'commonName', value: 'localhost' }], {
          days: 1,
          extensions: [{ name: 'subjectAltName', altNames: [{ type: 7, ip: '127.0.0.1' }] }],
        }).then(({ private: key, cert }) => ({ key, cert })),
        handler,
      )
    : createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    baseUrl: `${options.secure ? 'https' : 'http'}://127.0.0.1:${server.address().port}`,
    submissions,
    credentials,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
