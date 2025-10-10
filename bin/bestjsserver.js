#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { startDevServer, startProdServer } from '../server/index.js';

const cwd = process.cwd();

// --------------------
// CLI argument parser
// --------------------
const args = process.argv.slice(2);
let mode = null;        // dev or prod
let port = null;
let srcDir = 'src';
let forceBuild = false;
let init = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--dev') mode = 'dev';
  else if (arg === '--prod') mode = 'prod';
  else if (arg === '--port') port = parseInt(args[i + 1]), i++;
  else if (arg === '--src') srcDir = args[i + 1], i++;
  else if (arg === '--build') forceBuild = true;
  else if (arg === '--init') init = true;
}

// --------------------
// 0️⃣ INIT command
// --------------------
// --------------------
// 0️⃣ INIT command
// --------------------
if (init) {
  console.log('⚡ Initializing new project...');

  // 0️⃣ package.json (unchanged)
  const pkgFile = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgFile)) {
    const pkgContent = {
  name: path.basename(cwd),
  version: "1.0.0",
  description: "Simple React SSR with Vite and Express",
  type: "module",
  scripts: {
    dev: "node server-dev.js",
    "build:client": "vite build --outDir dist/client",
    "build:server": "vite build --ssr src/entry-server.jsx --outDir dist/server",
    build: "npm run build:client && npm run build:server",
    serve: "node server-prod.js"
  },
  dependencies: {
    express: "^5.1.0",
    react: "^19.2.0",
    "react-dom": "^19.2.0"
  },
  devDependencies: {
    "@vitejs/plugin-react": "^5.0.4",
    vite: "^7.1.9"
  }
};

    fs.writeFileSync(pkgFile, JSON.stringify(pkgContent, null, 2));
    console.log('📦 package.json created');
  }

  // Create src folder
  const srcPath = path.join(cwd, 'src');
  if (!fs.existsSync(srcPath)) fs.mkdirSync(srcPath);


  // entry-server.jsx
  
  const entryServerFile = path.join(srcPath, 'entry-server.jsx');
  if (!fs.existsSync(entryServerFile)) {
    fs.writeFileSync(entryServerFile, `
  // src/entry-server.jsx
import { renderToString } from 'react-dom/server';

export async function render(page) {
  // Dynamically import the page component
  try {
    const mod = await import(\`./pages/\${page}.jsx\`);
    const Page = mod.default;
    return renderToString(<Page />);
  } catch (err) {
    // Fallback if page not found
    const fallback = await import('./app.jsx');
    const Fallback = fallback.default;
    return renderToString(<Fallback />);
  }
}
`);
}

  // entry-client.jsx
  const entryClientFile = path.join(srcPath, 'entry-client.jsx');
  if (!fs.existsSync(entryClientFile)) {
    fs.writeFileSync(entryClientFile, `
  
  import React from 'react';
import { hydrateRoot } from 'react-dom/client';

// Dynamically import all pages
const pages = import.meta.glob('./pages/*.jsx');

// Determine current page from URL
const path = window.location.pathname.slice(1) || 'index';
const loader = pages[\`./pages/${path}.jsx\`];

if (loader) {
  loader().then((mod) => {
    hydrateRoot(document.getElementById('app'), <mod.default />);
  });
} else {
  // Fallback to App if page not found
  import('./app.jsx').then((mod) => {
    hydrateRoot(document.getElementById('app'), <mod.default />);
  });
}
`);
}

  // app.jsx
  const appFile = path.join(srcPath, 'app.jsx');
  if (!fs.existsSync(appFile)) {
    fs.writeFileSync(appFile, `import React, { useState } from 'react';

const App = () => {
  const [count, setCount] = useState(0);
  return (
    <main>
      <h1>App</h1>
      <p>Hello SSR + Vite!</p>
      <div>
        <div>{count}</div>
        <button onClick={() => setCount(count + 1)}>Increment</button>
      </div>
    </main>
  );
};

export default App;
`);
  }



  // index.html (unchanged)
  const indexFile = path.join(cwd, 'index.html');
  if (!fs.existsSync(indexFile)) {
    fs.writeFileSync(indexFile, `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Simple React SSR Vite</title>
  </head>
  <body>
    <div id="app"><!--outlet--></div>
    <script type="module" src="/src/entry-client.jsx"></script>
  </body>
</html>
`);
  }

  // vite.config.js (unchanged)
  const viteFile = path.join(cwd, 'vite.config.js');
  if (!fs.existsSync(viteFile)) {
    fs.writeFileSync(viteFile, `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
`);
  }

  // Install dependencies
  try {
    console.log('📦 Installing dependencies with bun...');
    execSync('bun install', { stdio: 'inherit', cwd });
  } catch {
    console.log('⚠️ Bun not found, falling back to npm install...');
    execSync('npm install', { stdio: 'inherit', cwd });
  }

  console.log('✅ Project initialized!');
  process.exit(0);
}


// --------------------
// 1️⃣ Default mode
// --------------------
if (!mode) {
  mode = 'dev';       // default to dev
}

if (!port) port = mode === 'dev' ? 4173 : 5173;

// --------------------
// 2️⃣ Auto-build for prod if needed
// --------------------
const distClient = path.join(cwd, 'dist/client');
const distServer = path.join(cwd, 'dist/server');

if (mode === 'prod' && (forceBuild || !fs.existsSync(distClient) || !fs.existsSync(distServer))) {
  console.log('🚧 Building client and server bundles...');
  try {
    execSync('npm run build:client', { stdio: 'inherit', cwd });
    execSync('npm run build:server', { stdio: 'inherit', cwd });
    console.log('✅ Build complete!');
  } catch (err) {
    console.error('❌ Build failed:', err);
    process.exit(1);
  }
}

// --------------------
// 3️⃣ Start server
// --------------------
if (mode === 'dev') {
  startDevServer({ root: cwd, srcDir, port });
} else {
  startProdServer({ root: cwd, srcDir, port });
}

