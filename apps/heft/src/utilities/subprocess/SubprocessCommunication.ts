// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TerminalProviderSeverity } from '@rushstack/node-core-library';

export interface IBaseSubprocessMessage {
  type: 'logging' | 'exit';
}

export interface ISubprocessLoggingMessage extends IBaseSubprocessMessage {
  type: 'logging';
  data: string;
  severity: TerminalProviderSeverity;
}
