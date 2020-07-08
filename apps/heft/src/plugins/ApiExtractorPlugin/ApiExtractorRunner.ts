// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { Colors, IColorableSequence, ITerminalProvider, Terminal, Path } from '@rushstack/node-core-library';
import { ApiExtractor as TApiExtractor } from '@microsoft/rush-stack-compiler-3.7';

import { SubprocessRunnerBase } from '../../utilities/subprocess/SubprocessRunnerBase';
import { PrefixProxyTerminalProvider } from '../../utilities/PrefixProxyTerminalProvider';

export interface IApiExtractorRunnerConfiguration {
  /**
   * The path to the API Extractor config file
   *
   * For example, /home/username/code/repo/project/.heft/api-extractor.json
   */
  configFileLocation: string;

  /**
   * The path to the @microsoft/api-extractor package
   *
   * For example, /home/username/code/repo/project/node_modules/@microsoft/api-extractor
   */
  apiExtractorPackagePath: string;

  /**
   * The path to the typescript package
   *
   * For example, /home/username/code/repo/project/node_modules/typescript
   */
  typescriptPackagePath: string;

  /**
   * The folder of the project being built
   *
   * For example, /home/username/code/repo/project
   */
  buildFolder: string;

  /**
   * If set to true, run API Extractor in production mode
   */
  production: boolean;
}

export class ApiExtractorRunner extends SubprocessRunnerBase<IApiExtractorRunnerConfiguration> {
  private _terminal: Terminal;

  public static getTerminal(terminalProvider: ITerminalProvider): Terminal {
    const prefixTerminalProvider: PrefixProxyTerminalProvider = new PrefixProxyTerminalProvider(
      terminalProvider,
      '[api-extractor] '
    );

    return new Terminal(prefixTerminalProvider);
  }

  public get filename(): string {
    return __filename;
  }

  public initialize(): void {
    this._terminal = ApiExtractorRunner.getTerminal(this._terminalProvider);
  }

  public async invokeAsync(): Promise<void> {
    const apiExtractor: typeof TApiExtractor = require(this._configuration.apiExtractorPackagePath);
    const extractorConfig: TApiExtractor.ExtractorConfig = apiExtractor.ExtractorConfig.loadFileAndPrepare(
      this._configuration.configFileLocation
    );
    const extractorOptions: TApiExtractor.IExtractorInvokeOptions = {
      localBuild: !this._configuration.production,
      typescriptCompilerFolder: this._configuration.typescriptPackagePath,
      messageCallback: (message: TApiExtractor.ExtractorMessage) => {
        switch (message.logLevel) {
          case apiExtractor.ExtractorLogLevel.Error: {
            let logMessage: (IColorableSequence | string)[];
            if (message.sourceFilePath) {
              const filePathForLog: string = Path.isUnderOrEqual(
                message.sourceFilePath,
                this._configuration.buildFolder
              )
                ? path.relative(this._configuration.buildFolder, message.sourceFilePath)
                : message.sourceFilePath;
              logMessage = [
                Colors.red(`ERROR: ${filePathForLog}:${message.sourceFileLine}:${message.sourceFileColumn}`),
                ` - (${message.category}) `,
                Colors.red(message.text)
              ];
            } else {
              logMessage = [message.text];
            }

            this._terminal.writeErrorLine(...logMessage);
            break;
          }

          case apiExtractor.ExtractorLogLevel.Warning: {
            let logMessage: (IColorableSequence | string)[];
            if (message.sourceFilePath) {
              const filePathForLog: string = Path.isUnderOrEqual(
                message.sourceFilePath,
                this._configuration.buildFolder
              )
                ? path.relative(this._configuration.buildFolder, message.sourceFilePath)
                : message.sourceFilePath;
              logMessage = [
                Colors.yellow(
                  `WARNING: ${filePathForLog}:${message.sourceFileLine}:${message.sourceFileColumn}`
                ),
                ` - (${message.category}) `,
                Colors.yellow(message.text)
              ];
            } else {
              logMessage = [message.text];
            }

            this._terminal.writeWarningLine(...logMessage);
            break;
          }

          case apiExtractor.ExtractorLogLevel.Verbose: {
            this._terminal.writeVerboseLine(message.text);
            break;
          }

          case apiExtractor.ExtractorLogLevel.Info: {
            this._terminal.writeLine(message.text);
            break;
          }

          case apiExtractor.ExtractorLogLevel.None: {
            // Ignore messages with ExtractorLogLevel.None
            break;
          }

          default:
            throw new Error(`Unexpected API Extractor log level: ${message.logLevel}`);
        }

        message.handled = true;
      }
    };

    this._terminal.writeLine(`Using API Extractor version ${apiExtractor.Extractor.version}`);

    const apiExtractorResult: TApiExtractor.ExtractorResult = apiExtractor.Extractor.invoke(
      extractorConfig,
      extractorOptions
    );

    const { errorCount, warningCount } = apiExtractorResult;
    if (errorCount > 0) {
      this._terminal.writeErrorLine(
        `API Extractor completed with ${errorCount} error${errorCount > 1 ? 's' : ''}`
      );
    } else if (warningCount > 0) {
      this._terminal.writeErrorLine(
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
