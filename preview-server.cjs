const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const routes = {
  '/': ['preview/index.html', 'text/html; charset=utf-8'],
  '/native.css': ['preview/native.css', 'text/css; charset=utf-8'],
  '/theme-fixed.css': ['theme-fixed.css', 'text/css; charset=utf-8'],
  '/video.mp4': ['assets/zipzip-1080p.mp4', 'video/mp4'],
};
http.createServer((req, res) => {
  const route = routes[new URL(req.url, 'http://127.0.0.1').pathname];
  if (!route) { res.writeHead(404); res.end(); return; }
  const file = path.join(__dirname, route[0]);
  let size;
  try { size = fs.statSync(file).size; }
  catch { res.writeHead(404); res.end('Preview asset unavailable'); return; }
  const range = req.headers.range && /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
  let start = 0, end = size - 1;
  if (range) {
    start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), size - 1) : end;
    if (start > end || start >= size) { res.writeHead(416); res.end(); return; }
  }
  res.writeHead(range ? 206 : 200, {
    'Content-Type': route[1], 'Content-Length': end - start + 1,
    'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store',
    ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
  });
  if (req.method === 'HEAD') { res.end(); return; }
  const stream = fs.createReadStream(file, { start, end });
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}).listen(8831, '127.0.0.1', () => console.log('Theme preview: http://127.0.0.1:8831'));
