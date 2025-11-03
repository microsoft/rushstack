// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as semver from 'semver';

import type { IScopedLogger } from '@rushstack/heft';
import { FileError, InternalError } from '@rushstack/node-core-library';
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

  /**
   * {@inheritdoc IApiExtractorTaskConfiguration.alwaysShowChangedApiReportDiffOnNonLocalBuild}
   */
  alwaysShowChangedApiReportDiffOnNonLocalBuild: boolean | undefined;
}

const MIN_SUPPORTED_MAJOR_VERSION: number = 7;
const MIN_SUPPORTED_MINOR_VERSION: number = 10;

export async function invokeApiExtractorAsync(
  configuration: IApiExtractorRunnerConfiguration
): Promise<void> {
  const {
    scopedLogger,
    apiExtractor,
    buildFolder,
    production,
    typescriptPackagePath,
    apiExtractorConfiguration,
    alwaysShowChangedApiReportDiffOnNonLocalBuild
  } = configuration;
  const { terminal } = scopedLogger;

  terminal.writeLine(`Using API Extractor version ${apiExtractor.Extractor.version}`);

  const apiExtractorVersion: semver.SemVer | null = semver.parse(apiExtractor.Extractor.version);
  if (
    !apiExtractorVersion ||
    apiExtractorVersion.major < MIN_SUPPORTED_MAJOR_VERSION ||
    (apiExtractorVersion.major === MIN_SUPPORTED_MAJOR_VERSION &&
      apiExtractorVersion.minor < MIN_SUPPORTED_MINOR_VERSION)
  ) {
    scopedLogger.emitWarning(new Error(`Heft requires API Extractor version 7.10.0 or newer`));
  }

  const extractorOptions: TApiExtractor.IExtractorInvokeOptions = {
    localBuild: !production,
    typescriptCompilerFolder: typescriptPackagePath,
    // Always show verbose messages - we'll decide what to do with them in the callback
    showVerboseMessages: true,
    alwaysShowChangedApiReportDiffOnNonLocalBuild,
    messageCallback: (message: TApiExtractor.ExtractorMessage) => {
      const { logLevel, sourceFilePath, messageId, text, sourceFileLine, sourceFileColumn } = message;
      switch (logLevel) {
        case apiExtractor.ExtractorLogLevel.Error:
        case apiExtractor.ExtractorLogLevel.Warning: {
          if (messageId === apiExtractor.ConsoleMessageId.ApiReportDiff) {
            // Re-route this to the normal terminal output so it doesn't show up in the list of warnings/errors
            terminal.writeLine(text);
          } else {
            let errorToEmit: Error | undefined;
            if (sourceFilePath) {
              errorToEmit = new FileError(`(${messageId}) ${text}`, {
                absolutePath: sourceFilePath,
                projectFolder: buildFolder,
                line: sourceFileLine,
                column: sourceFileColumn
              });
            } else {
              errorToEmit = new Error(text);
            }

            if (logLevel === apiExtractor.ExtractorLogLevel.Error) {
              scopedLogger.emitError(errorToEmit);
            } else if (logLevel === apiExtractor.ExtractorLogLevel.Warning) {
              scopedLogger.emitWarning(errorToEmit);
            } else {
              // Should never happen, but just in case
              throw new InternalError(`Unexpected log level: ${logLevel}`);
            }
          }

          break;
        }

        case apiExtractor.ExtractorLogLevel.Verbose: {
          terminal.writeVerboseLine(text);
          break;
        }

        case apiExtractor.ExtractorLogLevel.Info: {
          terminal.writeLine(text);
          break;
        }

        case apiExtractor.ExtractorLogLevel.None: {
          // Ignore messages with ExtractorLogLevel.None
          break;
        }

        default:
          scopedLogger.emitError(new Error(`Unexpected API Extractor log level: ${logLevel}`));
      }

      message.handled = true;
    }
  };

  const apiExtractorResult: TApiExtractor.ExtractorResult = apiExtractor.Extractor.invoke(
    apiExtractorConfiguration,
    extractorOptions
  );

  if (!apiExtractorResult.succeeded) {
    scopedLogger.emitError(new Error('API Extractor failed.'));
  } else if (apiExtractorResult.apiReportChanged && production) {
    scopedLogger.emitError(new Error('API Report changed while in production mode.'));
  }
}
