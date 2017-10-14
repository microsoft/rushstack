// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as path from 'path';
import * as ts from 'typescript';

import { JsonFile, JsonSchema } from '@microsoft/node-core-library';
import {
  IExtractorConfig,
  IExtractorProjectConfig,
  ExtractorErrorHandler
} from './IExtractorConfig';
import Extractor from '../Extractor';

/**
 * Options for {@link ApiExtractor.analyzeProject}.
 * @beta
 */
export interface IAnalyzeProjectOptions {
  /**
   * If omitted, then the {@link IExtractorConfig.project} config will be used by default.
   */
  projectConfig?: IExtractorProjectConfig;
}

/**
 * Used to invoke the API Extractor tool.
 * @beta
 */
export class ApiExtractor {
  public static jsonSchema: JsonSchema = JsonSchema.fromFile(
    path.join(__dirname, './api-extractor-config.schema.json'));

  private _config: IExtractorConfig;
  private _program: ts.Program;
  private _customErrorHandler: ExtractorErrorHandler | undefined;

  public constructor (config: IExtractorConfig) {
    this._config = config;

    switch (this._config.compiler.configType) {
      case 'tsconfig':
        const rootFolder: string = this._config.compiler.rootFolder;
        if (!fsx.existsSync(rootFolder)) {
          throw new Error('The root folder does not exist: ' + rootFolder);
        }

        let tsconfig: {} | undefined = this._config.compiler.overrideTsconfig;
        if (!tsconfig) {
          // If it wasn't overridden, then load it from disk
          tsconfig = JsonFile.load(path.join(rootFolder, 'tsconfig.json'));
        }

        const commandLine: ts.ParsedCommandLine = ts.parseJsonConfigFileContent(tsconfig, ts.sys, rootFolder);
        this._program = ts.createProgram(commandLine.fileNames, commandLine.options);

        if (commandLine.errors.length > 0) {
          throw new Error('Error parsing tsconfig.json content: ' + commandLine.errors[0].messageText);
        }

        break;

      case 'runtime':
        this._program = this._config.compiler.program;
        break;

      default:
        throw new Error('Unsupported config type');
    }
  }

  /**
   * Invokes the API Extractor engine, using the configuration that was passed to the constructor.
   */
  public analyzeProject(options?: IAnalyzeProjectOptions): void {
    if (!options) {
      options = { };
    }

    const projectConfig: IExtractorProjectConfig = options.projectConfig ?
      options.projectConfig : this._config.project;

    const extractor: Extractor = new Extractor({
      program: this._program,
      entryPointFile: projectConfig.entryPointSourceFile,
      errorHandler: this._customErrorHandler
    });

    for (const externalJsonFileFolder of projectConfig.externalJsonFileFolders || []) {
      extractor.loadExternalPackages(externalJsonFileFolder);
    }

    if (this._config.apiJsonFile.enabled) {
      // ...
    }

    if (this._config.apiReviewFile.enabled) {
      // ...
    }
  }
}
