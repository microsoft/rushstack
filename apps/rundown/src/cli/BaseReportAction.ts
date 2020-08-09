// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  CommandLineAction,
  ICommandLineActionOptions,
  CommandLineStringParameter,
  CommandLineStringListParameter,
  CommandLineFlagParameter
} from '@rushstack/ts-command-line';

export abstract class BaseReportAction extends CommandLineAction {
  protected scriptParameter: CommandLineStringParameter;
  protected argsParameter: CommandLineStringListParameter;
  protected quietParameter: CommandLineFlagParameter;
  protected ignoreExitCodeParameter: CommandLineFlagParameter;

  public constructor(options: ICommandLineActionOptions) {
    super(options);
  }

  // abstract
  protected onDefineParameters(): void {
    this.scriptParameter = this.defineStringParameter({
      parameterLongName: '--script',
      parameterShortName: '-s',
      argumentName: 'PATH',
      description: 'The path to a .js file that will be the entry point for the target Node.js process',
      required: true
    });
    this.argsParameter = this.defineStringListParameter({
      parameterLongName: '--arg',
      parameterShortName: '-a',
      argumentName: 'STRING',
      description: 'Specifies command-line arguments to be passed to the target Node.js process'
    });
    this.quietParameter = this.defineFlagParameter({
      parameterLongName: '--quiet',
      parameterShortName: '-q',
      description: 'Suppress STDOUT/STDERR for the target Node.js process'
    });
    this.ignoreExitCodeParameter = this.defineFlagParameter({
      parameterLongName: '--ignore-exit-code',
      parameterShortName: '-i',
      description: 'Do not report an error if the target Node.js process returns a nonzero exit code'
    });
  }
}
