// src/utils/loadModules.js
import fs from 'fs';
import path from 'path';

/**
 * Dynamically load modules from a folder.
 * If the module exports a default function, call it with `app` (Express).
 * @param {string} dir - Directory to load
 * @param {Express.Application} app - Express app
 */
export async function loadModules(dir, app) {
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js') || f.endsWith('.ts'));
  for (const file of files) {
    const modPath = path.join(dir, file);
    const mod = await import(modPath);
    if (typeof mod.default === 'function') {
      mod.default(app); // register API or lib
    }
  }
}

/**
 * Helper to load /lib and /api directories together
 */
export async function loadAppModules(app, rootDir) {
  await loadModules(path.join(rootDir, 'src/lib'), app);
  await loadModules(path.join(rootDir, 'src/api'), app);
}

