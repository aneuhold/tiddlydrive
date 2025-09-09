#!/usr/bin/env node
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const root = resolve(process.cwd());
const outdir = resolve(root, 'app/dist');
mkdirSync(outdir, { recursive: true });

const define = {
  'process.env.TD2_GOOGLE_CLIENT_ID': JSON.stringify(process.env.TD2_GOOGLE_CLIENT_ID || '')
};

const watch = process.argv.includes('--watch');

async function run() {
  try {
    await build({
      entryPoints: ['app/src/main.js'],
      bundle: true,
      format: 'esm',
      target: ['es2020'],
      sourcemap: true,
      outdir,
      define,
      chunkNames: 'chunks/[name]-[hash]',
      assetNames: 'assets/[name]-[hash]',
      entryNames: '[name]-[hash]',
      minify: true,
      incremental: watch,
      logLevel: 'info'
    });
    if (!process.env.TD2_GOOGLE_CLIENT_ID) {
      console.warn('\n[warn] TD2_GOOGLE_CLIENT_ID not set. The app will not authenticate properly until provided.');
    }
  } catch (e) {
    console.error('[build error]', e);
    process.exit(1);
  }
}

run();
