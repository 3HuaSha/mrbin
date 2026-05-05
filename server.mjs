import { createServer } from 'node:http';
import handler from './dist/server/server.js';

const port = process.env.PORT || 3000;

const server = createServer(async (req, res) => {
  try {
    // 创建一个 Request 对象
    const url = `http://${req.headers.host}${req.url}`;
    
    // 收集请求体
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = chunks.length > 0 ? Buffer.concat(chunks) : null;
    
    // 创建 Fetch API Request
    const request = new Request(url, {
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
    res.end('Internal Server Error');
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Server listening on http://0.0.0.0:${port}`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
