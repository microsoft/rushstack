// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import importLazy = require('import-lazy');

/**
 * @public
 */
export class Import {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public static lazy(moduleName: string, require: (id: string) => unknown): any {
    const importLazyLocal: (moduleName: string) => unknown = importLazy(require);
    return importLazyLocal(moduleName);
  }
}
