import tsLibConfig from '@aneuhold/eslint-config/src/ts-lib-config.js';

/** @type {import('@typescript-eslint/utils').TSESLint.FlatConfig.ConfigArray} */
export default [
  ...tsLibConfig,
  {
    // other override settings. e.g. for `files: ['**/*.test.*']`
    rules: {}
  },
  {
    ignores: ['**/lib']  
  }    
];   