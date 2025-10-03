// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineParser } from '@rushstack/ts-command-line';

import { MarkdownAction } from './MarkdownAction';
import { YamlAction } from './YamlAction';
import { GenerateAction } from './GenerateAction';

export class ApiDocumenterCommandLine extends CommandLineParser {
  public constructor() {
    super({
      toolFilename: 'api-documenter',
      toolDescription:
        'Reads *.api.json files produced by api-extractor, ' +
        ' and generates API documentation in various output formats.'
    });
    this._populateActions();
  }

  private _populateActions(): void {
    this.addAction(new MarkdownAction(this));
    this.addAction(new YamlAction(this));
    this.addAction(new GenerateAction(this));
  }
}
