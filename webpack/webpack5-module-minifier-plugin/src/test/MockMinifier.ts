// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  IModuleMinifier,
  IModuleMinificationRequest,
  IModuleMinificationCallback,
  IMinifierConnection
} from '@rushstack/module-minifier';

import { MODULE_WRAPPER_PREFIX, MODULE_WRAPPER_SUFFIX } from '../Constants';

export class MockMinifier implements IModuleMinifier {
  public readonly requests: Map<string, string> = new Map();

  /**
   * Mock code transform.
   * @param request - The request to process
   * @param callback - The callback to invoke
   */
  public minify(request: IModuleMinificationRequest, callback: IModuleMinificationCallback): void {
    const { code, hash, nameForMap } = request;

    this.requests.set(hash, code);

    const isModule: boolean = code.startsWith(MODULE_WRAPPER_PREFIX);
    const processedCode: string = isModule
      ? `${MODULE_WRAPPER_PREFIX}\n// Begin Module Hash=${hash}\n${code.slice(
          MODULE_WRAPPER_PREFIX.length,
          -MODULE_WRAPPER_SUFFIX.length
        )}\n// End Module${MODULE_WRAPPER_SUFFIX}`
      : `// Begin Asset Hash=${hash}\n${code}\n// End Asset`;

    callback({
      hash,
      error: undefined,
      code: processedCode,
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

  public async connect(): Promise<IMinifierConnection> {
    return {
      configHash: MockMinifier.name,

      disconnect: async () => {
        // Do nothing.
      }
    };
  }
}
