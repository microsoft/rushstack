// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type { SyncTransformer, TransformedSource, TransformOptions } from '@jest/transform';

import { FileSystem } from '@rushstack/node-core-library';

// The transpiled output for IdentityMockProxy.ts
const proxyCode: string = FileSystem.readFile(path.join(__dirname, '..', 'identityMock.js')).toString();

/**
 * This Jest transform handles imports of files like CSS that would normally be
 * processed by a Webpack loader.  Instead of actually loading the resource, we return a mock object.
 * The mock simply returns the imported name as a text string.  For example, `mock.xyz` would evaluate to `"xyz"`.
 * This technique is based on "identity-obj-proxy":
 *
 *   https://www.npmjs.com/package/identity-obj-proxy
 *
 * @privateRemarks
 * (We don't import the actual "identity-obj-proxy" package because transform output gets resolved with respect
 * to the target project folder, not Heft's folder.)
 */
export class IdentityMockTransformer implements SyncTransformer {
  public process(sourceText: string, sourcePath: string, options: TransformOptions): TransformedSource {
    return {
      code: proxyCode
    };
  }
}
