// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { IHeftTaskPlugin } from '../../pluginFramework/IHeftPlugin';
import type { IHeftTaskSession } from '../../pluginFramework/HeftTaskSession';
import type { HeftConfiguration } from '../../configuration/HeftConfiguration';

export default class PreflightTaskPlugin implements IHeftTaskPlugin {
  public apply(session: IHeftTaskSession, configuration: HeftConfiguration): void {
    fs.writeFileSync(path.join(configuration.buildFolderPath, `${session.taskName}-applied`), '');
    session.hooks.run.tap('preflight-test', () => {
      fs.writeFileSync(path.join(configuration.buildFolderPath, `${session.taskName}-ran`), '');
    });
  }
}
