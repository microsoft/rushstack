// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * There is no `compiler.version` API available prior to webpack 5,
 * therefore we will have to make some inferences about which major version of webpack we are on.
 * Feature Request: https://github.com/webpack/webpack/issues/15679
 * @description
 */

import type * as Webpack from 'webpack';

/**
 * We do not have quality API detection between webpack major versions 1-3.
 * We can detect the absence of hooks which was a version 3 feature.
 *
 * @public
 */
function isWebpack3OrEarlier(compiler: Webpack.Compiler): boolean {
  return !compiler.hooks;
}

/**
 * Detects whether or not we are using webpack 4
 *
 * @public
 */
function isWebpack4(compiler: Webpack.Compiler): boolean {
  const webpackVersion: string | undefined = compiler?.webpack?.version;
  return !webpackVersion;
}

/**
 * Detects whether or not we are using webpack 5
 *
 * @public
 */
function isWebpack5(compiler: Webpack.Compiler): boolean {
  const webpackVersion: string | undefined = compiler?.webpack?.version;

  return !!webpackVersion;
}

export { isWebpack3OrEarlier, isWebpack4, isWebpack5 };
