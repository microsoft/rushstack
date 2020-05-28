// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const { ToolPaths } = require('./ToolPaths');

let _typescript;
Object.defineProperty(
  module.exports,
  'Typescript',
  {
    configurable: false,
    get: () => {
      if (!_typescript) {
        _typescript = require(ToolPaths.typescriptPackagePath);
      }

      return _typescript;
    }
  }
);

let _tslint;
Object.defineProperty(
  module.exports,
  'Tslint',
  {
    configurable: false,
    get: () => {
      if (!_tslint) {
        _tslint = require(ToolPaths.tslintPackagePath);
      }

      return _tslint;
    }
  }
);

let _apiExtractor;
Object.defineProperty(
  module.exports,
  'ApiExtractor',
  {
    configurable: false,
    get: () => {
      if (!_apiExtractor) {
        _apiExtractor = require('@microsoft/api-extractor');
      }

      return _apiExtractor;
    }
  }
);
