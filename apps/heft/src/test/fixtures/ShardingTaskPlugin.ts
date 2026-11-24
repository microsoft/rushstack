// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs';
import path from 'node:path';

import type { IHeftTaskPlugin } from '../../pluginFramework/IHeftPlugin';
import type { IHeftTaskSession } from '../../pluginFramework/HeftTaskSession';
import type { HeftConfiguration } from '../../configuration/HeftConfiguration';
import { validateShardPath } from '../../sharding/ShardFileSystem';

export default class ShardingTaskPlugin implements IHeftTaskPlugin {
  public apply(session: IHeftTaskSession, configuration: HeftConfiguration): void {
    validateShardPath(configuration.buildFolderPath, session.tempFolderPath);
    fs.mkdirSync(session.tempFolderPath, { recursive: true });
    fs.writeFileSync(
      path.join(session.tempFolderPath, 'session.json'),
      JSON.stringify({
        sharding: configuration.sharding,
        source: configuration.buildFolderPath,
        output: configuration.outputFolderPath,
        temp: configuration.tempFolderPath,
        taskTemp: session.tempFolderPath,
        phase: session.phaseName,
        task: session.taskName
      })
    );
    session.hooks.run.tap('sharding-test', () => {
      fs.writeFileSync(path.join(session.tempFolderPath, 'ran'), '');
    });
  }
}
