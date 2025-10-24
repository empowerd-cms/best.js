

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

/**
 * Unified TCP server: handles single-tenant default routes and multi-tenant routes dynamically
 */
export async function setupTCPServer(root, srcDir, port = 6001) {
  const routesMap = {}; // key = 'default' or tenant name -> Map(route -> handler)

  // --- Load default routes ---
  const defaultTcpDir = path.join(root, srcDir, 'tcp');
  routesMap.default = new Map();

  if (fs.existsSync(defaultTcpDir)) {
    const tcpFiles = fs.readdirSync(defaultTcpDir).filter(f => f.endsWith('.js'));
    for (const file of tcpFiles) {
      const { default: register } = await import(path.join(defaultTcpDir, file));
      if (typeof register === 'function') {
        register({
          on: (route, handler,systemName='default') => {
	      console.log(' system name',systemName);
		  if (!routesMap[systemName]) routesMap[systemName] = new Map();
            routesMap[systemName].set(route, handler);
            console.log(`[+] TCP route '${route}' loaded for system=`+systemName);
          }
        });
      }
    }
  }


  // --- Load auth function ---
  const authModulePath = path.join(root, srcDir, 'lib', 'auth_tcp.js');
  let authFn = null;
  if (fs.existsSync(authModulePath)) {
    const { default: auth } = await import(authModulePath);
    if (typeof auth === 'function') authFn = auth;
  } else {
    console.warn('[!] No auth function found in lib/auth_tcp.js');
  }

  // --- Create TCP server ---
  const tcpServer = net.createServer((socket) => {
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
          if (jsonPart.startsWith('{')) data = JSON.parse(jsonPart);

          // --- Authentication ---
          if (firstChar === 'c') {
            if (!authFn) {
              socket.write(JSON.stringify({ error: 'No auth function configured' }) + '\n');
              continue;
            }

            const authResult = await authFn(data);
            if (!authResult) {
              socket.write(JSON.stringify({ error: 'Auth failed' }) + '\n');
              setTimeout(() => socket.destroy(), 1000);
              return;
            }

            if (authResult === true) {
              // Single-tenant default
              socket.authenticated = true;
              socket.system = null;
              socket.systemRoutes = routesMap.default;
              socket.write(JSON.stringify({ status: 'ok', type: 'connect' }) + '\n');
              console.log('[✓] Authenticated default / single-tenant connection');
            } else if (authResult.system) {
              // Multi-tenant
              const tenantRoutes = routesMap[authResult.system];
              if (!tenantRoutes) {
                socket.write(JSON.stringify({ error: `No routes found for system '${authResult.system}'` }) + '\n');
                setTimeout(() => socket.destroy(), 1000);
                return;
              }

              socket.authenticated = true;
              socket.system = authResult.system;
              socket.systemRoutes = tenantRoutes;
              socket.auth = authResult;

              socket.write(JSON.stringify({ status: 'ok', type: 'connect', system: authResult.system }) + '\n');
              console.log(`[✓] Authenticated system '${authResult.system}'`);
            }
          }

          // --- Query handling ---
          else if (firstChar === 'q') {
            if (!socket.authenticated) {
              socket.write(JSON.stringify({ error: 'Not authenticated' }) + '\n');
              continue;
            }

            const { path: route } = data;
            if (!route) {
              socket.write(JSON.stringify({ error: 'Missing path' }) + '\n');
              continue;
            }

            let handler = socket.systemRoutes?.get(route);
            if (!handler && socket.system) {
              // fallback to default if tenant route not found
              handler = routesMap.default.get(route);
            }

            if (!handler) {
              const sys = socket.system || 'default';
              socket.write(JSON.stringify({ error: `No handler for path "${route}" in system "${sys}"` }) + '\n');
              continue;
            }

            const res = await handler(socket, data);
            socket.write(JSON.stringify(res) + '\n');
          } else {
            socket.write(JSON.stringify({ error: 'Unknown message type' }) + '\n');
          }
        } catch (err) {
	  console.error(err);
          console.error('Best.JS TCP parse error:', err.message);
          socket.write(JSON.stringify({ error: 'Invalid JSON or format' }) + '\n');
        }
      }
    });

    socket.on('end', () => {});
    socket.on('error', (err) => console.error('TCP socket error:', err.message));
  });

  tcpServer.listen(port, () => {
    console.log(`🚀 TCP server running on tcp://localhost:${port}`);
  });

  return tcpServer;
}



export async function startDevServer({ root, srcDir, port,tcp }) {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  await loadModules(path.join(root, srcDir, 'lib'), app);
  await loadModules(path.join(root, srcDir, 'api'), app);
  const tcpDir = path.join(root, srcDir, 'tcp');
  if (fs.existsSync(tcpDir)) {
    await setupTCPServer(root, srcDir,tcp);
  }

  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom',
    root,
  });
  app.use(vite.middlewares);
  



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

export async function startProdServer({ root, srcDir, port,tcp }) {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(root, 'dist/client'), { index: false }));

  await loadModules(path.join(root, srcDir, 'lib'), app);
  await loadModules(path.join(root, srcDir, 'api'), app);
  const tcpDir = path.join(root, srcDir, 'tcp');
  if (fs.existsSync(tcpDir)) {
    await setupTCPServer(root, srcDir,tcp);
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

