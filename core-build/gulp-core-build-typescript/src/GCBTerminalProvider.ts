// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { GulpTask } from '@microsoft/gulp-core-build';
import {
  TerminalProviderSeverity,
  ConsoleTerminalProvider
} from '@microsoft/node-core-library';

export class GCBTerminalProvider<TTask = {}> extends ConsoleTerminalProvider {
  private _gcbTask: GulpTask<TTask>;

  constructor(gcbTask: GulpTask<TTask>) {
    super({ verboseEnabled: true });

    this._gcbTask = gcbTask;
  }

  public write(data: string, severity: TerminalProviderSeverity): void {
    data = data.replace(/\r?\n$/, ''); // Trim trailing newlines because the GCB log functions include a newline

    switch (severity) {
      case TerminalProviderSeverity.warning: {
        this._gcbTask.logWarning(data);
        break;
      }

      case TerminalProviderSeverity.error: {
        this._gcbTask.logError(data);
        break;
      }

      case TerminalProviderSeverity.verbose: {
        this._gcbTask.logVerbose(data);
        break;
      }

      case TerminalProviderSeverity.log:
      default: {
        this._gcbTask.log(data);
        break;
      }
    }
  }
}
