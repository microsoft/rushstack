// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  CommandLineParser,
  type CommandLineFlagParameter,
  type CommandLineStringParameter,
  type IRequiredCommandLineStringParameter,
  type IRequiredCommandLineChoiceParameter
} from '@rushstack/ts-command-line';
import { InternalError } from '@rushstack/node-core-library';
import { Colorize } from '@rushstack/terminal';

import { type ResolutionType, traceImport } from './traceImport.ts';

export class TraceImportCommandLineParser extends CommandLineParser {
  private readonly _debugParameter: CommandLineFlagParameter;
  private readonly _pathParameter: IRequiredCommandLineStringParameter;
  private readonly _baseFolderParameter: CommandLineStringParameter;
  private readonly _resolutionTypeParameter: IRequiredCommandLineChoiceParameter<ResolutionType>;

  public constructor() {
    super({
      toolFilename: 'trace-import',
      toolDescription:
        'This tool analyzes import module paths, to determine the resolved target folder.  ' +
        'For example, if the "semver" NPM package is installed, "trace-import --path semver/index" will ' +
        'print output equivalent to the Node.js require.resolve() API.  ' +
        'If "@types/semver" is installed, then "trace-import --resolution-type ts --path semver/index" will ' +
        'print the .d.ts file path that would be resolved by a TypeScript import statement.'
    });

    this._debugParameter = this.defineFlagParameter({
      parameterLongName: '--debug',
      parameterShortName: '-d',
      description: 'Show the full call stack if an error occurs while executing the tool'
    });

    this._pathParameter = this.defineStringParameter({
      parameterLongName: '--path',
      parameterShortName: '-p',
      description:
        'The import module path to be analyzed. For example, ' +
        '"example" in expressions such as: require("example"); require.resolve("example"); import { Thing } from "example";',
      argumentName: 'IMPORT_PATH',
      required: true
    });

    this._baseFolderParameter = this.defineStringParameter({
      parameterLongName: '--base-folder',
      parameterShortName: '-b',
      description:
        'The "--path" string will be resolved as if the import statement appeared in a script located in this folder.  ' +
        'If omitted, the current working directory is used.',
      argumentName: 'FOLDER_PATH'
    });

    this._resolutionTypeParameter = this.defineChoiceParameter<ResolutionType>({
      parameterLongName: '--resolution-type',
      parameterShortName: '-t',
      description:
        'The type of module resolution to perform:  ' +
        '"cjs" for CommonJS, "es" for ES modules, or "ts" for TypeScript typings',
      alternatives: ['cjs', 'es', 'ts'],
      defaultValue: 'cjs'
    });
  }

  protected override async onExecuteAsync(): Promise<void> {
    if (this._debugParameter.value) {
      InternalError.breakInDebugger = true;
    }
    try {
      traceImport({
        importPath: this._pathParameter.value,
        baseFolder: this._baseFolderParameter.value,
        resolutionType: this._resolutionTypeParameter.value
      });
    } catch (error) {
      if (this._debugParameter.value) {
        console.error('\n' + error.stack);
      } else {
        console.error('\n' + Colorize.red('ERROR: ' + error.message.trim()));
      }
    }
  }
}
