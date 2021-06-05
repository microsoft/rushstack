// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { HeftConfiguration } from '../../configuration/HeftConfiguration';
import { HeftSession } from '../../pluginFramework/HeftSession';
import { ITestStageContext } from '../../stages/TestStage';
import { MissingPluginBase } from './MissingPluginBase';

const PLUGIN_NAME: string = 'jest-warning-plugin';

export class JestWarningPlugin extends MissingPluginBase {
  public readonly pluginName: string = PLUGIN_NAME;
  public readonly missingPluginName: string = 'JestPlugin';
  public readonly missingPluginPackageNames: ReadonlyArray<string> = ['@rushstack/heft-jest-plugin'];
  public readonly missingPluginDocumentationUrl: string = 'https://rushstack.io/pages/heft_tasks/jest/';

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.hooks.test.tap(PLUGIN_NAME, (test: ITestStageContext) => {
      test.hooks.run.tapPromise(PLUGIN_NAME, async () => {
        await this.checkForMissingPlugin(heftConfiguration, heftSession, test.hooks.run);
      });
    });
  }

  protected getConfigFilePath(heftConfiguration: HeftConfiguration): string {
    return path.join(heftConfiguration.projectConfigFolder, 'jest.config.json');
  }
}
