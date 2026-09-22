// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  CommandLineFlagParameter,
  IRequiredCommandLineChoiceParameter
} from '@rushstack/ts-command-line';

import type { ApiDocumenterCommandLine } from './ApiDocumenterCommandLine';
import { BaseAction } from './BaseAction';
import { YamlDocumenter, type YamlFormat } from '../documenters/YamlDocumenter';
import { OfficeYamlDocumenter } from '../documenters/OfficeYamlDocumenter';

export class YamlAction extends BaseAction {
  readonly #officeParameter: CommandLineFlagParameter;
  readonly #newDocfxNamespacesParameter: CommandLineFlagParameter;
  readonly #yamlFormatParameter: IRequiredCommandLineChoiceParameter<YamlFormat>;

  public constructor(parser: ApiDocumenterCommandLine) {
    super({
      actionName: 'yaml',
      summary: 'Generate documentation as universal reference YAML files (*.yml)',
      documentation:
        'Generates API documentation as a collection of files conforming' +
        ' to the universal reference YAML format, which is used by the docs.microsoft.com' +
        ' pipeline.'
    });

    this.#officeParameter = this.defineFlagParameter({
      parameterLongName: '--office',
      description: `Enables some additional features specific to Office Add-ins`
    });
    this.#newDocfxNamespacesParameter = this.defineFlagParameter({
      parameterLongName: '--new-docfx-namespaces',
      description:
        `This enables an experimental feature that will be officially released with the next major version` +
        ` of API Documenter.  It requires DocFX 2.46 or newer.  It enables documentation for namespaces and` +
        ` adds them to the table of contents.  This will also affect file layout as namespaced items will be nested` +
        ` under a directory for the namespace instead of just within the package.`
    });
    this.#yamlFormatParameter = this.defineChoiceParameter<YamlFormat>({
      parameterLongName: '--yaml-format',
      alternatives: ['udp', 'sdp'],
      defaultValue: 'sdp',
      description:
        `Specifies the YAML format - udp or sdp. Universal Document Processor (udp) should be used if you generating` +
        ` YAML files for DocFX 2.x. Schema Driven Processor (sdp) should be used with DocFX 3.x.` +
        ` NOTE: This parameter is ignored if you use --office.`
    });
  }

  protected override async onExecuteAsync(): Promise<void> {
    const { apiModel, inputFolder, outputFolder } = this.buildApiModel();

    const yamlDocumenter: YamlDocumenter = this.#officeParameter.value
      ? new OfficeYamlDocumenter(apiModel, inputFolder, this.#newDocfxNamespacesParameter.value)
      : new YamlDocumenter(
          apiModel,
          this.#newDocfxNamespacesParameter.value,
          this.#yamlFormatParameter.value
        );

    yamlDocumenter.generateFiles(outputFolder);
  }
}
