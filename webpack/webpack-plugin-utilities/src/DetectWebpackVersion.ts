import type * as Webpack5 from 'webpack';
import type * as Webpack4 from 'webpack4';
import webpack from 'webpack4';

/**
 * There is no `compiler.version` API available prior to webpack 5,
 * therefore we will have to make some inferences about which major version of webpack we are on.
 * Feature Request: https://github.com/webpack/webpack/issues/15679
 * @description
 */

/**
 * We do not have quality API detection between webpack major versions 1-3.
 * We can detect the absence of hooks which was a version 3 feature.
 *
 * @public
 */
const isWebpack3OrEarlier = (compiler: Webpack5.Compiler): boolean => {
  return !compiler.hooks;
};

const isWebpack4 = (compiler: Webpack4.Compiler): boolean => {
  const webpackVersion: string | undefined = (compiler as Webpack5.Compiler | { webpack: undefined }).webpack
    ?.version;

  // version property doesn't exist
  return !webpackVersion;
};

/**
 * Detects whether or not we are using webpack major version 4 or 5
 *
 * @public
 */
const isWebpack5 = (compiler: Webpack5.Compiler | Webpack4.Compiler): boolean => {
  const webpackVersion: string | undefined = (compiler as Webpack5.Compiler | { webpack: undefined }).webpack
    ?.version;

  // version property does exist
  return !!webpackVersion;
};

export { isWebpack3OrEarlier, isWebpack4, isWebpack5 };
