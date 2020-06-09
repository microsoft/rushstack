// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminalProvider } from '@rushstack/node-core-library';

import { RushStackCompilerBase, IRushStackCompilerBaseOptions } from './RushStackCompilerBase';
import { ApiExtractor } from './index';
import { ToolPaths } from './ToolPaths';
import { LoggingUtilities } from './LoggingUtilities';

/**
 * The ApiExtractorTask uses the api-extractor tool to analyze a project for public APIs. api-extractor will detect
 * common problems and generate a report of the exported public API. The task uses the entry point of a project to
 * find the aliased exports of the project. An api-extractor.ts file is generated for the project in the temp folder.
 * @beta
 */
export class ApiExtractorRunner extends RushStackCompilerBase {
  private _extractorConfig: ApiExtractor.ExtractorConfig;
  private _extractorOptions: ApiExtractor.IExtractorInvokeOptions;

  public constructor(
    extractorConfig: ApiExtractor.ExtractorConfig,
    extractorOptions: ApiExtractor.IExtractorInvokeOptions,
    rootPath: string,
    terminalProvider: ITerminalProvider
  ); // Remove in the next major version
  public constructor(
    options: IRushStackCompilerBaseOptions,
    extractorConfig: ApiExtractor.ExtractorConfig,
    extractorOptions: ApiExtractor.IExtractorInvokeOptions,
    rootPath: string,
    terminalProvider: ITerminalProvider
  );
  public constructor(
    arg1: IRushStackCompilerBaseOptions | ApiExtractor.ExtractorConfig,
    arg2: ApiExtractor.ExtractorConfig | ApiExtractor.IExtractorInvokeOptions,
    arg3: ApiExtractor.IExtractorInvokeOptions | string,
    arg4: string | ITerminalProvider,
    arg5?: ITerminalProvider
  ) {
    let options: IRushStackCompilerBaseOptions;
    let extractorConfig: ApiExtractor.ExtractorConfig;
    let extractorOptions: ApiExtractor.IExtractorInvokeOptions;
    let rootPath: string;
    let terminalProvider: ITerminalProvider;
    if (arg1 instanceof ApiExtractor.ExtractorConfig) {
      extractorConfig = arg1;
      extractorOptions = arg2 as ApiExtractor.IExtractorInvokeOptions;
      rootPath = arg3 as string;
      terminalProvider = arg4 as ITerminalProvider;
      const loggingUtilities: LoggingUtilities = new LoggingUtilities(terminalProvider);
      options = loggingUtilities.getDefaultRushStackCompilerBaseOptions();
    } else {
      options = arg1;
      extractorConfig = arg2 as ApiExtractor.ExtractorConfig;
      extractorOptions = arg3 as ApiExtractor.IExtractorInvokeOptions;
      rootPath = arg4 as string;
      terminalProvider = arg5 as ITerminalProvider;
    }

    super(options, rootPath, terminalProvider);

    this._extractorConfig = extractorConfig;
    this._extractorOptions = extractorOptions;
  }

  public invoke(): Promise<void> {
    try {
      const extractorOptions: ApiExtractor.IExtractorInvokeOptions = {
        ...this._extractorOptions,
        messageCallback: (message: ApiExtractor.ExtractorMessage) => {
          switch (message.logLevel) {
            case ApiExtractor.ExtractorLogLevel.Error: {
              if (message.sourceFilePath) {
                this._fileError(
                  message.sourceFilePath,
                  message.sourceFileLine!,
                  message.sourceFileColumn!,
                  message.category,
                  message.text
                );
              } else {
                this._terminal.writeErrorLine(message.text);
              }

              break;
            }

            case ApiExtractor.ExtractorLogLevel.Warning: {
              if (message.sourceFilePath) {
                this._fileWarning(
                  message.sourceFilePath,
                  message.sourceFileLine!,
                  message.sourceFileColumn!,
                  message.category,
                  message.text
                );
              } else {
                this._terminal.writeWarningLine(message.text);
              }
              break;
            }

            case ApiExtractor.ExtractorLogLevel.Info: {
              this._terminal.writeLine(message.text);
              break;
            }

            case ApiExtractor.ExtractorLogLevel.Verbose: {
              this._terminal.writeVerboseLine(message.text);
              break;
            }

            default: {
              return;
            }
          }
          message.handled = true;
        },
        typescriptCompilerFolder: ToolPaths.typescriptPackagePath,
      };

      // NOTE: ExtractorResult.succeeded indicates whether errors or warnings occurred, however we
      // already handle this above via our customLogger
      ApiExtractor.Extractor.invoke(this._extractorConfig, extractorOptions);

      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e);
    }
  }
}
