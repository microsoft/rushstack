// Everything in this file is a `const` and TypeScript will infer more specific correct types than most developers would write.
/* eslint-disable @typescript-eslint/typedef */

/**
 * Prefix to wrap `function (module, __webpack_exports__, __webpack_require__) { ... }` so that the minifier doesn't delete it
 * @internal
 */
export const MODULE_WRAPPER_PREFIX = '__MINIFY_MODULE__(';
/**
 * Suffix to wrap `function (module, __webpack_exports__, __webpack_require__) { ... }` so that the minifier doesn't delete it
 * @internal
 */
export const MODULE_WRAPPER_SUFFIX = ');';

/**
 * Token to replace the object or array of module definitions so that the minifier can operate on the Webpack runtime or chunk boilerplate in isolation
 * @public
 */
export const CHUNK_MODULES_TOKEN = '__WEBPACK_CHUNK_MODULES__';

/**
 * Stage # to use when this should be the first tap in the hook
 * @public
 */
export const STAGE_BEFORE = -100;
/**
 * Stage # to use when this should be the last tap in the hook
 * @public
 */
export const STAGE_AFTER = 100;