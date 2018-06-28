// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as path from 'path';
import * as ts from 'typescript';
import {
  Extractor,
  IExtractorOptions,
  IExtractorConfig
} from '@microsoft/api-extractor';
import { TypeScriptConfiguration } from './TypeScriptConfiguration';
import gulpTypeScript = require('gulp-typescript');

import { ApiExtractorBaseTask } from './ApiExtractorBaseTask';

/**
 * The ApiExtractorTask uses the api-extractor tool to analyze a project for public APIs. api-extractor will detect
 * common problems and generate a report of the exported public API. The task uses the entry point of a project to
 * find the aliased exports of the project. An api-extractor.ts file is generated for the project in the temp folder.
 * @public
 */
export class ApiExtractorTask extends ApiExtractorBaseTask  {
  protected updateExtractorOptions(extractorOptions: IExtractorOptions, entryPointFile: string): void {
    const typingsFilePath: string = path.join(this.buildConfig.rootPath, 'typings/tsd.d.ts');
    const otherFiles: string[] = fsx.existsSync(typingsFilePath) ? [typingsFilePath] : [];

    // tslint:disable-next-line:no-any
    const gulpTypeScriptSettings: gulpTypeScript.Settings =
      TypeScriptConfiguration.getGulpTypescriptOptions(this.buildConfig).compilerOptions;

    TypeScriptConfiguration.fixupSettings(gulpTypeScriptSettings, this.logWarning, { mustBeCommonJsOrEsnext: true });

    const compilerOptions: ts.CompilerOptions = gulpTypeScript.createProject(gulpTypeScriptSettings).options;

    const analysisFileList: string[] = Extractor.generateFilePathsForAnalysis(otherFiles.concat(entryPointFile));

    const compilerProgram: ts.Program = ts.createProgram(analysisFileList, compilerOptions);

    extractorOptions.compilerProgram = compilerProgram;
  }

  protected updateExtractorConfig(extractorConfig: IExtractorConfig): void {
    // Set the compiler to get the config at runtime
    extractorConfig.compiler = { configType: 'runtime' };
  }
}
