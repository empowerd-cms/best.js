#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { startDevServer, startProdServer } from '../server/index.js';

import { fileURLToPath } from 'url';

// Fix __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  
  const stylesPath = path.join(cwd, 'src/styles');
  if (!fs.existsSync(stylesPath)) fs.mkdirSync(stylesPath);




const folderPath = path.join(__dirname, 'default-files');


// Read file contents
const viteConfigJs = fs.readFileSync(path.join(folderPath, 'vite.config.js'), 'utf-8');
const appJsx = fs.readFileSync(path.join(folderPath, 'app.jsx'), 'utf-8');
const entryClient = fs.readFileSync(path.join(folderPath, 'entry-client.jsx'), 'utf-8');
const entryServer = fs.readFileSync(path.join(folderPath, 'entry-server.jsx'), 'utf-8');
const indexHtml= fs.readFileSync(path.join(folderPath, 'index.html'), 'utf-8');
const stylesCss= fs.readFileSync(path.join(folderPath, 'styles/global.css'), 'utf-8');

// global.css
  const stylesCssFile = path.join(srcPath, 'styles/global.css');
  if (!fs.existsSync(stylesCssFile)) {
    fs.writeFileSync(stylesCssFile, stylesCss);
}


  // entry-server.jsx
  
  const entryServerFile = path.join(srcPath, 'entry-server.jsx');
  if (!fs.existsSync(entryServerFile)) {
    fs.writeFileSync(entryServerFile, entryServer);
}

  // entry-client.jsx
  const entryClientFile = path.join(srcPath, 'entry-client.jsx');
  if (!fs.existsSync(entryClientFile)) {
    fs.writeFileSync(entryClientFile, entryClient);
}

  // app.jsx
  const appFile = path.join(srcPath, 'app.jsx');
  if (!fs.existsSync(appFile)) {
    fs.writeFileSync(appFile, appJsx);
  }



  // index.html (unchanged)
  const indexFile = path.join(cwd, 'index.html');
  if (!fs.existsSync(indexFile)) {
    fs.writeFileSync(indexFile, indexHtml);
  }

  // vite.config.js (unchanged)
  const viteFile = path.join(cwd, 'vite.config.js');
  if (!fs.existsSync(viteFile)) {
    fs.writeFileSync(viteFile, viteConfigJs);
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

