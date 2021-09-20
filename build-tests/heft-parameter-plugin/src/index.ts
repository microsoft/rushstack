// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  Constants,
  HeftConfiguration,
  HeftSession,
  IHeftPlugin,
  IBuildStageContext,
  ICompileSubstage
} from '@rushstack/heft';
import { FileSystem } from '@rushstack/node-core-library';

interface ICustomParameters {
  customParameter?: boolean;
  customStringParameter?: string;
  customNumberParameter?: number;
  customStringListParameter?: string[];
}

class HeftParameterPlugin implements IHeftPlugin {
  public readonly pluginName: string = 'heft-action-plugin';
  private _customParameter?: boolean;
  private _customStringParameter?: string;
  private _customNumberParameter?: number;
  private _customStringListParameter?: string[];

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.registerParameters<ICustomParameters>({
      actionName: Constants.baseActions.test,
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
      },
      callback: async (customParameters: ICustomParameters) => {
        this._customParameter = customParameters.customParameter;
        this._customStringParameter = customParameters.customStringParameter;
        this._customNumberParameter = customParameters.customNumberParameter;
        this._customStringListParameter = customParameters.customStringListParameter;
      }
    });

    const { buildFolder } = heftConfiguration;

    heftSession.hooks.build.tap(this.pluginName, (build: IBuildStageContext) => {
      build.hooks.compile.tap(this.pluginName, (compile: ICompileSubstage) => {
        compile.hooks.run.tapPromise(this.pluginName, async () => {
          if (this._customParameter) {
            const customContent: string = `${this._customStringParameter?.repeat(
              this._customNumberParameter || 1
            )}_${this._customStringListParameter?.join('_')}`;
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
