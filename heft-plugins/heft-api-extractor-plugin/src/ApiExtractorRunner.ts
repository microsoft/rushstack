// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as semver from 'semver';
import * as path from 'path';
import type { IScopedLogger } from '@rushstack/heft';
import { type ITerminal, Path, FileError, InternalError } from '@rushstack/node-core-library';
import type * as TApiExtractor from '@microsoft/api-extractor';

export interface IApiExtractorRunnerConfiguration {
  /**
   * The root folder of the build.
   */
  buildFolder: string;

  /**
   * The loaded and prepared Extractor config file ("api-extractor.json")
   */
  apiExtractorConfiguration: TApiExtractor.ExtractorConfig;

  /**
   * The imported @microsoft/api-extractor package
   */
  apiExtractor: typeof TApiExtractor;

  /**
   * The path to the typescript package
   *
   * For example, /home/username/code/repo/project/node_modules/typescript
   */
  typescriptPackagePath: string | undefined;

  /**
   * If set to true, run API Extractor in production mode
   */
  production: boolean;

  /**
   * The scoped logger to use for logging
   */
  scopedLogger: IScopedLogger;
}

export class ApiExtractorRunner {
  private _configuration: IApiExtractorRunnerConfiguration;
  private _scopedLogger: IScopedLogger;
  private _terminal: ITerminal;
  private _apiExtractor: typeof TApiExtractor;

  public constructor(configuration: IApiExtractorRunnerConfiguration) {
    this._configuration = configuration;
    this._apiExtractor = configuration.apiExtractor;
    this._scopedLogger = configuration.scopedLogger;
    this._terminal = configuration.scopedLogger.terminal;
  }

  public async invokeAsync(): Promise<void> {
    this._scopedLogger.terminal.writeLine(
      `Using API Extractor version ${this._apiExtractor.Extractor.version}`
    );

    const apiExtractorVersion: semver.SemVer | null = semver.parse(this._apiExtractor.Extractor.version);
    if (
      !apiExtractorVersion ||
      apiExtractorVersion.major < 7 ||
      (apiExtractorVersion.major === 7 && apiExtractorVersion.minor < 10)
    ) {
      this._scopedLogger.emitWarning(new Error(`Heft requires API Extractor version 7.10.0 or newer`));
    }

    const extractorConfig: TApiExtractor.ExtractorConfig = this._configuration.apiExtractorConfiguration;
    const extractorOptions: TApiExtractor.IExtractorInvokeOptions = {
      localBuild: !this._configuration.production,
      typescriptCompilerFolder: this._configuration.typescriptPackagePath,
      messageCallback: (message: TApiExtractor.ExtractorMessage) => {
        switch (message.logLevel) {
          case this._apiExtractor.ExtractorLogLevel.Error:
          case this._apiExtractor.ExtractorLogLevel.Warning: {
            let errorToEmit: Error | undefined;
            if (message.sourceFilePath) {
              const filePathForLog: string = Path.isUnderOrEqual(
                message.sourceFilePath,
                this._configuration.buildFolder
              )
                ? path.relative(this._configuration.buildFolder, message.sourceFilePath)
                : message.sourceFilePath;
              errorToEmit = new FileError(
                `(${message.messageId}) ${message.text}`,
                filePathForLog,
                message.sourceFileLine,
                message.sourceFileColumn
              );
            } else {
              errorToEmit = new Error(message.text);
            }

            if (message.logLevel === this._apiExtractor.ExtractorLogLevel.Error) {
              this._scopedLogger.emitError(errorToEmit);
            } else if (message.logLevel === this._apiExtractor.ExtractorLogLevel.Warning) {
              this._scopedLogger.emitWarning(errorToEmit);
            } else {
              // Should never happen, but just in case
              throw new InternalError(`Unexpected log level: ${message.logLevel}`);
            }
            break;
          }

          case this._apiExtractor.ExtractorLogLevel.Verbose: {
            this._terminal.writeVerboseLine(message.text);
            break;
          }

          case this._apiExtractor.ExtractorLogLevel.Info: {
            this._terminal.writeLine(message.text);
            break;
          }

          case this._apiExtractor.ExtractorLogLevel.None: {
            // Ignore messages with ExtractorLogLevel.None
            break;
          }

          default:
            this._scopedLogger.emitError(
              new Error(`Unexpected API Extractor log level: ${message.logLevel}`)
            );
        }

        message.handled = true;
      }
    };

    const apiExtractorResult: TApiExtractor.ExtractorResult = this._apiExtractor.Extractor.invoke(
      extractorConfig,
      extractorOptions
    );

    const { errorCount, warningCount } = apiExtractorResult;
    if (errorCount > 0) {
      let message: string = `API Extractor completed with ${errorCount} error${errorCount > 1 ? 's' : ''}`;
      if (warningCount > 0) {
        message += ` and ${warningCount} warning${warningCount > 1 ? 's' : ''}`;
      }
      this._terminal.writeErrorLine(message);
    } else if (warningCount > 0) {
      this._terminal.writeWarningLine(
        `API Extractor completed with ${warningCount} warning${warningCount > 1 ? 's' : ''}`
      );
    }

    if (!apiExtractorResult.succeeded) {
      throw new Error('API Extractor failed.');
    }

    if (apiExtractorResult.apiReportChanged && this._configuration.production) {
      throw new Error('API Report changed.');
    }
  }
}
