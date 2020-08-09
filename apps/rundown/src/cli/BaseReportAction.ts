// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  CommandLineAction,
  ICommandLineActionOptions,
  CommandLineStringParameter,
  CommandLineStringListParameter
} from '@rushstack/ts-command-line';

export abstract class BaseReportAction extends CommandLineAction {
  protected scriptParameter: CommandLineStringParameter;
  protected argsParameter: CommandLineStringListParameter;

  public constructor(options: ICommandLineActionOptions) {
    super(options);
  }

  // abstract
  protected onDefineParameters(): void {
    this.scriptParameter = this.defineStringParameter({
      parameterLongName: '--script',
      parameterShortName: '-s',
      argumentName: 'PATH',
      description: 'The path to a .js file that will be invoked as the process entry point',
      required: true
    });
    this.argsParameter = this.defineStringListParameter({
      parameterLongName: '--arg',
      parameterShortName: '-a',
      argumentName: 'STRING',
      description: 'Specifies command-line arguments to be passed to the Node.js process'
    });
  }
}
