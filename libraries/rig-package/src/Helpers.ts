// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import * as fs from 'node:fs';

import type nodeResolve from 'resolve';

// These helpers avoid taking dependencies on other NPM packages

let _nodeResolve: typeof nodeResolve | undefined;

// Based on Path.isDownwardRelative() from @rushstack/node-core-library
const _upwardPathSegmentRegex: RegExp = /([\/\\]|^)\.\.([\/\\]|$)/;

export class Helpers {
  /**
   * The "resolve" package is only needed when the rig package must be resolved, so it is loaded on first use.
   */
  public static getNodeResolve(): typeof nodeResolve {
    if (!_nodeResolve) {
      _nodeResolve = require('resolve') as typeof nodeResolve;
    }
    return _nodeResolve;
  }

  public static async nodeResolveAsync(id: string, opts: nodeResolve.AsyncOpts): Promise<string> {
    return await new Promise((resolve: (result: string) => void, reject: (error: Error) => void) => {
      Helpers.getNodeResolve()(id, opts, (error: Error | null, result: string | undefined) => {
        if (error) {
          reject(error);
        } else {
          resolve(result!);
        }
      });
    });
  }

  public static async fsExistsAsync(filesystemPath: fs.PathLike): Promise<boolean> {
    return await new Promise((resolve: (result: boolean) => void) => {
      fs.exists(filesystemPath, (exists: boolean) => {
        resolve(exists);
      });
    });
  }

  // Based on Path.isDownwardRelative() from @rushstack/node-core-library
  public static isDownwardRelative(inputPath: string): boolean {
    if (path.isAbsolute(inputPath)) {
      return false;
    }
    // Does it contain ".."
    if (_upwardPathSegmentRegex.test(inputPath)) {
      return false;
    }
    return true;
  }
}
