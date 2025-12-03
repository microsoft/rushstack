// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { LoaderContext } from 'webpack';

import { type ITerminalProvider, TerminalProviderSeverity } from '@rushstack/terminal';

export class LoaderTerminalProvider {
  public static getTerminalProviderForLoader(loaderContext: LoaderContext<{}>): ITerminalProvider {
    return {
      supportsColor: false,
      eolCharacter: '\n',
      write: (data: string, severity: TerminalProviderSeverity) => {
        switch (severity) {
          case TerminalProviderSeverity.error: {
            loaderContext.emitError(new Error(data));
            break;
          }

          case TerminalProviderSeverity.warning: {
            loaderContext.emitWarning(new Error(data));
            break;
          }
        }
      }
    };
  }
}
