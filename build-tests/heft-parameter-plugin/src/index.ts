// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem } from '@rushstack/node-core-library';
import type {
  HeftConfiguration,
  IHeftTaskSession,
  IHeftTaskPlugin,
  IHeftTaskRunHookOptions,
  CommandLineFlagParameter,
  CommandLineStringParameter,
  CommandLineChoiceParameter,
  CommandLineStringListParameter,
  CommandLineChoiceListParameter,
  CommandLineIntegerParameter,
  CommandLineIntegerListParameter
} from '@rushstack/heft';

const PLUGIN_NAME: string = 'heft-action-plugin';

export default class HeftParameterPlugin implements IHeftTaskPlugin {
  public apply(taskSession: IHeftTaskSession, heftConfiguration: HeftConfiguration): void {
    const customParameter: CommandLineFlagParameter = taskSession.parametersByLongName.get(
      '--custom-parameter'
    ) as CommandLineFlagParameter;
    const customIntegerParameter: CommandLineIntegerParameter = taskSession.parametersByLongName.get(
      '--custom-integer-parameter'
    ) as CommandLineIntegerParameter;
    const customIntegerListParameter: CommandLineIntegerListParameter = taskSession.parametersByLongName.get(
      '--custom-integer-list-parameter'
    ) as CommandLineIntegerListParameter;
    const customStringParameter: CommandLineStringParameter = taskSession.parametersByLongName.get(
      '--custom-string-parameter'
    ) as CommandLineStringParameter;
    const customStringListParameter: CommandLineStringListParameter = taskSession.parametersByLongName.get(
      '--custom-string-list-parameter'
    ) as CommandLineStringListParameter;
    const customChoiceParameter: CommandLineChoiceParameter = taskSession.parametersByLongName.get(
      '--custom-choice-parameter'
    ) as CommandLineChoiceParameter;
    const customChoiceListParameter: CommandLineChoiceListParameter = taskSession.parametersByLongName.get(
      '--custom-choice-list-parameter'
    ) as CommandLineChoiceListParameter;

    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
      if (customParameter.value) {
        const customContent: string =
          `customIntegerParameter: ${customIntegerParameter.value}\n` +
          `customIntegerListParameter: ${customIntegerListParameter.values?.join(', ')}\n` +
          `customStringParameter: ${customStringParameter.value}\n` +
          `customStringListParameter: ${customStringListParameter.values?.join(', ')}\n` +
          `customChoiceParameter: ${customChoiceParameter.value}\n` +
          `customChoiceListParameter: ${customChoiceListParameter.values?.join(', ')}`;
        await FileSystem.writeFileAsync(`${taskSession.tempFolder}/custom_output.txt`, customContent, {
          ensureFolderExists: true
        });
      }
    });
  }
}
