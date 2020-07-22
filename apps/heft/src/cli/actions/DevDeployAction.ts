// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { HeftActionBase, IHeftActionBaseOptions } from './HeftActionBase';
import { DevDeployStage, IDevDeployStageOptions } from '../../stages/DevDeployStage';

export class DevDeployAction extends HeftActionBase {
  public constructor(options: IHeftActionBaseOptions) {
    super(
      {
        actionName: 'dev-deploy',
        summary: 'Deploy the current project, and optionally the whole repo, to a testing CDN.',
        documentation: ''
      },
      options
    );
  }

  protected async actionExecuteAsync(): Promise<void> {
    const devDeployStage: DevDeployStage = this.stages.devDeployStage;

    const devDeployStageOptions: IDevDeployStageOptions = {};
    await devDeployStage.initializeAsync(devDeployStageOptions);

    await devDeployStage.executeAsync();
  }
}
