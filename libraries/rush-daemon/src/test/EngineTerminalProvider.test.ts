// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AlreadyReportedError } from '@rushstack/node-core-library';
import { TerminalProviderSeverity } from '@rushstack/terminal';

import { EngineTerminalProvider } from '../EngineTerminalProvider';
import { WorkspaceEngineRecreationRequiredError } from '../WorkspaceEngineComponentFactory';

describe(EngineTerminalProvider.name, () => {
  it('drains buffered diagnostics into the failure description so a later request cannot replay them', () => {
    const terminal: EngineTerminalProvider = new EngineTerminalProvider();
    terminal.write('Permission denied', TerminalProviderSeverity.error);
    expect(terminal.hasBufferedMessages).toBe(true);
    expect(terminal.describeError(new Error('snapshot failed'))).toBe('snapshot failed\nPermission denied');
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
    expect(failure.message).toBe('could not capture\nbinding request diagnostic\nPermission denied');

    terminal.write('stale', TerminalProviderSeverity.warning);
    await expect(terminal.reconcileWithRequestDiagnosticsAsync(async () => 'ok')).resolves.toBe('ok');
    expect(terminal.hasBufferedMessages).toBe(false);
  });

  it('describes a failure without the verbose and debug messages that loading a workspace writes', () => {
    const terminal: EngineTerminalProvider = new EngineTerminalProvider();
    terminal.write('Incremental strategy: cache restoration\n', TerminalProviderSeverity.verbose);
    for (let index: number = 0; index < 1000; index++) {
      terminal.write(
        `Configuration file "p${index}/config/rush-project.json" not found.\n`,
        TerminalProviderSeverity.debug
      );
    }
    terminal.write('\n', TerminalProviderSeverity.log);
    terminal.write('Project "a" has no "build" script.\n', TerminalProviderSeverity.warning);
    expect(terminal.describeError(new Error('selection failed'))).toBe(
      'selection failed\nProject "a" has no "build" script.'
    );
  });

  it('describes an already reported error by the error lines written before it', () => {
    const terminal: EngineTerminalProvider = new EngineTerminalProvider();
    terminal.write('Incremental strategy: cache restoration\n', TerminalProviderSeverity.verbose);
    terminal.write(
      'The project name "@x/nope" passed to "--to" does not exist in rush.json.\n',
      TerminalProviderSeverity.error
    );
    expect(terminal.describeError(new AlreadyReportedError())).toBe(
      'The project name "@x/nope" passed to "--to" does not exist in rush.json.'
    );

    terminal.write('No error line was written.\n', TerminalProviderSeverity.warning);
    expect(terminal.describeError(new AlreadyReportedError())).toBe(
      'An error occurred.\nNo error line was written.'
    );
  });

  it('gives the error first, since clients give the first line as the reason, and the other lines in order', () => {
    const terminal: EngineTerminalProvider = new EngineTerminalProvider();
    const warning: string =
      `The daemon's compatible plugin list names plugins that are not configured in rush-plugins.json: ` +
      `"no-such-plugin".`;
    const unknownProject: string = 'The project name "@x/nope" passed to "--to" does not exist in rush.json.';
    terminal.write(`${warning}\n`, TerminalProviderSeverity.warning);
    terminal.write(`${unknownProject}\n`, TerminalProviderSeverity.error);
    expect(terminal.describeError(new AlreadyReportedError())).toBe(`${unknownProject}\n${warning}`);

    terminal.write(`${warning}\n`, TerminalProviderSeverity.warning);
    expect(terminal.describeError(new Error('Plugins must be daemon-compatible.'))).toBe(
      `Plugins must be daemon-compatible.\n${warning}`
    );

    terminal.write(`${warning}\n`, TerminalProviderSeverity.warning);
    terminal.write('first error\n', TerminalProviderSeverity.error);
    terminal.write('second error\n', TerminalProviderSeverity.error);
    expect(terminal.describeError(new AlreadyReportedError())).toBe(`first error\n${warning}\nsecond error`);
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
