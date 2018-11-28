// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This package is used with
 * [\@microsoft/rush-stack](https://www.npmjs.com/package/\@microsoft/rush-stack)
 * to select a TypeScript compiler version.
 *
 * It provides a supported set of versions for the following components:
 * - the TypeScript compiler
 * - [tslint](https://github.com/palantir/tslint#readme)
 * - [API Extractor](https://api-extractor.com/)
 *
 * @packagedocumentation
 */

export * from './shared/RushStackCompilerBase';
export * from './shared/ApiExtractorRunner';
export * from './shared/TypescriptCompiler';
export * from './shared/TslintRunner';
export * from './shared/ToolPaths';
