// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/naming-convention
declare const __webpack_require__: unknown;

export class JsonFilePaths {
  public static packageJsonPath: string =
    typeof __webpack_require__ !== 'undefined'
      ? require('file-loader?name=[name]_[contenthash:8].[ext]!../package.json')
      : path.join(__dirname, '..', 'package.json');

  public static apiExtractorSchemaPath: string =
    typeof __webpack_require__ !== 'undefined'
      ? require('file-loader?name=[name]_[contenthash:8].[ext]!./schemas/api-extractor.schema.json')
      : path.join(__dirname, 'schemas', 'api-extractor.schema.json');

  public static apiExtractorDefaultsPath: string =
    typeof __webpack_require__ !== 'undefined'
      ? require('file-loader?name=[name]_[contenthash:8].[ext]!./schemas/api-extractor-defaults.json')
      : path.join(__dirname, 'schemas', 'api-extractor-defaults.json');

  public static apiExtractorTemplatePath: string =
    typeof __webpack_require__ !== 'undefined'
      ? require('file-loader?name=[name]_[contenthash:8].[ext]!./schemas/api-extractor-template.json')
      : path.join(__dirname, 'schemas', 'api-extractor-template.json');
}
