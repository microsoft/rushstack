// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as TWebpack from 'webpack';
import { FileSystem, Import } from '@rushstack/node-core-library';
import { PATCH_MD4_WITH_MD5_HASH_OPTION_NAME, WEBPACK_PACKAGE_NAME } from './Webpack4Plugin';
import path from 'path';

let _loadWebpackAsyncPromise: Promise<typeof TWebpack> | undefined;

/**
 * @beta
 */
export interface IWarningErrorEmitter {
  emitWarning: (warning: Error) => void;
  emitError: (error: Error) => void;
}

/**
 * @beta
 */
export async function loadWebpackAsync(
  logger: IWarningErrorEmitter,
  patchMd4WithMd5Hash: boolean | undefined
): Promise<typeof TWebpack> {
  if (!_loadWebpackAsyncPromise) {
    _loadWebpackAsyncPromise = _loadWebpackAsyncInner(logger, patchMd4WithMd5Hash);
  }

  return await _loadWebpackAsyncPromise;
}

async function _loadWebpackAsyncInner(
  logger: IWarningErrorEmitter,
  patchMd4WithMd5Hash: boolean | undefined
): Promise<typeof TWebpack> {
  // Allow this to fail if webpack is not installed
  if (patchMd4WithMd5Hash) {
    await _patchWebpackCreateHashModule(logger);
    await _patchWebpackModuleAsync('lib/optimize/SplitChunksPlugin', logger, (existingCode) =>
      existingCode.replace(/\.createHash\(['"]md4['"]\)/g, '.createHash("md5")')
    );
  }

  return await import(WEBPACK_PACKAGE_NAME);
}

interface IWebpackModule {
  default: unknown;
}

async function _patchWebpackCreateHashModule(logger: IWarningErrorEmitter): Promise<void> {
  const createHashFullPath: string = await Import.resolveModuleAsync({
    modulePath: `${WEBPACK_PACKAGE_NAME}/lib/util/createHash`,
    baseFolderPath: __dirname
  });

  if (createHashFullPath in require.cache) {
    logger.emitWarning(
      new Error(
        `The ${createHashFullPath} module is already loaded and the ` +
          `${PATCH_MD4_WITH_MD5_HASH_OPTION_NAME} option was set. Webpack may not be patched correctly.`
      )
    );
  }

  type HashFunction = (algorithm?: string | (new () => import('crypto').Hash)) => import('crypto').Hash;
  const webpackCreateHashModule: HashFunction | { default: HashFunction } = await import(createHashFullPath);
  const webpackCreateHashFunction: HashFunction = (webpackCreateHashModule as { default: HashFunction })
    .default
    ? (webpackCreateHashModule as { default: HashFunction }).default
    : (webpackCreateHashModule as HashFunction);

  const patchedWebpackCreateHash: typeof webpackCreateHashModule = (algorithm) =>
    webpackCreateHashFunction(algorithm === 'md4' ? 'md5' : algorithm);
  (patchedWebpackCreateHash as unknown as { default: typeof webpackCreateHashModule }).default =
    patchedWebpackCreateHash;

  require.cache[createHashFullPath]!.exports = patchedWebpackCreateHash;
}

async function _patchWebpackModuleAsync(
  webpackPackageRelativeModulePath: string,
  logger: IWarningErrorEmitter,
  patchFn: (existingCode: string) => string
): Promise<void> {
  // TODO: Consider deduplicating this with the code in heft-jest-plugin/patches/jestWorkerPatch.ts
  try {
    const modulePath: string = await Import.resolveModuleAsync({
      modulePath: `${WEBPACK_PACKAGE_NAME}/${webpackPackageRelativeModulePath}`,
      baseFolderPath: __dirname
    });

    if (modulePath in require.cache) {
      logger.emitError(
        new Error(`The ${modulePath} module is already loaded and may not be patched successfully.`)
      );
    }

    const normalizedModulePathFilename: string = path.basename(modulePath).toUpperCase();

    // Load the module
    await import(modulePath);

    // Obtain the metadata for the module
    let webpackModuleMetadata: NodeModule | undefined = undefined;
    for (const childModule of module.children) {
      if (path.basename(childModule.filename || '').toUpperCase() === normalizedModulePathFilename) {
        if (webpackModuleMetadata) {
          throw new Error('More than one child module matched while detecting Node.js module metadata');
        }
        webpackModuleMetadata = childModule;
      }
    }

    if (!webpackModuleMetadata) {
      throw new Error(`Failed to detect the Node.js module metadata for ${modulePath}`);
    }

    // Load the original file contents
    const originalFileContent: string = await FileSystem.readFileAsync(modulePath);

    const patchedFileContent: string = patchFn(originalFileContent);
    // Add boilerplate so that eval() will return the exports
    const patchedCode: string =
      '// PATCHED BY HEFT USING eval()\n\nmodule.exports = {}\nexports = module.exports;' +
      patchedFileContent +
      '\n// return value:\nmodule.exports';

    function evalInContext(): IWebpackModule {
      // Remap the require() function for the eval() context

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      function require<TResult>(modulePath: string): TResult {
        return webpackModuleMetadata!.require(modulePath);
      }

      // eslint-disable-next-line no-eval
      return eval(patchedCode);
    }

    const patchedModule: IWebpackModule = evalInContext();

    // eslint-disable-next-line require-atomic-updates
    webpackModuleMetadata.exports = patchedModule;
  } catch (e) {
    logger.emitError(
      new Error(
        `Failed to patch the "${webpackPackageRelativeModulePath}" module from the "${WEBPACK_PACKAGE_NAME}" package: ${e}`
      )
    );
  }
}
