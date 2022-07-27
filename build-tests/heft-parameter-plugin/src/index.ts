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

const PLUGIN_NAME: string = 'HeftParameterPlugin';

export default class HeftParameterPlugin implements IHeftTaskPlugin {
  public apply(taskSession: IHeftTaskSession, heftConfiguration: HeftConfiguration): void {
    const customParameter: CommandLineFlagParameter = taskSession.getFlagParameter('--custom-parameter');
    const customIntegerParameter: CommandLineIntegerParameter = taskSession.getIntegerParameter(
      '--custom-integer-parameter'
    );
    const customIntegerListParameter: CommandLineIntegerListParameter = taskSession.getIntegerListParameter(
      '--custom-integer-list-parameter'
    );
    const customStringParameter: CommandLineStringParameter =
      taskSession.getStringParameter('--custom-string-parameter');
    const customStringListParameter: CommandLineStringListParameter = taskSession.getStringListParameter(
      '--custom-string-list-parameter'
    );
    const customChoiceParameter: CommandLineChoiceParameter =
      taskSession.getChoiceParameter('--custom-choice-parameter');
    const customChoiceListParameter: CommandLineChoiceListParameter = taskSession.getChoiceListParameter(
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
        await FileSystem.writeFileAsync(`${taskSession.tempFolder}/custom_output.txt`, customContent, {
          ensureFolderExists: true
        });
      }
    });
  }
}
