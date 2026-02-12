// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Prefix to wrap `function (module, __webpack_exports__, __webpack_require__) { ... }` so that the minifier doesn't delete it.
 * Public because alternate Minifier implementations may wish to know about it.
 * @public
 */
export const MODULE_WRAPPER_PREFIX: '__MINIFY_MODULE__(' = '__MINIFY_MODULE__(';
/**
 * Suffix to wrap `function (module, __webpack_exports__, __webpack_require__) { ... }` so that the minifier doesn't delete it.
 * Public because alternate Minifier implementations may wish to know about it.
 * @public
 */
export const MODULE_WRAPPER_SUFFIX: ');' = ');';

/**
 * Prefix to wrap ECMAScript method shorthand `(module, __webpack_exports__, __webpack_require__) { ... }` so that the minifier doesn't delete it.
 * Used when webpack emits modules using shorthand syntax.
 * Combined with the suffix, creates: `__MINIFY_MODULE__({__DEFAULT_ID__(params){body}});`
 * Public because alternate Minifier implementations may wish to know about it.
 * @public
 */
export const MODULE_WRAPPER_SHORTHAND_PREFIX: string = `${MODULE_WRAPPER_PREFIX}{__DEFAULT_ID__`;
/**
 * Suffix to wrap ECMAScript method shorthand `(module, __webpack_exports__, __webpack_require__) { ... }` so that the minifier doesn't delete it.
 * Used when webpack emits modules using shorthand syntax.
 * Combined with the prefix, creates: `__MINIFY_MODULE__({__DEFAULT_ID__(params){body}});`
 * Public because alternate Minifier implementations may wish to know about it.
 * @public
 */
export const MODULE_WRAPPER_SHORTHAND_SUFFIX: string = `}${MODULE_WRAPPER_SUFFIX}`;

/**
 * Token preceding a module id in the emitted asset so the minifier can operate on the Webpack runtime or chunk boilerplate in isolation
 * @public
 */
export const CHUNK_MODULE_TOKEN: '__WEBPACK_CHUNK_MODULE__' = '__WEBPACK_CHUNK_MODULE__';

/**
 * RegExp for replacing chunk module placeholders
 * Handles three possible representations:
 * - `"id":__WEBPACK_CHUNK_MODULE__HASH__` (methodShorthand: false, object)
 * - `__WEBPACK_CHUNK_MODULE__HASH__` (array syntax)
 * - `"id":__WEBPACK_CHUNK_MODULE__HASH__` with leading ':' (methodShorthand: true, object)
 * Captures optional leading `:` to handle shorthand format properly
 * @public
 */
export const CHUNK_MODULE_REGEX: RegExp = /(:?)__WEBPACK_CHUNK_MODULE__([A-Za-z0-9$_]+)/g;

/**
 * Stage # to use when this should be the first tap in the hook
 * @public
 */
export const STAGE_BEFORE: -10000 = -10000;
/**
 * Stage # to use when this should be the last tap in the hook
 * @public
 */
export const STAGE_AFTER: 100 = 100;
