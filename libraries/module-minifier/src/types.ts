// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RawSourceMap } from 'source-map';

/**
 * Request to the minifier
 * @public
 */
export interface IModuleMinificationRequest {
  /**
   * Identity of the request. Will be included in the response.
   */
  hash: string;
  /**
   * The raw code fragment
   */
  code: string;
  /**
   * File name to show for the source code in the source map
   */
  nameForMap: string | undefined;
  /**
   * Reserved variable names, e.g. __WEBPACK_EXTERNAL_MODULE_1__
   */
  externals: string[] | undefined;
}

/**
 * Result from the minifier function when an error is encountered.
 * @public
 */
export interface IModuleMinificationErrorResult {
  /**
   * Identity of the request
   */
  hash: string;
  /**
   * The error encountered, to be added to the current compilation's error collection.
   */
  error: Error;
  /**
   * Marker property to always return the same result shape.
   */
  code?: undefined;
  /**
   * Marker property to always return the same result shape.
   */
  map?: undefined;
}

/**
 * Result from the minifier on a successful minification.
 * @public
 */
export interface IModuleMinificationSuccessResult {
  /**
   * Identity of the request
   */
  hash: string;
  /**
   * The error property being `undefined` indicates success.
   */
  error: undefined;
  /**
   * The minified code.
   */
  code: string;
  /**
   * Marker property to always return the same result shape.
   */
  map?: RawSourceMap;
}

/**
 * Result from the minifier.
 * @public
 */
export type IModuleMinificationResult = IModuleMinificationErrorResult | IModuleMinificationSuccessResult;

/**
 * Callback passed to a minifier function
 * @public
 */
export interface IModuleMinificationCallback {
  (result: IModuleMinificationResult): void;
}

/**
 * An async function called to minify a chunk of code
 * @public
 */
export interface IModuleMinifierFunction {
  (request: IModuleMinificationRequest, callback: IModuleMinificationCallback): void;
}

/**
 * Metadata from the minifier for the plugin
 * @public
 */
export interface IMinifierConnection {
  /**
   * Hash of the configuration of this minifier, for cache busting.
   */
  configHash: string;

  /**
   * @deprecated Use {@link IMinifierConnection.disconnectAsync} instead.
   */
  disconnect(): Promise<void>;

  /**
   * Callback to be invoked when done with the minifier
   */
  disconnectAsync(): Promise<void>;
}

/**
 * Object that can be invoked to minify code.
 * @public
 */
export interface IModuleMinifier {
  /**
   * Asynchronously minify a module
   */
  minify: IModuleMinifierFunction;

  /**
   * @deprecated Use {@link IModuleMinifier.connectAsync} instead.
   */
  connect(): Promise<IMinifierConnection>;

  /**
   * Prevents the minifier from shutting down until the returned `disconnect()` callback is invoked.
   * The callback may be used to surface errors encountered by the minifier that may not be relevant to a specific file.
   * It should be called to allow the minifier to cleanup
   */
  connectAsync(): Promise<IMinifierConnection>;
}
