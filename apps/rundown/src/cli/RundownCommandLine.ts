// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineParser } from '@rushstack/ts-command-line';

import { SnapshotAction } from './SnapshotAction.ts';
import { InspectAction } from './InspectAction.ts';

export class RundownCommandLine extends CommandLineParser {
  public constructor() {
    super({
      toolFilename: 'rundown',
      toolDescription:
        'Detect load time regressions by running an app, tracing require() calls,' +
        ' and generating a deterministic report'
    });

    this.addAction(new SnapshotAction());
    this.addAction(new InspectAction());
  }
}
