// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TerminalProviderSeverity } from '@rushstack/terminal';

import { EngineTerminalProvider } from '../EngineTerminalProvider';

describe(EngineTerminalProvider.name, () => {
  it('drains buffered diagnostics into the failure description so a later request cannot replay them', () => {
    const terminal: EngineTerminalProvider = new EngineTerminalProvider();
    terminal.write('Permission denied', TerminalProviderSeverity.error);
    expect(terminal.hasBufferedMessages).toBe(true);
    expect(terminal.describeError(new Error('snapshot failed'))).toBe('Permission denied\nsnapshot failed');
    expect(terminal.hasBufferedMessages).toBe(false);
    expect(terminal.describeError(new Error('next request'))).toBe('next request');
  });

  it('discards diagnostics buffered by an earlier request', () => {
    const terminal: EngineTerminalProvider = new EngineTerminalProvider();
    terminal.write('stale', TerminalProviderSeverity.warning);
    terminal.discardBufferedMessages();
    expect(terminal.hasBufferedMessages).toBe(false);
    expect(terminal.describeError('failure')).toBe('failure');
  });
});
