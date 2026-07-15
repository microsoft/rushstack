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
  scope?: { projectName?: string }
): IReporterEventEnvelope<unknown> {
  return { type, payload, scope, required: true } as unknown as IReporterEventEnvelope<unknown>;
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
    reporter.report(ev('commandResult', { commandName: 'build', succeeded: true, exitCode: 0 }));
    await reporter.closeAsync();

    expect(terminal.output).toContain('✔');
    expect(terminal.output).toContain('build succeeded — 1/1 operations');
    expect(terminal.output).toContain(SHOW_CURSOR);
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
    reporter.report(ev('diagnosticEmitted', { code: 'RUSH_OPERATION_FAILED', severity: 'error' }));
    reporter.report(ev('commandResult', { commandName: 'build', succeeded: false, exitCode: 1 }));
    await reporter.closeAsync();

    expect(terminal.output).toContain('✖');
    expect(terminal.output).toContain('build failed — 1 failed');
    expect(terminal.output).toContain('[error] RUSH_OPERATION_FAILED');
    expect(terminal.output).toContain('Log: /tmp/rush-logs/latest.log');
  });

  it('appends one summary per completed watch cycle while keeping the live region', async () => {
    const terminal: FakeTerminal = new FakeTerminal();
    const reporter: DefaultInteractiveReporter = new DefaultInteractiveReporter({
      terminal,
      color: false,
      nowMs: () => 0
    });
    await reporter.initializeAsync();
    reporter.report(ev('commandStarted', { commandName: 'build' }));
    reporter.report(ev('watchCycleCompleted', { succeeded: true }));

    expect(terminal.output).toContain('watch cycle succeeded');
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
