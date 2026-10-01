// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { _IOperationActivityOptions } from '@microsoft/rush-lib';
import { TerminalProviderSeverity } from '@rushstack/terminal';

/**
 * Activity options for text that Rush or a Rush plugin wrote through a daemon engine's terminal. The graph's event
 * sink (PhasedRequestEventMultiplexer) passes the options object unchanged to each request's event sink.
 */
export interface IEngineActivityOptions extends _IOperationActivityOptions {
  /**
   * Set when the text is a warning or an error. Request event sinks copy it into the activity payload, so
   * clients that print only a summary can still show these lines.
   */
  readonly severity?: 'warning' | 'error';
}

const WARNING_ACTIVITY: IEngineActivityOptions = { stderr: true, severity: 'warning' };
const ERROR_ACTIVITY: IEngineActivityOptions = { stderr: true, severity: 'error' };
const OUTPUT_ACTIVITY: IEngineActivityOptions = { stderr: false };

export function getEngineActivityOptions(severity: TerminalProviderSeverity): IEngineActivityOptions {
  switch (severity) {
    case TerminalProviderSeverity.warning:
      return WARNING_ACTIVITY;
    case TerminalProviderSeverity.error:
      return ERROR_ACTIVITY;
    default:
      return OUTPUT_ACTIVITY;
  }
}
