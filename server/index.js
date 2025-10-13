
import fs from 'fs';
import path from 'path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { loadModules } from '../utils/loadModules.js';
import { fileURLToPath } from 'url';
import net from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Setup TCP server with Express-like routing for JSON messages
 */
async function setupTCPServer(root, srcDir, port = 6001) {
  const tcpDir = path.join(root, srcDir, 'tcp');

  // Only setup TCP server if tcpDir exists
  if (!fs.existsSync(tcpDir)) {
    return null;
  }

  const tcpRoutes = new Map();

  // --- Dynamically load auth module ---
  const authModulePath = path.join(root, srcDir, 'lib', 'auth_tcp.js');
  let authFn = null;
  if (fs.existsSync(authModulePath)) {
    const { default: auth } = await import(`${authModulePath}`);
    if (typeof auth === 'function') authFn = auth;
  } else {
	console.log('[!] No auth function found in lib/auth_tcp.js');
  }

  // --- Load TCP route modules dynamically ---
  const tcpModules = fs.readdirSync(tcpDir).filter(f => f.endsWith('.js'));
  for (const modFile of tcpModules) {
    const { default: register } = await import(path.join(tcpDir, modFile));
    if (typeof register === 'function') {
      register({
        on: (route, handler) => {
		console.log('[+] TCP route ' + route + ' added from src/tcp/routes/*.js');
		return tcpRoutes.set(route, handler);
	}
      });
    }
  }

  // --- Create TCP server ---
  const tcpServer = net.createServer((socket) => {
    //console.log('New TCP connection');

    let buffer = '';
    socket.on('data', async (rawData) => {
      buffer += rawData.toString();

      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const msg = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);

        if (!msg) continue;

        try {
          const firstChar = msg[0];
          const jsonPart = msg.slice(1);

          let data = {};
          if (jsonPart.startsWith('{')) {
            data = JSON.parse(jsonPart);
          }

	  if (firstChar === 'c') {
  // authenticate
  if (!authFn || !authFn(data)) {
    const msg = JSON.stringify({ error: 'TCP auth failed, connection closed' }) + '\n';
 
    socket.write(msg);
    //console.log('TCP auth failed, waiting 1s before closing connection');

    // Wait 1 second before destroying the socket to ensure the client receives the message
    setTimeout(() => {
      socket.destroy(); // forcibly close after delay
      //console.log('TCP connection closed after auth failure');
    }, 1000);
    return;
  }

  socket.authenticated = true;
  socket.auth = data;
  socket.write(JSON.stringify({ status: 'ok', type: 'connect' }) + '\n');

          } else if (firstChar === 'q') {
            // require authentication
            if (!socket.authenticated) {
              socket.write(JSON.stringify({ error: 'Not authenticated' }) + '\n');
              continue;
            }

            const route = data.path;
            if (!route) {
              socket.write(JSON.stringify({ error: 'Missing path' }) + '\n');
              continue;
            }

            const handler = tcpRoutes.get(route);
            if (!handler) {
              socket.write(JSON.stringify({ error: `No handler for path "${route}"` }) + '\n');
              continue;
            }

            const res = await handler(socket, data);
            socket.write(JSON.stringify(res) + '\n');

          } else {
            socket.write(JSON.stringify({ error: 'Unknown message type' }) + '\n');
          }
        } catch (err) {
          console.error('TCP parse error:', err.message);
          socket.write(JSON.stringify({ error: 'Invalid JSON or format' }) + '\n');
        }
      }
    });

    socket.on('end', () => {
	    // console.log('TCP client disconnected')
    });
    socket.on('error', (err) => {
	    console.error('TCP socket error:', err);
    });
  });

  tcpServer.listen(port, () => {
    console.log(`🚀 TCP server running on tcp://localhost:${port}`);
  });

  return tcpServer;
}



export async function startDevServer({ root, srcDir, port }) {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom',
    root,
  });
  app.use(vite.middlewares);

  await loadModules(path.join(root, srcDir, 'lib'), app);
  await loadModules(path.join(root, srcDir, 'api'), app);

  // Only start TCP server if src/tcp exists
  const tcpDir = path.join(root, srcDir, 'tcp');
  if (fs.existsSync(tcpDir)) {
    await setupTCPServer(root, srcDir);
  }

  app.use(async (req, res) => {
    const url = req.originalUrl;
    const page = url === '/' ? 'index' : url.slice(1);

    try {
      let template = fs.readFileSync(path.join(root, 'index.html'), 'utf-8');
      template = await vite.transformIndexHtml(url, template);

      const { render } = await vite.ssrLoadModule('/src/entry-server.jsx');
      const extraProps = { now: new Date().toISOString() };
      const { html: appHtml, title } = await render(page, extraProps);

      let finalHtml = template.replace('<!--outlet-->', appHtml);
      finalHtml = finalHtml.replace('<title>My App</title>', `<title>${title}</title>`);

      res.status(200).set({ 'Content-Type': 'text/html' }).end(finalHtml);
    } catch (err) {
      vite.ssrFixStacktrace(err);
      console.error(err);
      res.status(500).end(err.message);
    }
  });

  app.listen(port, () => {
    console.log(`🚀 Dev server running at http://localhost:${port}`);
  });
}

export async function startProdServer({ root, srcDir, port }) {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(root, 'dist/client'), { index: false }));

  await loadModules(path.join(root, srcDir, 'lib'), app);
  await loadModules(path.join(root, srcDir, 'api'), app);

  // Only start TCP server if src/tcp exists
  const tcpDir = path.join(root, srcDir, 'tcp');
  if (fs.existsSync(tcpDir)) {
    await setupTCPServer(root, srcDir);
  }

  app.use(async (req, res) => {
    const url = req.originalUrl;
    const page = url === '/' ? 'index' : url.slice(1);

    try {
      const template = fs.readFileSync(path.join(root, 'dist/client/index.html'), 'utf-8');
      const { render } = await import(path.join(root, 'dist/server/entry-server.js'));
      const extraProps = { now: new Date().toISOString() };
      const { html: appHtml, title } = await render(page, extraProps);

      let finalHtml = template.replace('<!--outlet-->', appHtml);
      finalHtml = finalHtml.replace('<title>My App</title>', `<title>${title}</title>`);

      res.status(200).set({ 'Content-Type': 'text/html' }).end(finalHtml);
    } catch (err) {
      console.error(err);
      res.status(500).end(err.message);
    }
  });

  app.listen(port, () => {
    console.log(`🚀 Production server running at http://localhost:${port}`);
  });
}

