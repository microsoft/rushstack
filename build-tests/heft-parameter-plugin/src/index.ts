// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  HeftConfiguration,
  HeftSession,
  IHeftPlugin,
  IBuildStageContext,
  ICompileSubstage
} from '@rushstack/heft';
import { FileSystem } from '@rushstack/node-core-library';

interface ICustomParameters {
  readonly customParameter?: boolean;
  readonly customStringParameter?: string;
  readonly customNumberParameter?: number;
  readonly customStringListParameter?: string[];
}

class HeftParameterPlugin implements IHeftPlugin {
  public readonly pluginName: string = 'heft-action-plugin';

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    const customParameters: ICustomParameters = heftSession.registerParameters<ICustomParameters>({
      actionName: 'test',
      parameters: {
        customParameter: {
          kind: 'flag',
          parameterLongName: '--custom-parameter',
          description: 'Test running a custom parameter'
        },
        customStringParameter: {
          kind: 'string',
          parameterLongName: '--custom-string-parameter',
          description: 'Test running a custom string parameter'
        },
        customNumberParameter: {
          kind: 'integer',
          parameterLongName: '--custom-number-parameter',
          description: 'Test running a custom number parameter'
        },
        customStringListParameter: {
          kind: 'stringList',
          parameterLongName: '--custom-string-list-parameter',
          description: 'Test running a custom string list parameter'
        }
      }
    });

    const { buildFolder } = heftConfiguration;

    heftSession.hooks.build.tap(this.pluginName, (build: IBuildStageContext) => {
      build.hooks.compile.tap(this.pluginName, (compile: ICompileSubstage) => {
        compile.hooks.run.tapPromise(this.pluginName, async () => {
          if (customParameters.customParameter) {
            const customContent: string = `${customParameters.customStringParameter?.repeat(
              customParameters.customNumberParameter || 1
            )}_${customParameters.customStringListParameter?.join('_')}`;
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
