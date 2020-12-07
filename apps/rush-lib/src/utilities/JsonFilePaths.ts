// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/naming-convention
declare const __webpack_require__: unknown;

export class JsonFilePaths {
  public static approvedPackagesSchemaPath: string =
    typeof __webpack_require__ !== 'undefined'
      ? require('file-loader?name=[name]_[contenthash:8].[ext]!../schemas/approved-packages.schema.json')
      : path.resolve(__dirname, '..', 'schemas', 'approved-packages.schema.json');

  public static commandLineSchemaPath: string =
    typeof __webpack_require__ !== 'undefined'
      ? require('file-loader?name=[name]_[contenthash:8].[ext]!../schemas/command-line.schema.json')
      : path.resolve(__dirname, '..', 'schemas', 'command-line.schema.json');

  public static commonVersionsSchemaPath: string =
    typeof __webpack_require__ !== 'undefined'
      ? require('file-loader?name=[name]_[contenthash:8].[ext]!../schemas/common-versions.schema.json')
      : path.resolve(__dirname, '..', 'schemas', 'common-versions.schema.json');

  public static experimentsSchemaPath: string =
    typeof __webpack_require__ !== 'undefined'
      ? require('file-loader?name=[name]_[contenthash:8].[ext]!../schemas/experiments.schema.json')
      : path.resolve(__dirname, '..', 'schemas', 'experiments.schema.json');

  public static rushSchemaPath: string =
    typeof __webpack_require__ !== 'undefined'
      ? require('file-loader?name=[name]_[contenthash:8].[ext]!../schemas/rush.schema.json')
      : path.resolve(__dirname, '..', 'schemas', 'rush.schema.json');

  public static versionPoliciesSchemaPath: string =
    typeof __webpack_require__ !== 'undefined'
      ? require('file-loader?name=[name]_[contenthash:8].[ext]!../schemas/version-policies.schema.json')
      : path.resolve(__dirname, '..', 'schemas', 'version-policies.schema.json');

  public static scenarioTemplatePath: string =
    typeof __webpack_require__ !== 'undefined'
      ? require('file-loader?name=[name]_[contenthash:8].[ext]!../../assets/rush-init-deploy/scenario-template.json')
      : path.resolve(__dirname, '..', '..', 'assets', 'rush-init-deploy', 'scenario-template.json');

  public static repoStateSchemaPath: string =
    typeof __webpack_require__ !== 'undefined'
      ? require('file-loader?name=[name]_[contenthash:8].[ext]!../schemas/repo-state.schema.json')
      : path.resolve(__dirname, '..', 'schemas', 'repo-state.schema.json');

  public static deployScenarioSchemaPath: string =
    typeof __webpack_require__ !== 'undefined'
      ? require('file-loader?name=[name]_[contenthash:8].[ext]!../schemas/repo-state.schema.json')
      : path.resolve(__dirname, '..', 'schemas', 'repo-state.schema.json');
}
