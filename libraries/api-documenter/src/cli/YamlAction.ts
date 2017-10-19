// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiDocumenterCommandLine } from './ApiDocumenterCommandLine';
import { BaseAction } from './BaseAction';
import { DocItemSet } from '../DocItemSet';
import { YamlGenerator } from '../yaml/YamlGenerator';

export class YamlAction extends BaseAction {
  constructor(parser: ApiDocumenterCommandLine) {
    super({
      actionVerb: 'yaml',
      summary: 'Generate documentation as universal reference YAML files (*.yml)',
      documentation: 'Generate documentation as YAML files (*.yml)'
    });
  }

  protected onExecute(): void { // override
    const docItemSet: DocItemSet = this.buildDocItemSet();
    const yamlGenerator: YamlGenerator = new YamlGenerator(docItemSet);
    yamlGenerator.generateFiles(this.outputFolder);
  }
}
