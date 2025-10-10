import fs from 'fs';
import path from 'path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { loadModules } from '../utils/loadModules.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function startDevServer({ root, srcDir, port }) {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'custom', root });
  app.use(vite.middlewares);

  await loadModules(path.join(root, srcDir, 'lib'), app);
  await loadModules(path.join(root, srcDir, 'api'), app);

  app.use(async (req, res) => {
    const url = req.originalUrl;
    const page = url === '/' ? 'index' : url.slice(1);

    try {
      let template = fs.readFileSync(path.join(root, 'index.html'), 'utf-8');
      template = await vite.transformIndexHtml(url, template);

      const { render } = await vite.ssrLoadModule('/src/entry-server.jsx');

      // Example of global props
      const extraProps = { now: new Date().toISOString() };

      // Call updated render() that returns { html, title }
      const { html: appHtml, title } = await render(page, extraProps);

      // Inject app HTML and title
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

  app.use(async (req, res) => {
    const url = req.originalUrl;
    const page = url === '/' ? 'index' : url.slice(1);

    try {
      const template = fs.readFileSync(path.join(root, 'dist/client/index.html'), 'utf-8');
      const { render } = await import(path.join(root, 'dist/server/entry-server.js'));

      const extraProps = { now: new Date().toISOString() };

      // Updated render() call
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

