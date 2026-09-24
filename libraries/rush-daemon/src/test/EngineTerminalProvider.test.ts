// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TerminalProviderSeverity } from '@rushstack/terminal';

import { EngineTerminalProvider } from '../EngineTerminalProvider';
import { WorkspaceEngineRecreationRequiredError } from '../WorkspaceEngineComponentFactory';

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

  it('scopes reconcile diagnostics to the request whose reconcile produced them', async () => {
    const terminal: EngineTerminalProvider = new EngineTerminalProvider();
    terminal.write('binding request diagnostic', TerminalProviderSeverity.warning);
    const failure: RangeError = new RangeError('could not capture');
    await expect(
      terminal.reconcileWithRequestDiagnosticsAsync(async () => {
        terminal.write('Permission denied', TerminalProviderSeverity.error);
        throw failure;
      })
    ).rejects.toBe(failure);
    expect(failure.message).toBe('binding request diagnostic\nPermission denied\ncould not capture');

    terminal.write('stale', TerminalProviderSeverity.warning);
    await expect(terminal.reconcileWithRequestDiagnosticsAsync(async () => 'ok')).resolves.toBe('ok');
    expect(terminal.hasBufferedMessages).toBe(false);
  });

  it('drops diagnostics when the engine must be recreated', async () => {
    const terminal: EngineTerminalProvider = new EngineTerminalProvider();
    const recreate: WorkspaceEngineRecreationRequiredError = new WorkspaceEngineRecreationRequiredError();
    const message: string = recreate.message;
    await expect(
      terminal.reconcileWithRequestDiagnosticsAsync(async () => {
        terminal.write('stale', TerminalProviderSeverity.error);
        throw recreate;
      })
    ).rejects.toBe(recreate);
    expect(recreate.message).toBe(message);
    expect(terminal.hasBufferedMessages).toBe(false);
  });
});
