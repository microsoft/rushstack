// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IHeftTaskPlugin } from '../../pluginFramework/IHeftPlugin';
import type { IHeftTaskSession } from '../../pluginFramework/HeftTaskSession';

export default class PreflightTaskPlugin implements IHeftTaskPlugin {
  public apply(session: IHeftTaskSession): void {
    session.logger.terminal.writeLine(`${session.taskName}-applied`);
    session.hooks.run.tap('preflight-test', () => {
      session.logger.terminal.writeLine(`${session.taskName}-ran`);
    });
  }
}
