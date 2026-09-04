// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  DefaultInteractiveReporter,
  resolveColorEnabled,
  createColorizer,
  truncateToWidth,
  renderActiveProjectsRow,
  renderLiveRegion,
  shouldRefresh,
  type IInteractiveTerminal,
  type IReporterEventEnvelope
} from '../index';

const HIDE_CURSOR: string = '\u001b[?25l';
const SHOW_CURSOR: string = '\u001b[?25h';

class FakeTerminal implements IInteractiveTerminal {
  public columns: number;
  public isTTY: boolean;
  public output: string = '';

  public constructor(columns: number = 80, isTTY: boolean = true) {
    this.columns = columns;
    this.isTTY = isTTY;
  }

  public write(text: string): void {
    this.output += text;
  }
}

function ev(
  type: string,
  payload: unknown = {},
  scope?: { projectName?: string },
  privacy: IReporterEventEnvelope<unknown>['privacy'] = 'public'
): IReporterEventEnvelope<unknown> {
  return { type, payload, scope, privacy, required: true } as unknown as IReporterEventEnvelope<unknown>;
}

describe('interactive rendering helpers', () => {
  it('resolves color from NO_COLOR, FORCE_COLOR, and TTY', () => {
    expect(resolveColorEnabled({ NO_COLOR: '' }, true)).toBe(false);
    expect(resolveColorEnabled({ FORCE_COLOR: '1' }, false)).toBe(true);
    expect(resolveColorEnabled({ FORCE_COLOR: '0' }, true)).toBe(false);
    expect(resolveColorEnabled({ FORCE_COLOR: 'false' }, true)).toBe(false);
    expect(resolveColorEnabled({}, true)).toBe(true);
    expect(resolveColorEnabled({}, false)).toBe(false);
  });

  it('emits ANSI only when color is enabled', () => {
    expect(createColorizer(true).red('x')).toContain('\u001b[31m');
    expect(createColorizer(false).red('x')).toBe('x');
  });

  it('truncates to width with an ellipsis', () => {
    expect(truncateToWidth('hello', 10)).toBe('hello');
    expect(truncateToWidth('hello', 3)).toBe('he…');
    expect(truncateToWidth('hello', 1)).toBe('…');
    expect(truncateToWidth('hello', 0)).toBe('');
    expect(truncateToWidth('a😀b', 4)).toBe('a😀b');
    expect(truncateToWidth('a😀b', 3)).toBe('a…');
    expect(truncateToWidth('界ab', 3)).toBe('界…');
    expect(truncateToWidth('e\u0301x', 2)).toBe('e\u0301x');
  });

  it('renders width-aware active projects with a +N more suffix', () => {
    expect(renderActiveProjectsRow([], 80)).toBe('');
    expect(renderActiveProjectsRow(['a', 'b', 'c'], 80)).toBe('a, b, c');
    expect(renderActiveProjectsRow(['a', 'b', 'c', 'd', 'e'], 10)).toBe('a +4 more');
  });

  it('renders three rows and throttles refreshes', () => {
    const rows: string[] = renderLiveRegion(
      {
        commandName: 'build',
        totalOperations: 10,
        completedOperations: 3,
        failedOperations: 1,
        activeProjects: ['project-a', 'project-b'],
        latestActivity: 'building project-a'
      },
      { width: 80, spinnerFrame: '⠋', color: createColorizer(false) }
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain('build');
    expect(rows[0]).toContain('3/10');
    expect(rows[0]).toContain('1 failed');
    expect(rows[1]).toContain('project-a');
    expect(rows[2]).toBe('building project-a');

    expect(shouldRefresh(0, 50, 100)).toBe(false);
    expect(shouldRefresh(0, 100, 100)).toBe(true);
  });
});

describe('DefaultInteractiveReporter', () => {
  it('honors NO_COLOR and FORCE_COLOR when color is not explicit', async () => {
    const noColorTerminal: FakeTerminal = new FakeTerminal();
    const noColorReporter: DefaultInteractiveReporter = new DefaultInteractiveReporter({
      terminal: noColorTerminal,
      env: { NO_COLOR: '' }
    });
    noColorReporter.report(ev('commandResult', { succeeded: false, exitCode: 1 }));
    await noColorReporter.closeAsync();
    expect(noColorTerminal.output).not.toContain('\u001b[31m');

    const forceColorTerminal: FakeTerminal = new FakeTerminal(80, false);
    const forceColorReporter: DefaultInteractiveReporter = new DefaultInteractiveReporter({
      terminal: forceColorTerminal,
      env: { FORCE_COLOR: '1' }
    });
    forceColorReporter.report(ev('commandResult', { succeeded: false, exitCode: 1 }));
    await forceColorReporter.closeAsync();
    expect(forceColorTerminal.output).toContain('\u001b[31m');
  });

  it('hides the cursor and paints the live region on TTY, throttled to 10 Hz', async () => {
    let now: number = 0;
    const terminal: FakeTerminal = new FakeTerminal();
    const reporter: DefaultInteractiveReporter = new DefaultInteractiveReporter({
      terminal,
      color: false,
      nowMs: () => now
    });
    await reporter.initializeAsync();

    reporter.report(ev('commandStarted', { commandName: 'buildX' })); // paints at now=0
    now = 50;
    reporter.report(ev('operationRegistered', { operationId: 'op1' })); // throttled
    now = 60;
    reporter.report(
      ev('operationStatusChanged', { operationId: 'op1', status: 'executing' }, { projectName: 'p' })
    );
    now = 120;
    reporter.report(
      ev('operationStatusChanged', { operationId: 'op2', status: 'executing' }, { projectName: 'q' })
    ); // paints

    expect(terminal.output).toContain(HIDE_CURSOR);
    expect(terminal.output.split('buildX').length - 1).toBe(2);
  });

  it('leaves a single success line and restores the cursor', async () => {
    const terminal: FakeTerminal = new FakeTerminal();
    const reporter: DefaultInteractiveReporter = new DefaultInteractiveReporter({
      terminal,
      color: false,
      nowMs: () => 0
    });
    await reporter.initializeAsync();
    reporter.report(ev('commandStarted', { commandName: 'build' }));
    reporter.report(ev('operationRegistered', { operationId: 'op1' }));
    reporter.report(
      ev('operationStatusChanged', { operationId: 'op1', status: 'success' }, { projectName: 'p' })
    );
    reporter.report(ev('operationCompleted', { operationId: 'op1', status: 'success' }));
    reporter.report(ev('commandResult', { commandName: 'build', succeeded: true, exitCode: 0 }));
    await reporter.closeAsync();

    expect(terminal.output).toContain('✔');
    expect(terminal.output).toContain('build succeeded — 1/1 operations');
    expect(terminal.output).toContain(SHOW_CURSOR);
  });

  it('uses registration metadata for status events', async () => {
    const terminal: FakeTerminal = new FakeTerminal();
    const reporter: DefaultInteractiveReporter = new DefaultInteractiveReporter({
      terminal,
      color: false,
      nowMs: () => 0
    });
    reporter.report(
      ev('operationRegistered', {
        operationId: 'op1',
        projectName: 'project-a',
        phaseName: '_phase:build'
      })
    );
    reporter.report(ev('operationStatusChanged', { operationId: 'op1', status: 'executing' }));
    reporter.report(ev('operationCompleted', { operationId: 'op1', status: 'success' }));
    await reporter.flushAsync();

    expect(terminal.output).toContain('project-a (_phase:build)');
    expect(terminal.output).not.toContain('executing op1');
  });

  it('normalizes multiline activity to one live-region row', async () => {
    const terminal: FakeTerminal = new FakeTerminal();
    const reporter: DefaultInteractiveReporter = new DefaultInteractiveReporter({
      terminal,
      color: false,
      nowMs: () => 0
    });
    reporter.report(ev('commandStarted', { commandName: 'build' }));
    reporter.report(ev('messageEmitted', { severity: 'info', text: 'first line\nsecond line\n' }));
    await reporter.flushAsync();

    expect(terminal.output).toContain('second line');
    expect(terminal.output).not.toContain('first line\nsecond line');
  });

  it('omits silent operations from progress totals', async () => {
    const terminal: FakeTerminal = new FakeTerminal();
    const reporter: DefaultInteractiveReporter = new DefaultInteractiveReporter({
      terminal,
      color: false,
      nowMs: () => 0
    });
    reporter.report(
      ev('operationRegistered', { operationId: 'silent', projectName: 'hidden', silent: true })
    );
    reporter.report(ev('operationStatusChanged', { operationId: 'silent', status: 'success' }));
    reporter.report(ev('operationCompleted', { operationId: 'silent', status: 'success' }));
    reporter.report(ev('commandResult', { commandName: 'build', succeeded: true, exitCode: 0 }));
    await reporter.closeAsync();

    expect(terminal.output).toContain('0/0 operations');
    expect(terminal.output).not.toContain('hidden');
  });

  it('appends a bounded diagnostic block and log path on failure', async () => {
    const terminal: FakeTerminal = new FakeTerminal();
    const reporter: DefaultInteractiveReporter = new DefaultInteractiveReporter({
      terminal,
      color: false,
      nowMs: () => 0,
      logPath: '/tmp/rush-logs/latest.log'
    });
    await reporter.initializeAsync();
    reporter.report(ev('commandStarted', { commandName: 'build' }));
    reporter.report(
      ev('operationStatusChanged', { operationId: 'op1', status: 'failure' }, { projectName: 'p' })
    );
    reporter.report(ev('operationCompleted', { operationId: 'op1', status: 'failure' }));
    reporter.report(ev('diagnosticEmitted', { code: 'RUSH_OPERATION_FAILED', severity: 'error' }));
    reporter.report(ev('commandResult', { commandName: 'build', succeeded: false, exitCode: 1 }));
    await reporter.closeAsync();

    expect(terminal.output).toContain('✖');
    expect(terminal.output).toContain('build failed — 1 failed');
    expect(terminal.output).toContain('[error] RUSH_OPERATION_FAILED');
    expect(terminal.output).toContain('Log: /tmp/rush-logs/latest.log');
  });

  it('preserves actionable lock contention text on failure', async () => {
    const terminal: FakeTerminal = new FakeTerminal();
    const reporter: DefaultInteractiveReporter = new DefaultInteractiveReporter({
      terminal,
      color: false,
      nowMs: () => 0
    });
    await reporter.initializeAsync();
    reporter.report(ev('commandStarted', { commandName: 'build' }));
    reporter.report(
      ev('messageEmitted', {
        severity: 'error',
        text: 'Another Rush command is already running in this repository.\n'
      })
    );
    reporter.report(ev('commandResult', { commandName: 'build', succeeded: false, exitCode: 1 }));
    await reporter.closeAsync();

    expect(
      terminal.output.match(/Another Rush command is already running in this repository\./g)
    ).toHaveLength(1);
  });

  it('redacts secret message text', async () => {
    const terminal: FakeTerminal = new FakeTerminal(80, false);
    const reporter: DefaultInteractiveReporter = new DefaultInteractiveReporter({
      terminal,
      color: false,
      nowMs: () => 0
    });
    await reporter.initializeAsync();
    reporter.report(ev('commandStarted', { commandName: 'build' }));
    reporter.report(
      ev('messageEmitted', { severity: 'error', text: 'TOP_SECRET_VALUE' }, undefined, 'secret')
    );
    reporter.report(ev('commandResult', { commandName: 'build', succeeded: false, exitCode: 1 }));
    await reporter.closeAsync();

    expect(terminal.output).toContain('[secret]');
    expect(terminal.output).not.toContain('TOP_SECRET_VALUE');
  });

  it('fails closed when commandResult is missing', async () => {
    const terminal: FakeTerminal = new FakeTerminal();
    const reporter: DefaultInteractiveReporter = new DefaultInteractiveReporter({
      terminal,
      color: false,
      nowMs: () => 0
    });
    await reporter.initializeAsync();
    reporter.report(ev('commandStarted', { commandName: 'build' }));
    await reporter.closeAsync();

    expect(terminal.output).toContain('✖');
    expect(terminal.output).toContain('build failed');
    expect(terminal.output).not.toContain('build succeeded');
  });

  it('reports overlapping watch iterations independently and recovers from failure', async () => {
    const terminal: FakeTerminal = new FakeTerminal();
    const reporter: DefaultInteractiveReporter = new DefaultInteractiveReporter({
      terminal,
      color: false,
      nowMs: () => 0
    });
    await reporter.initializeAsync();
    reporter.report(ev('commandStarted', { commandName: 'build' }));
    reporter.report(
      ev('operationRegistered', { iterationId: 1, operationId: 'op1', projectName: 'project-a' })
    );
    reporter.report(
      ev('operationRegistered', { iterationId: 1, operationId: 'abort', projectName: 'project-abort' })
    );
    reporter.report(
      ev('operationRegistered', { iterationId: 2, operationId: 'op1', projectName: 'project-a' })
    );
    reporter.report(
      ev('operationRegistered', {
        iterationId: 2,
        operationId: 'silent',
        projectName: 'hidden',
        silent: true
      })
    );
    reporter.report(ev('operationCompleted', { iterationId: 1, operationId: 'op1', status: 'failure' }));
    reporter.report(ev('operationCompleted', { iterationId: 1, operationId: 'abort', status: 'aborted' }));
    reporter.report(ev('watchCycleCompleted', { iterationId: 1, succeeded: false }));
    reporter.report(ev('operationCompleted', { iterationId: 2, operationId: 'op1', status: 'success' }));
    reporter.report(ev('operationCompleted', { iterationId: 2, operationId: 'silent', status: 'noOp' }));
    reporter.report(ev('watchCycleCompleted', { iterationId: 2, succeeded: true }));
    reporter.report(ev('commandResult', { commandName: 'build', succeeded: true, exitCode: 0 }));
    await reporter.closeAsync();

    expect(terminal.output).toContain('watch cycle failed - 2/2 operations');
    expect(terminal.output).toContain('watch cycle succeeded - 1/1 operations');
    expect(terminal.output).not.toContain('3/3 operations');
    expect(terminal.output).not.toContain('hidden');
  });

  it('does not paint a live region on a non-TTY but still writes the final summary', async () => {
    const terminal: FakeTerminal = new FakeTerminal(80, false);
    const reporter: DefaultInteractiveReporter = new DefaultInteractiveReporter({
      terminal,
      color: false,
      nowMs: () => 0
    });
    await reporter.initializeAsync();
    reporter.report(ev('commandStarted', { commandName: 'build' }));
    reporter.report(ev('commandResult', { commandName: 'build', succeeded: true, exitCode: 0 }));
    await reporter.closeAsync();

    expect(terminal.output).not.toContain(HIDE_CURSOR);
    expect(terminal.output).toContain('build succeeded');
  });
});
