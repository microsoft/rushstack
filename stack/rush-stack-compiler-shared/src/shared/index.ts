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
 * @packageDocumentation
 */

export { ApiExtractorRunner } from './ApiExtractorRunner';
export {
  RushStackCompilerBase,
  IRushStackCompilerBaseOptions,
  WriteFileIssueFunction
} from './RushStackCompilerBase';
export { StandardBuildFolders } from './StandardBuildFolders';
export { TypescriptCompiler, ITypescriptCompilerOptions } from './TypescriptCompiler';
export { ILintRunnerConfig } from './ILintRunnerConfig';
export { LintRunner } from './LintRunner';
export { ITslintRunnerConfig, TslintRunner } from './TslintRunner';
export { ToolPaths } from './ToolPaths';

export { Typescript, Tslint, ApiExtractor } from './ToolPackages';
