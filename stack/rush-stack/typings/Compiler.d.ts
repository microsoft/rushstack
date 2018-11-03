// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminalProvider } from '@microsoft/node-core-library';

export class ApiExtractorRunner {
  public constructor(
    extractorConfig: any,
    extractorOptions: any,
    rootPath: string,
    terminalProvider: ITerminalProvider
  );

  public invoke(): Promise<void>;
}

export class TypescriptCompiler {
  constructor(rootPath: string, terminalProvider: ITerminalProvider);
  public invoke(): Promise<void>;
}

export type WriteFileIssueFunction = (
  filePath: string,
  line: number,
  column: number,
  errorCode: string,
  message: string
) => void;

export interface ITslintRunnerConfig {
  fileError: WriteFileIssueFunction;
  fileWarning: WriteFileIssueFunction;
  displayAsError?: boolean;
}

export class TslintRunner {
  constructor(taskOptions: ITslintRunnerConfig, rootPath: string, terminalProvider: ITerminalProvider);
  public invoke(): Promise<void>;
}

export class ToolPaths {
  public static typescriptPackagePath: string;
  public static tslintPackagePath: string;
}

