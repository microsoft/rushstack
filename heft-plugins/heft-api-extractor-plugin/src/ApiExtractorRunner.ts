// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as semver from 'semver';

import type { IScopedLogger } from '@rushstack/heft';
import { FileError, InternalError } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';
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
   * The imported \@microsoft/api-extractor package
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

const MIN_SUPPORTED_MAJOR_VERSION: number = 7;
const MIN_SUPPORTED_MINOR_VERSION: number = 10;

export class ApiExtractorRunner {
  private readonly _configuration: IApiExtractorRunnerConfiguration;
  private readonly _scopedLogger: IScopedLogger;
  private readonly _terminal: ITerminal;
  private readonly _apiExtractor: typeof TApiExtractor;

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
      apiExtractorVersion.major < MIN_SUPPORTED_MAJOR_VERSION ||
      (apiExtractorVersion.major === MIN_SUPPORTED_MAJOR_VERSION &&
        apiExtractorVersion.minor < MIN_SUPPORTED_MINOR_VERSION)
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
              errorToEmit = new FileError(`(${message.messageId}) ${message.text}`, {
                absolutePath: message.sourceFilePath,
                projectFolder: this._configuration.buildFolder,
                line: message.sourceFileLine,
                column: message.sourceFileColumn
              });
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

    if (!apiExtractorResult.succeeded) {
      this._scopedLogger.emitError(new Error('API Extractor failed.'));
    } else if (apiExtractorResult.apiReportChanged && this._configuration.production) {
      this._scopedLogger.emitError(new Error('API Report changed while in production mode.'));
    }
  }
}
