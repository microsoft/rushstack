// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/naming-convention
declare const __webpack_require__: unknown;

export class JsonFilePaths {
  public static apiDocumenterSchemaPath: string =
    typeof __webpack_require__ !== 'undefined'
      ? require('file-loader?name=[name]_[contenthash:8].[ext]!./schemas/api-documenter.schema.json')
      : path.join(__dirname, 'schemas', 'api-documenter.schema.json');

  public static typescriptSchemaPath: string =
    typeof __webpack_require__ !== 'undefined'
      ? require('file-loader?name=[name]_[contenthash:8].[ext]!./schemas/typescript.schema.json')
      : path.join(__dirname, 'schemas', 'typescript.schema.json');
}
