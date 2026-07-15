// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  shouldRenderAtLogLevel,
  getEventMinimumLogLevel,
  getLogLevelRank,
  filterEventsForLogLevel,
  FILE_REPORTER_DEFAULT_LOG_LEVEL,
  type IReporterEventEnvelope,
  type ReporterLogLevel
} from '../index';

function ev(type: string, payload: unknown = {}, required: boolean = false): IReporterEventEnvelope<unknown> {
  return { type, payload, required } as unknown as IReporterEventEnvelope<unknown>;
}

const ALL_LEVELS: readonly ReporterLogLevel[] = ['quiet', 'normal', 'verbose', 'debug'];

describe('getLogLevelRank', () => {
  it('orders the levels from quiet to debug', () => {
    expect(getLogLevelRank('quiet')).toBe(0);
    expect(getLogLevelRank('normal')).toBe(1);
    expect(getLogLevelRank('verbose')).toBe(2);
    expect(getLogLevelRank('debug')).toBe(3);
  });
});

describe('getEventMinimumLogLevel', () => {
  it('classifies failures, required warnings, and results as quiet', () => {
    expect(getEventMinimumLogLevel(ev('commandResult', { succeeded: false, exitCode: 1 }))).toBe('quiet');
    expect(getEventMinimumLogLevel(ev('diagnosticEmitted', { severity: 'error' }))).toBe('quiet');
    expect(getEventMinimumLogLevel(ev('diagnosticEmitted', { severity: 'warning' }, true))).toBe('quiet');
  });

  it('classifies standard lifecycle and non-required warnings as normal', () => {
    expect(getEventMinimumLogLevel(ev('commandStarted', { commandName: 'build' }))).toBe('normal');
    expect(getEventMinimumLogLevel(ev('operationStatusChanged', { status: 'success' }))).toBe('normal');
    expect(getEventMinimumLogLevel(ev('diagnosticEmitted', { severity: 'warning' }, false))).toBe('normal');
  });

  it('classifies external activity as verbose and debug details as debug', () => {
    expect(getEventMinimumLogLevel(ev('externalOutput', { stream: 'stdout', text: 'x' }))).toBe('verbose');
    expect(getEventMinimumLogLevel(ev('externalProcessStarted', {}))).toBe('verbose');
    expect(
      getEventMinimumLogLevel(ev('activityChanged', { kind: 'message', severity: 'debug', text: 'd' }))
    ).toBe('debug');
    expect(getEventMinimumLogLevel(ev('extension', { name: 'a.b' }, false))).toBe('debug');
  });
});

describe('shouldRenderAtLogLevel', () => {
  it('renders only failures, required warnings, and the result at quiet', () => {
    expect(shouldRenderAtLogLevel('quiet', ev('diagnosticEmitted', { severity: 'error' }))).toBe(true);
    expect(shouldRenderAtLogLevel('quiet', ev('diagnosticEmitted', { severity: 'warning' }, true))).toBe(
      true
    );
    expect(shouldRenderAtLogLevel('quiet', ev('commandResult', { succeeded: true, exitCode: 0 }))).toBe(true);
    expect(shouldRenderAtLogLevel('quiet', ev('diagnosticEmitted', { severity: 'warning' }, false))).toBe(
      false
    );
    expect(shouldRenderAtLogLevel('quiet', ev('commandStarted', {}))).toBe(false);
    expect(shouldRenderAtLogLevel('quiet', ev('externalOutput', {}))).toBe(false);
  });

  it('adds lifecycle and diagnostics at normal but not external or debug detail', () => {
    expect(shouldRenderAtLogLevel('normal', ev('commandStarted', {}))).toBe(true);
    expect(shouldRenderAtLogLevel('normal', ev('diagnosticEmitted', { severity: 'warning' }, false))).toBe(
      true
    );
    expect(shouldRenderAtLogLevel('normal', ev('externalOutput', {}))).toBe(false);
    expect(
      shouldRenderAtLogLevel('normal', ev('activityChanged', { kind: 'message', severity: 'debug' }))
    ).toBe(false);
  });

  it('adds external activity at verbose and everything at debug', () => {
    expect(shouldRenderAtLogLevel('verbose', ev('externalOutput', {}))).toBe(true);
    expect(
      shouldRenderAtLogLevel('verbose', ev('activityChanged', { kind: 'message', severity: 'debug' }))
    ).toBe(false);
    expect(
      shouldRenderAtLogLevel('debug', ev('activityChanged', { kind: 'message', severity: 'debug' }))
    ).toBe(true);
    expect(shouldRenderAtLogLevel('debug', ev('extension', { name: 'a.b' }, false))).toBe(true);
  });

  it('is monotonic: an event shown at a level is shown at every higher level', () => {
    const events: IReporterEventEnvelope<unknown>[] = [
      ev('commandResult', { succeeded: true, exitCode: 0 }),
      ev('diagnosticEmitted', { severity: 'error' }),
      ev('diagnosticEmitted', { severity: 'warning' }, false),
      ev('commandStarted', {}),
      ev('externalOutput', {}),
      ev('activityChanged', { kind: 'message', severity: 'debug' })
    ];
    for (const event of events) {
      let seen: boolean = false;
      for (const level of ALL_LEVELS) {
        const rendered: boolean = shouldRenderAtLogLevel(level, event);
        if (seen) {
          expect(rendered).toBe(true);
        }
        seen = seen || rendered;
      }
    }
  });

  it('keeps diagnostic severity separate from the reporter log level', () => {
    // Same severity, different reporter level flips visibility; the severity itself is unchanged.
    const warning: IReporterEventEnvelope<unknown> = ev('diagnosticEmitted', { severity: 'warning' }, false);
    expect(shouldRenderAtLogLevel('quiet', warning)).toBe(false);
    expect(shouldRenderAtLogLevel('normal', warning)).toBe(true);
    // An error at quiet is shown, a non-required warning is not — driven by severity, gated by level.
    expect(shouldRenderAtLogLevel('quiet', ev('diagnosticEmitted', { severity: 'error' }))).toBe(true);
  });
});

describe('filterEventsForLogLevel and file reporter default', () => {
  it('filters a mixed stream to the level', () => {
    const stream: IReporterEventEnvelope<unknown>[] = [
      ev('commandStarted', {}),
      ev('externalOutput', {}),
      ev('commandResult', { succeeded: true, exitCode: 0 })
    ];
    expect(filterEventsForLogLevel('quiet', stream).map((e) => e.type)).toEqual(['commandResult']);
    expect(filterEventsForLogLevel('verbose', stream).map((e) => e.type)).toEqual([
      'commandStarted',
      'externalOutput',
      'commandResult'
    ]);
  });

  it('defaults the full-detail file reporter to debug', () => {
    expect(FILE_REPORTER_DEFAULT_LOG_LEVEL).toBe('debug');
  });
});
