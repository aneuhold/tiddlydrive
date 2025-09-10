/**
 * Base prettier config for the portfolio project.
 *
 * This can be extended in another folder by requiring this file and spreading the config.
 *
 * For example:
 * ```js
 * import { default as baseConfig } from '../.prettierrc.js';
 *
 * const config = {
 *   ...baseConfig,
 *   printWidth: 80,
 * };
 *
 * export default config;
 * ```
 */
const config = {
  semi: true,
  singleQuote: true,
  useSpace: true,
  tabWidth: 2,
  trailingComma: 'none',
  printWidth: 100
};

export default config;
