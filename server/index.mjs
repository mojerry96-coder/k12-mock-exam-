// Production server: the built module (dist/) plus the API. `npm run build && npm start`
// Only dist/ is served; the question bank, attempts database and server source never are.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi } from './api.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mp4': 'video/mp4', '.json': 'application/json', '.txt': 'text/plain' };
const api = await createApi();
const port = Number(process.env.PORT) || 8081;

http.createServer((req, res) => {
  api(req, res, async () => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; return res.end(); }
    let rel;
    try { rel = decodeURIComponent((req.url || '/').split('?')[0]); } catch { res.statusCode = 400; return res.end(); }
    let file = path.resolve(root, '.' + (rel === '/' ? '/index.html' : rel));
    if (file !== root && !file.startsWith(root + path.sep)) { res.statusCode = 403; return res.end(); }
    let info = await stat(file).catch(() => null);
    if (!info?.isFile()) {
      // Paths without an extension are app routes; a missing file is simply missing.
      if (path.extname(rel)) { res.statusCode = 404; return res.end('Not found'); }
      file = path.join(root, 'index.html');
      info = await stat(file);
    }
    res.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', file.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600');
    res.setHeader('Accept-Ranges', 'bytes');
    // Byte ranges: Safari will not play the Fitila clips without them.
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
      if (start > end || start >= info.size) { res.statusCode = 416; res.setHeader('Content-Range', `bytes */${info.size}`); return res.end(); }
      res.statusCode = 206;
      res.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`);
      res.setHeader('Content-Length', end - start + 1);
      return req.method === 'HEAD' ? res.end() : createReadStream(file, { start, end }).pipe(res);
    }
    res.setHeader('Content-Length', info.size);
    if (req.method === 'HEAD') return res.end();
    res.end(await readFile(file));
  });
}).listen(port, '127.0.0.1', () => console.log(`Gradient Lab mock exam on http://localhost:${port}`));
