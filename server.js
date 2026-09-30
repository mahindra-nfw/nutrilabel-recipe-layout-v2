// Zero-dependency static server. Run: node server.js  (optional: PORT=5181)
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = +process.env.PORT || 5181;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (!p.endsWith('.html') && fs.existsSync(file) && fs.statSync(file).isDirectory()) { res.writeHead(301, { Location: p + '/' }); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': (TYPES[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`NutriLabel UI Lab running:`);
  console.log(`  Home      http://localhost:${PORT}/`);
  console.log(`  Layout A  http://localhost:${PORT}/node-graph/`);
  console.log(`  Layout B  http://localhost:${PORT}/recipe-cards/`);
});
