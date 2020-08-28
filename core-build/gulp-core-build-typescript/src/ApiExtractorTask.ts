// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { IBuildConfig } from '@microsoft/gulp-core-build';
import {
  JsonFile,
  FileSystem,
  JsonObject
} from '@rushstack/node-core-library';
import { ExtractorConfig, IExtractorInvokeOptions } from '@microsoft/api-extractor';
import { ApiExtractorRunner as TApiExtractorRunner } from '@microsoft/rush-stack-compiler-3.1';

import { RSCTask, IRSCTaskConfig } from './RSCTask';

/** @public */
export interface IApiExtractorTaskConfig extends IRSCTaskConfig {
}

/**
 * The ApiExtractorTask uses the api-extractor tool to analyze a project for public APIs. api-extractor will detect
 * common problems and generate a report of the exported public API. The task uses the entry point of a project to
 * find the aliased exports of the project. An api-extractor.ts file is generated for the project in the temp folder.
 * @public
 */
export class ApiExtractorTask extends RSCTask<IApiExtractorTaskConfig>  {
  public constructor() {
    super(
      'api-extractor',
      {}
    );
  }

  public loadSchema(): JsonObject {
    return JsonFile.load(path.resolve(__dirname, 'schemas', 'api-extractor.schema.json'));
  }

  public isEnabled(buildConfig: IBuildConfig): boolean {
    return FileSystem.exists(this._getApiExtractorConfigFilePath(buildConfig.rootPath));
  }

  public executeTask(): Promise<void> {
    this.initializeRushStackCompiler();

    const extractorOptions: IExtractorInvokeOptions = {
      localBuild: !this.buildConfig.production
    };

    const ApiExtractorRunner: typeof TApiExtractorRunner = this._rushStackCompiler.ApiExtractorRunner;
    const extractorConfig: ExtractorConfig = this._rushStackCompiler.ApiExtractor.ExtractorConfig.loadFileAndPrepare(
      this._getApiExtractorConfigFilePath(this.buildConfig.rootPath)
    );

    const apiExtractorRunner: TApiExtractorRunner = new ApiExtractorRunner(
      {
        fileError: this.fileError.bind(this),
        fileWarning: this.fileWarning.bind(this)
      },
      extractorConfig,
      extractorOptions,
      this.buildFolder,
      this._terminalProvider
    );

    return apiExtractorRunner.invoke();
  }

  protected _getConfigFilePath(): string {
    return path.join('.', 'config', 'gcb-api-extractor.json'); // There aren't config options specific to this task
  }

  private _getApiExtractorConfigFilePath(rootPath: string): string {
    return path.resolve(rootPath, 'config', 'api-extractor.json');
  }
}
