// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const { ToolPaths } = require('./ToolPaths');

const importLazy = require('import-lazy');
const lazyImporter = importLazy(require);

exports.Typescript = lazyImporter(ToolPaths.typescriptPackagePath);
exports.Tslint = lazyImporter(ToolPaths.tslintPackagePath);
exports.ApiExtractor = lazyImporter(ToolPaths.apiExtractorPackagePath);
