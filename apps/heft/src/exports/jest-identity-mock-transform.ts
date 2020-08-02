// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InitialOptionsWithRootDir } from '@jest/types/build/Config';

const code: string = [
  "// This proxy is injected by Heft's jest-identity-mock-transform.  See Heft documentation for details.",
  'const proxy = new Proxy({}, {',
  '  get: function getter(target, key) {',
  "    if (key === '__esModule') {",
  '      return false;',
  '    }',
  '    return key;',
  '  }',
  '});',
  'module.exports = proxy;'
].join('\n');

/**
 * This Jest transform handles imports of data files (e.g. .css, .png) that would normally be
 * processed by a Webpack loader.  Instead of actually loading the resource, we return a mock object.
 * The mock simply returns the imported name as a text string.  For example, `mock.xyz` would evaluate to `"xyz"`.
 * This technique is based on the "identity-obj-proxy" loader for Webpack:
 *
 *   https://www.npmjs.com/package/identity-obj-proxy
 *
 * @privateRemarks
 * (We don't use the actual "identity-obj-proxy" package because transform output gets resolved with respect
 * to the target project folder, not Heft's folder.)
 */
export function process(src: string, filename: string, jestOptions: InitialOptionsWithRootDir): string {
  return code;
}
