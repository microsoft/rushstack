// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs';
import path from 'node:path';

import type { IHeftLifecyclePlugin } from '../../pluginFramework/IHeftPlugin';
import type { IHeftLifecycleSession } from '../../pluginFramework/HeftLifecycleSession';
import type { HeftConfiguration } from '../../configuration/HeftConfiguration';

export default class ShardingLifecyclePlugin implements IHeftLifecyclePlugin {
  public apply(session: IHeftLifecycleSession, configuration: HeftConfiguration): void {
    fs.mkdirSync(session.tempFolderPath, { recursive: true });
    fs.writeFileSync(
      path.join(session.tempFolderPath, 'session.json'),
      JSON.stringify({
        sharding: configuration.sharding,
        source: configuration.buildFolderPath,
        output: configuration.outputFolderPath,
        temp: configuration.tempFolderPath,
        taskTemp: session.tempFolderPath
      })
    );
  }
}
