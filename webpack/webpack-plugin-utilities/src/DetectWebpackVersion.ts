import type * as Webpack from 'webpack';
import type * as Webpack5 from 'webpack5';

/**
 * There is no `compiler.version` API available prior to webpack 5,
 * therefore we will have to make some inferances about which major version of webpack we are on.
 * Feature Request: https://github.com/webpack/webpack/issues/15679
 * @description
 */

/**
 * We do not have quality API detection between webpack major versions 1-3.
 * We can detect the absesnse of hooks which was a version 3 feature.
 *
 * @public
 */
const isWebpack3OrEarlier = (compiler: Webpack.Compiler): boolean => {
  return !compiler.hooks;
};

/**
 * Detects whether or not we are using webpack major version 4 or 5
 *
 * @public
 */
const isWebpack4Or5 = (compiler: Webpack.Compiler | Webpack5.Compiler): number => {
  const webpackVersion: string | undefined = (
    compiler as unknown as Webpack5.Compiler | { webpack: undefined }
  ).webpack?.version;

  return webpackVersion ? Number(webpackVersion.substr(0, webpackVersion.indexOf('.'))) : 4;
};

export { isWebpack3OrEarlier, isWebpack4Or5 };
