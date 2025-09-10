import svelteConfig from '@aneuhold/eslint-config/src/svelte-config.js';

/** @type {import('@typescript-eslint/utils').TSESLint.FlatConfig.ConfigArray} */
export default [
  ...svelteConfig,
  {
    rules: {
      // Disabled because it seemed to be causing issues with a generic type
      // that is used in an assertion `as type` at the end of a method
      '@typescript-eslint/no-unnecessary-type-parameters': 'off'
    }
  }
];
