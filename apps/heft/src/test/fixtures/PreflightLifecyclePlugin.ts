// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { IHeftLifecyclePlugin } from '../../pluginFramework/IHeftPlugin';
import type { IHeftLifecycleSession } from '../../pluginFramework/HeftLifecycleSession';
import type { HeftConfiguration } from '../../configuration/HeftConfiguration';

export default class PreflightLifecyclePlugin implements IHeftLifecyclePlugin {
  public apply(session: IHeftLifecycleSession, configuration: HeftConfiguration): void {
    fs.writeFileSync(path.join(configuration.buildFolderPath, 'lifecycle-applied'), '');
    session.hooks.toolStart.tap('preflight-test', () => {
      fs.writeFileSync(path.join(configuration.buildFolderPath, 'lifecycle-started'), '');
    });
    session.hooks.clean.tap('preflight-test', () => {
      fs.unlinkSync(path.join(configuration.buildFolderPath, 'lifecycle-output'));
    });
  }
}
