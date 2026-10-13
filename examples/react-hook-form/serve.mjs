import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const file = new URL('generated/index.html', import.meta.url);
const server = createServer(async (req, res) => {
  if (req.url !== '/') { res.writeHead(404); res.end(); return; }
  try {
    const html = await readFile(file);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
  } catch {
    res.writeHead(500); res.end('Build the demo before starting the server.');
  }
});
server.listen(4177, '127.0.0.1', () => console.log('React Hook Form demo: http://127.0.0.1:4177/'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
