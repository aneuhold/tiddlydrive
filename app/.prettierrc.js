import { default as baseConfig } from '../.prettierrc.js';

export default {
  ...baseConfig,
  plugins: ['prettier-plugin-svelte'],
  overrides: [{ files: '*.svelte', options: { parser: 'svelte' } }]
};
