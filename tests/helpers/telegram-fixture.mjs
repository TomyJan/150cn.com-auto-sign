import { createServer } from 'node:http';
import { once } from 'node:events';

export async function createTelegramFixture(t, { status = 200, body = { ok: true } } = {}) {
  const messages = [];
  const server = createServer(async (req, res) => {
    let payload = '';
    for await (const chunk of req) payload += chunk;
    messages.push({ path: req.url, method: req.method, data: JSON.parse(payload) });
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { url: `http://127.0.0.1:${server.address().port}`, messages };
}
