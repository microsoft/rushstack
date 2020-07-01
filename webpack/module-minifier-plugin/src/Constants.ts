// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The sorted sequence of leading digits for mangled identifiers
 * Computed from character frequency analysis of the source code for OneDrive
 * @public
 */
export const IDENTIFIER_LEADING_DIGITS: string = 'etnairoscdlufpm_hbgvySDIxCOwEALkMPTUFHRNBjVzGKWqQYJXZ$';

/**
 * The sorted sequence of trailing digits for mangled identifiers
 * Computed from character frequency analysis of the source code for OneDrive
 * @public
 */
export const IDENTIFIER_TRAILING_DIGITS: string =
  'etnairoscdlufpm_hbg01v32y67S4985DIxCOwEALkMPTUFHRNBjVzGKWqQYJXZ$';

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
 * Token to replace the object or array of module definitions so that the minifier can operate on the Webpack runtime or chunk boilerplate in isolation
 * @public
 */
export const CHUNK_MODULES_TOKEN: '__WEBPACK_CHUNK_MODULES__' = '__WEBPACK_CHUNK_MODULES__';

/**
 * Stage # to use when this should be the first tap in the hook
 * @public
 */
export const STAGE_BEFORE: -100 = -100;
/**
 * Stage # to use when this should be the last tap in the hook
 * @public
 */
export const STAGE_AFTER: 100 = 100;
