// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  HeftConfiguration,
  HeftSession,
  IHeftPlugin,
  IHeftFlagParameter,
  IHeftStringParameter,
  IHeftIntegerParameter,
  IHeftStringListParameter,
  IHeftChoiceParameter,
  IHeftChoiceListParameter,
  IBuildStageContext,
  ICompileSubstage
} from '@rushstack/heft';
import { FileSystem } from '@rushstack/node-core-library';

class HeftParameterPlugin implements IHeftPlugin {
  public readonly pluginName: string = 'heft-action-plugin';

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    const customParameter: IHeftFlagParameter = heftSession.commandLine.registerFlagParameter({
      associatedActionNames: ['build', 'test', 'start'],
      parameterLongName: '--custom-parameter',
      description: 'Test running a custom parameter'
    });

    const customStringParameter: IHeftStringParameter = heftSession.commandLine.registerStringParameter({
      associatedActionNames: ['build', 'test', 'start'],
      parameterLongName: '--custom-string-parameter',
      description: 'Test running a custom string parameter',
      argumentName: 'TEXT',
      required: true
    });

    const customNumberParameter: IHeftIntegerParameter = heftSession.commandLine.registerIntegerParameter({
      associatedActionNames: ['build', 'test', 'start'],
      parameterLongName: '--custom-number-parameter',
      description: 'Test running a custom number parameter',
      argumentName: 'NUMBER'
    });

    const customStringListParameter: IHeftStringListParameter =
      heftSession.commandLine.registerStringListParameter({
        associatedActionNames: ['build', 'test', 'start'],
        parameterShortName: '-x',
        parameterLongName: '--custom-string-list-parameter',
        description: 'Test running a custom string list parameter',
        argumentName: 'LIST_ITEM'
      });

    const customChoiceParameter: IHeftChoiceParameter = heftSession.commandLine.registerChoiceParameter({
      associatedActionNames: ['build', 'test', 'start'],
      parameterLongName: '--custom-choice-parameter',
      alternatives: ['red', 'blue'],
      description: 'Test running a custom choice parameter'
    });

    const customChoiceListParameter: IHeftChoiceListParameter =
      heftSession.commandLine.registerChoiceListParameter({
        associatedActionNames: ['build', 'test', 'start'],
        parameterShortName: '-y',
        parameterLongName: '--custom-choice-list-parameter',
        alternatives: ['totodile', 'jynx', 'gudetama', 'impidimp', 'wobbuffet'],
        description: 'Test running a custom choice list parameter'
      });

    const { buildFolder } = heftConfiguration;

    heftSession.hooks.build.tap(this.pluginName, (build: IBuildStageContext) => {
      build.hooks.compile.tap(this.pluginName, (compile: ICompileSubstage) => {
        compile.hooks.run.tapPromise(this.pluginName, async () => {
          if (customParameter.actionAssociated && customParameter.value) {
            const customContent: string =
              `customIntegerParameter: ${customNumberParameter.value}\n` +
              `customStringParameter: ${customStringParameter.value}\n` +
              `customStringListParameter: ${customStringListParameter.value?.join(', ')}\n` +
              `customChoiceParameter: ${customChoiceParameter.value}\n` +
              `customChoiceListParameter: ${customChoiceListParameter.value?.join(', ')}`;
            await FileSystem.writeFileAsync(`${buildFolder}/lib/custom_output.txt`, customContent, {
              ensureFolderExists: true
            });
          }
        });
      });
    });
  }
}

export default new HeftParameterPlugin();
