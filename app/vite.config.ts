import { enhancedImages } from '@sveltejs/enhanced-img';
import { sveltekit } from '@sveltejs/kit/vite';
import path from 'path';
import { defineConfig } from 'vite';
import { defineConfig as vitestDefineConfig } from 'vitest/config';

const viteConfig = defineConfig({
  plugins: [enhancedImages(), sveltekit()],
  resolve: {
    alias: {
      src: path.resolve('./src')
    },
    conditions: process.env.VITEST ? ['browser'] : undefined
  }
});

const vitestConfig = vitestDefineConfig({
  test: {
    exclude: ['node_modules/**/*'],
    globals: true,
    environment: 'jsdom'
  }
});

export default {
  ...viteConfig,
  ...vitestConfig
};
