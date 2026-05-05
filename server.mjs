import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from './dist/server/server.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const port = process.env.PORT || 3000;
const clientDir = join(__dirname, 'dist/client');

// MIME types
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.webp': 'image/webp',
};

async function serveStaticFile(pathname, res) {
  try {
    const filePath = join(clientDir, pathname);
    
    // 安全检查：确保文件在 clientDir 内
    if (!filePath.startsWith(clientDir)) {
      return false;
    }
    
    const stats = await stat(filePath);
    if (!stats.isFile()) {
      return false;
    }
    
    const content = await readFile(filePath);
    const ext = extname(pathname);
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': content.length,
      'Cache-Control': pathname.startsWith('/assets/') 
        ? 'public, max-age=31536000, immutable' 
        : 'public, max-age=0, must-revalidate',
    });
    res.end(content);
    return true;
  } catch (err) {
    return false;
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    
    console.log(`${req.method} ${pathname}`);
    
    // 尝试提供静态文件
    // 1. /assets/* 路径
    // 2. favicon.ico
    // 3. 其他可能的静态资源
    if (pathname.startsWith('/assets/') || 
        pathname === '/favicon.ico' ||
        pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|webp)$/)) {
      const served = await serveStaticFile(pathname, res);
      if (served) {
        return;
      }
    }
    
    // 收集请求体
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = chunks.length > 0 ? Buffer.concat(chunks) : null;
    
    // 创建 Fetch API Request
    const request = new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method,
      headers: req.headers,
      body: body && req.method !== 'GET' && req.method !== 'HEAD' ? body : null,
    });
    
    // 调用 TanStack Start handler
    const response = await handler.fetch(request);
    
    // 设置响应头
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    
    // 发送响应体
    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }
    
    res.end();
  } catch (error) {
    console.error('Server error:', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Internal Server Error: ' + error.message);
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Server listening on http://0.0.0.0:${port}`);
  console.log(`📁 Serving static files from: ${clientDir}`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
