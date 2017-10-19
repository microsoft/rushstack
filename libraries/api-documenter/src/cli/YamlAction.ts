// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  CommandLineAction
} from '@microsoft/ts-command-line';

import { ApiDocumenterCommandLine } from './ApiDocumenterCommandLine';

export class YamlAction extends CommandLineAction {
  private _parser: ApiDocumenterCommandLine;

  constructor(parser: ApiDocumenterCommandLine) {
    super({
      actionVerb: 'yaml',
      summary: 'Generate documentation as universal reference YAML files (*.yml)',
      documentation: 'Generate documentation as YAML files (*.yml)'
    });
    this._parser = parser;
  }

  protected onDefineParameters(): void { // override
    // No parameters
  }

  protected onExecute(): void { // override
    console.log('Yaml');
  }
}
