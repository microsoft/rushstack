// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  IExtractorOptions,
  IExtractorConfig
} from '@microsoft/api-extractor';

import { ApiExtractorBaseTask } from '../ApiExtractorBaseTask';

/**
 * The ApiExtractorTask uses the api-extractor tool to analyze a project for public APIs. api-extractor will detect
 * common problems and generate a report of the exported public API. The task uses the entry point of a project to
 * find the aliased exports of the project. An api-extractor.ts file is generated for the project in the temp folder.
 * @public
 */
export class ApiExtractorStandaloneTask extends ApiExtractorBaseTask {
  protected updateExtractorConfig(extractorConfig: IExtractorConfig): void {
    extractorConfig.compiler = {
      configType: 'tsconfig',
      rootFolder: this.buildConfig.rootPath
    };
  }

  protected updateExtractorOptions(extractorOptions: IExtractorOptions): void {
    // No changes needed
  }
}
