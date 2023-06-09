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

const PLUGIN_NAME: string = 'heft-parameter-plugin';

export default class HeftParameterPlugin implements IHeftTaskPlugin {
  public apply(taskSession: IHeftTaskSession, heftConfiguration: HeftConfiguration): void {
    const { parameters } = taskSession;

    const customParameter: CommandLineFlagParameter = parameters.getFlagParameter('--custom-parameter');
    const customIntegerParameter: CommandLineIntegerParameter = parameters.getIntegerParameter(
      '--custom-integer-parameter'
    );
    const customIntegerListParameter: CommandLineIntegerListParameter = parameters.getIntegerListParameter(
      '--custom-integer-list-parameter'
    );
    const customStringParameter: CommandLineStringParameter =
      parameters.getStringParameter('--custom-string-parameter');
    const customStringListParameter: CommandLineStringListParameter = parameters.getStringListParameter(
      '--custom-string-list-parameter'
    );
    const customChoiceParameter: CommandLineChoiceParameter =
      parameters.getChoiceParameter('--custom-choice-parameter');
    const customChoiceListParameter: CommandLineChoiceListParameter = parameters.getChoiceListParameter(
      '--custom-choice-list-parameter'
    );

    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
      if (customParameter.value) {
        const customContent: string =
          `customIntegerParameter: ${customIntegerParameter.value}\n` +
          `customIntegerListParameter: ${customIntegerListParameter.values?.join(', ')}\n` +
          `customStringParameter: ${customStringParameter.value}\n` +
          `customStringListParameter: ${customStringListParameter.values?.join(', ')}\n` +
          `customChoiceParameter: ${customChoiceParameter.value}\n` +
          `customChoiceListParameter: ${customChoiceListParameter.values?.join(', ')}`;
        await FileSystem.writeFileAsync(`${taskSession.tempFolderPath}/custom_output.txt`, customContent, {
          ensureFolderExists: true
        });
      }
    });
  }
}
