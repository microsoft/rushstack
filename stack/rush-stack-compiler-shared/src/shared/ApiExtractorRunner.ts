// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminalProvider } from '@microsoft/node-core-library';
import { Extractor, ExtractorConfig, IExtractorInvokeOptions } from '@microsoft/api-extractor';
import * as ApiExtractor from '@microsoft/api-extractor';

import { RushStackCompilerBase } from './RushStackCompilerBase';
import { ToolPaths } from './ToolPaths';

/**
 * The ApiExtractorTask uses the api-extractor tool to analyze a project for public APIs. api-extractor will detect
 * common problems and generate a report of the exported public API. The task uses the entry point of a project to
 * find the aliased exports of the project. An api-extractor.ts file is generated for the project in the temp folder.
 * @beta
 */
export class ApiExtractorRunner extends RushStackCompilerBase {
  public static apiExtractor: typeof ApiExtractor = ApiExtractor;
  private _extractorConfig: ExtractorConfig;
  private _extractorOptions: IExtractorInvokeOptions;

  constructor(
    extractorConfig: ExtractorConfig,
    extractorOptions: IExtractorInvokeOptions,
    rootPath: string,
    terminalProvider: ITerminalProvider
  ) {
    super({}, rootPath, terminalProvider);

    this._extractorConfig = extractorConfig;
    this._extractorOptions = extractorOptions;
  }

  public invoke(): Promise<void> {
    try {
      const extractorOptions: IExtractorInvokeOptions = {
        ...this._extractorOptions,
        messageCallback: (message: ApiExtractor.ExtractorMessage) => {
          switch (message.logLevel) {
            case ApiExtractor.ExtractorLogLevel.Error:
              this._terminal.writeErrorLine.bind(this._terminal);
              break;
            case ApiExtractor.ExtractorLogLevel.Warning:
              this._terminal.writeWarningLine.bind(this._terminal);
              break;
            case ApiExtractor.ExtractorLogLevel.Info:
              this._terminal.writeLine.bind(this._terminal);
              break;
            case ApiExtractor.ExtractorLogLevel.Verbose:
              this._terminal.writeVerboseLine.bind(this._terminal);
              break;
            default:
              return;
          }
          message.handled = true;
        },
        typescriptCompilerFolder: ToolPaths.typescriptPackagePath
      };

      // NOTE: ExtractorResult.succeeded indicates whether errors or warnings occurred, however we
      // already handle this above via our customLogger
      Extractor.invoke(this._extractorConfig, extractorOptions);

      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e);
    }
  }
}
