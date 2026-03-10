// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  IMinifierConnection,
  IModuleMinificationCallback,
  IModuleMinificationRequest,
  IModuleMinifier
} from './types.ts';

/**
 * Minifier implementation that does not actually transform the code, for debugging.
 * @public
 */
export class NoopMinifier implements IModuleMinifier {
  /**
   * No-op code transform.
   * @param request - The request to process
   * @param callback - The callback to invoke
   */
  public minify(request: IModuleMinificationRequest, callback: IModuleMinificationCallback): void {
    const { code, hash, nameForMap } = request;

    callback({
      hash,
      error: undefined,
      code,
      // If source maps are requested, provide an empty source map
      map: nameForMap
        ? {
            version: 3,
            names: [],
            file: nameForMap,
            sources: [nameForMap],
            sourcesContent: [code],
            // In source mapping parlance, this means "map line 0, column 0 to the input file at index 0, line 0, column 0"
            mappings: 'AAAA'
          }
        : undefined
    });
  }

  /**
   * {@inheritdoc IModuleMinifier.connectAsync}
   */
  public async connectAsync(): Promise<IMinifierConnection> {
    const disconnectAsync: IMinifierConnection['disconnectAsync'] = async () => {
      // Do nothing.
    };

    return {
      configHash: NoopMinifier.name,
      disconnectAsync,
      disconnect: disconnectAsync
    };
  }

  /**
   * @deprecated Use {@link NoopMinifier.connectAsync} instead
   */
  // eslint-disable-next-line @typescript-eslint/naming-convention
  public async connect(): Promise<IMinifierConnection> {
    return await this.connectAsync();
  }
}
