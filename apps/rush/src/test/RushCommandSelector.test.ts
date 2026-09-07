// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  LegacyFallbackSink,
  ReporterManager,
  REPORTER_PROTOCOL_VERSION,
  type IReporter,
  type IReporterEventEnvelope
} from '@rushstack/rush-reporter';
import { Rush } from '@microsoft/rush-lib';

import { RushCommandSelector } from '../RushCommandSelector';
import type { IRushFrontendLaunchOptions } from '../IRushFrontendLaunchOptions';

class RecordingReporter implements IReporter {
  public readonly name: string = 'recording';
  public readonly events: IReporterEventEnvelope<unknown>[] = [];

  public async initializeAsync(): Promise<void> {}

  public report(event: IReporterEventEnvelope<unknown>): void {
    this.events.push(event);
  }

  public async flushAsync(): Promise<void> {}

  public async closeAsync(): Promise<void> {}
}

class WritingReporter implements IReporter {
  public readonly name: string = 'writing';
  public reportCount: number = 0;

  public async initializeAsync(): Promise<void> {}

  public report(): void {
    this.reportCount++;
    process.stdout.write('reporter output\n');
  }

  public async flushAsync(): Promise<void> {}

  public async closeAsync(): Promise<void> {}
}

type BeforeExitListener = (code: number) => void;

function restoreObservedOutput(
  previousBeforeExitListeners: readonly BeforeExitListener[],
  required: boolean = true
): void {
  const currentListeners: readonly BeforeExitListener[] = process.listeners(
    'beforeExit'
  ) as BeforeExitListener[];
  const restoreListener: BeforeExitListener | undefined = currentListeners.find(
    (listener: BeforeExitListener) => !previousBeforeExitListeners.includes(listener)
  );
  if (!restoreListener) {
    if (required) {
      throw new Error('Expected an old-engine output restoration listener.');
    }
    return;
  }
  restoreListener(0);
}

describe(RushCommandSelector.name, () => {
  it('publishes the current engine reporter protocol major', () => {
    expect((Rush as typeof Rush & { readonly _reporterProtocolMajor?: number })._reporterProtocolMajor).toBe(
      REPORTER_PROTOCOL_VERSION.major
    );
  });

  it('does not observe output from a matching structured engine', () => {
    const manager: ReporterManager = new ReporterManager();
    const options: IRushFrontendLaunchOptions = {
      isManaged: true,
      reporter: { eventSink: manager, sessionId: 'test-session' },
      reporterCloseAsync: async () => {},
      reporterEnabled: true,
      reporterSelectionReason: 'explicit --reporter'
    };
    const originalStdoutWrite: typeof process.stdout.write = process.stdout.write;
    let receivedOptions: IRushFrontendLaunchOptions | undefined;
    const currentRushLib = {
      Rush: {
        version: '5.178.1',
        _reporterProtocolMajor: REPORTER_PROTOCOL_VERSION.major,
        launch: (launcherVersion: string, launchOptions: IRushFrontendLaunchOptions) => {
          void launcherVersion;
          receivedOptions = launchOptions;
        }
      }
    } as unknown as typeof import('@microsoft/rush-lib');

    RushCommandSelector.execute('5.178.1', currentRushLib, options);

    expect(process.stdout.write).toBe(originalStdoutWrite);
    expect(receivedOptions?.reporter).toBe(options.reporter);
  });

  it('does not recapture reporter output while observing an old engine', async () => {
    const manager: ReporterManager = new ReporterManager();
    const reporter: WritingReporter = new WritingReporter();
    manager.addReporter(reporter);
    await manager.initializeAsync();

    const originalArgv: string[] = process.argv;
    const originalStdoutWrite: typeof process.stdout.write = process.stdout.write;
    const originalStderrWrite: typeof process.stderr.write = process.stderr.write;
    let stdoutText: string = '';
    process.argv = ['node', 'rush', 'build'];
    process.stdout.write = ((text: string): boolean => {
      stdoutText += text;
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = (() => true) as typeof process.stderr.write;
    const previousBeforeExitListeners: readonly BeforeExitListener[] = process.listeners(
      'beforeExit'
    ) as BeforeExitListener[];

    try {
      RushCommandSelector.execute(
        '5.178.1',
        {
          Rush: {
            version: '5.177.0',
            launch: () => process.stdout.write('legacy output\n')
          }
        } as unknown as typeof import('@microsoft/rush-lib'),
        {
          isManaged: true,
          reporter: { eventSink: manager, sessionId: 'test-session' },
          reporterCloseAsync: async () => {},
          reporterEnabled: true,
          reporterSelectionReason: 'explicit --reporter'
        }
      );
      restoreObservedOutput(previousBeforeExitListeners);
      await manager.flushAsync();
    } finally {
      restoreObservedOutput(previousBeforeExitListeners, false);
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
      process.argv = originalArgv;
    }

    expect(reporter.reportCount).toBe(1);
    expect(stdoutText.match(/reporter output/g)).toHaveLength(1);
    expect(stdoutText.match(/legacy output/g)).toHaveLength(1);
  });

  it('keeps ordered old-engine stdout and stderr on their original streams', async () => {
    const manager: ReporterManager = new ReporterManager();
    const reporter: RecordingReporter = new RecordingReporter();
    manager.addReporter(reporter);
    await manager.initializeAsync();

    const originalArgv: string[] = process.argv;
    const originalStdoutWrite: typeof process.stdout.write = process.stdout.write;
    const originalStderrWrite: typeof process.stderr.write = process.stderr.write;
    let stdoutText: string = '';
    let stderrText: string = '';
    process.argv = ['node', 'rush', 'build'];
    const stdoutWrite: typeof process.stdout.write = ((text: string): boolean => {
      stdoutText += text;
      return true;
    }) as typeof process.stdout.write;
    const stderrWrite: typeof process.stderr.write = ((text: string): boolean => {
      stderrText += text;
      return true;
    }) as typeof process.stderr.write;
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
    const previousBeforeExitListeners: readonly BeforeExitListener[] = process.listeners(
      'beforeExit'
    ) as BeforeExitListener[];

    const options: IRushFrontendLaunchOptions = {
      isManaged: true,
      reporter: { eventSink: manager, sessionId: 'test-session' },
      reporterCloseAsync: async () => {},
      reporterEnabled: true,
      reporterSelectionReason: 'explicit --reporter'
    };
    const oldRushLib = {
      Rush: {
        version: '5.177.0',
        launch: () => {
          process.stdout.write('stdout 1\n');
          process.stderr.write('stderr 1\n');
          process.stdout.write('stdout 2\n');
        }
      }
    } as unknown as typeof import('@microsoft/rush-lib');

    try {
      RushCommandSelector.execute('5.178.1', oldRushLib, options);
      expect(process.stdout.write).not.toBe(stdoutWrite);
      expect(process.stderr.write).not.toBe(stderrWrite);
      restoreObservedOutput(previousBeforeExitListeners);
      await manager.flushAsync();
      expect(process.stdout.write).toBe(stdoutWrite);
      expect(process.stderr.write).toBe(stderrWrite);
    } finally {
      restoreObservedOutput(previousBeforeExitListeners, false);
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
      process.argv = originalArgv;
    }

    expect(stdoutText).toBe('stdout 1\nstdout 2\n');
    expect(stderrText).toBe('stderr 1\n');
    expect(reporter.events.map((event) => event.payload)).toEqual([
      { stream: 'stdout', text: 'stdout 1\n', wasRendered: true },
      { stream: 'stderr', text: 'stderr 1\n', wasRendered: true },
      { stream: 'stdout', text: 'stdout 2\n', wasRendered: true }
    ]);
  });

  it('captures asynchronous old-engine output until the process lifecycle completes', async () => {
    const manager: ReporterManager = new ReporterManager();
    const reporter: RecordingReporter = new RecordingReporter();
    manager.addReporter(reporter);
    await manager.initializeAsync();

    const originalArgv: string[] = process.argv;
    const originalStdoutWrite: typeof process.stdout.write = process.stdout.write;
    const originalStderrWrite: typeof process.stderr.write = process.stderr.write;
    const stdoutWrite: typeof process.stdout.write = (() => true) as typeof process.stdout.write;
    const stderrWrite: typeof process.stderr.write = (() => true) as typeof process.stderr.write;
    process.argv = ['node', 'rush', 'build'];
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
    const previousBeforeExitListeners: readonly BeforeExitListener[] = process.listeners(
      'beforeExit'
    ) as BeforeExitListener[];

    try {
      RushCommandSelector.execute(
        '5.178.1',
        {
          Rush: {
            version: '5.177.0',
            launch: () => {
              setImmediate(() => {
                process.stdout.write('async stdout\n');
                process.stderr.write('async stderr\n');
              });
            }
          }
        } as unknown as typeof import('@microsoft/rush-lib'),
        {
          isManaged: true,
          reporter: { eventSink: manager, sessionId: 'test-session' },
          reporterCloseAsync: async () => {},
          reporterEnabled: true,
          reporterSelectionReason: 'explicit --reporter'
        }
      );
      await new Promise<void>((resolve) => setImmediate(resolve));
      restoreObservedOutput(previousBeforeExitListeners);
      await manager.flushAsync();
    } finally {
      restoreObservedOutput(previousBeforeExitListeners, false);
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
      process.argv = originalArgv;
    }

    expect(reporter.events.map((event) => event.payload)).toEqual([
      { stream: 'stdout', text: 'async stdout\n', wasRendered: true },
      { stream: 'stderr', text: 'async stderr\n', wasRendered: true }
    ]);
  });

  it('keeps old-engine stdout structured for machine reporters', async () => {
    const manager: ReporterManager = new ReporterManager();
    const reporter: RecordingReporter = new RecordingReporter();
    manager.addReporter(reporter);
    await manager.initializeAsync();

    const originalArgv: string[] = process.argv;
    const originalStdoutWrite: typeof process.stdout.write = process.stdout.write;
    const originalStderrWrite: typeof process.stderr.write = process.stderr.write;
    let stdoutText: string = '';
    const stdoutWrite: typeof process.stdout.write = ((text: string): boolean => {
      stdoutText += text;
      return true;
    }) as typeof process.stdout.write;
    process.argv = ['node', 'rush', 'build'];
    process.stdout.write = stdoutWrite;
    process.stderr.write = (() => true) as typeof process.stderr.write;
    const previousBeforeExitListeners: readonly BeforeExitListener[] = process.listeners(
      'beforeExit'
    ) as BeforeExitListener[];

    try {
      RushCommandSelector.execute(
        '5.178.1',
        {
          Rush: {
            version: '5.177.0',
            launch: () => {
              process.stdout.write('legacy stdout\n');
            }
          }
        } as unknown as typeof import('@microsoft/rush-lib'),
        {
          isManaged: true,
          reporter: { eventSink: manager, sessionId: 'test-session' },
          reporterCloseAsync: async () => {},
          reporterEnabled: true,
          reporterStdoutIsMachineReadable: true,
          reporterSelectionReason: 'explicit --reporter'
        }
      );
      restoreObservedOutput(previousBeforeExitListeners);
      await manager.flushAsync();
    } finally {
      restoreObservedOutput(previousBeforeExitListeners, false);
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
      process.argv = originalArgv;
    }

    expect(stdoutText).toBe('');
    expect(reporter.events[0].payload).toEqual({
      stream: 'stdout',
      text: 'legacy stdout\n'
    });
  });

  it('preserves a UTF-8 code point split across old-engine buffer writes', async () => {
    const manager: ReporterManager = new ReporterManager();
    const reporter: RecordingReporter = new RecordingReporter();
    manager.addReporter(reporter);
    await manager.initializeAsync();

    const originalArgv: string[] = process.argv;
    const originalStdoutWrite: typeof process.stdout.write = process.stdout.write;
    const originalStderrWrite: typeof process.stderr.write = process.stderr.write;
    const marker: symbol = Symbol.for('rush.reporter.old-engine-output.stdout');
    const markedStdout: NodeJS.WriteStream & { [key: symbol]: boolean | undefined } =
      process.stdout as unknown as NodeJS.WriteStream & { [key: symbol]: boolean | undefined };
    process.argv = ['node', 'rush', 'build'];
    process.stdout.write = (() => true) as typeof process.stdout.write;
    process.stderr.write = (() => true) as typeof process.stderr.write;
    const previousBeforeExitListeners: readonly BeforeExitListener[] = process.listeners(
      'beforeExit'
    ) as BeforeExitListener[];

    const oldRushLib = {
      Rush: {
        version: '5.177.0',
        launch: () => {
          process.stdout.write(Buffer.from([0xe2]));
          process.stdout.write(Buffer.from([0x82, 0xac]));
        }
      }
    } as unknown as typeof import('@microsoft/rush-lib');

    try {
      RushCommandSelector.execute('5.178.1', oldRushLib, {
        isManaged: true,
        reporter: { eventSink: manager, sessionId: 'test-session' },
        reporterCloseAsync: async () => {},
        reporterEnabled: true,
        reporterSelectionReason: 'explicit --reporter'
      });
      restoreObservedOutput(previousBeforeExitListeners);
      await manager.flushAsync();
    } finally {
      restoreObservedOutput(previousBeforeExitListeners, false);
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
      delete markedStdout[marker];
      delete (process.stderr as unknown as { [key: symbol]: boolean | undefined })[
        Symbol.for('rush.reporter.old-engine-output.stderr')
      ];
      process.argv = originalArgv;
    }

    expect(reporter.events).toHaveLength(1);
    expect(reporter.events[0].payload).toEqual({ stream: 'stdout', text: '€', wasRendered: true });
  });

  it('restores old-engine stream writers when launch throws', () => {
    const originalArgv: string[] = process.argv;
    const originalStdoutWrite: typeof process.stdout.write = process.stdout.write;
    const originalStderrWrite: typeof process.stderr.write = process.stderr.write;
    const stdoutWrite: typeof process.stdout.write = (() => true) as typeof process.stdout.write;
    const stderrWrite: typeof process.stderr.write = (() => true) as typeof process.stderr.write;
    process.argv = ['node', 'rush', 'build'];
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;

    try {
      expect(() =>
        RushCommandSelector.execute(
          '5.178.1',
          {
            Rush: {
              version: '5.177.0',
              launch: () => {
                throw new Error('launch failed');
              }
            }
          } as unknown as typeof import('@microsoft/rush-lib'),
          {
            isManaged: true,
            reporter: { eventSink: new ReporterManager(), sessionId: 'test-session' },
            reporterCloseAsync: async () => {},
            reporterEnabled: true,
            reporterSelectionReason: 'explicit --reporter'
          }
        )
      ).toThrow('launch failed');
      expect(process.stdout.write).toBe(stdoutWrite);
      expect(process.stderr.write).toBe(stderrWrite);
    } finally {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
      process.argv = originalArgv;
    }
  });

  it('fails an explicit reporter request for an incompatible new engine protocol', () => {
    const options: IRushFrontendLaunchOptions = {
      isManaged: true,
      reporter: { eventSink: new ReporterManager(), sessionId: 'test-session' },
      reporterCloseAsync: async () => {},
      reporterEnabled: true,
      reporterSelectionReason: 'explicit --reporter'
    };
    const incompatibleRushLib = {
      Rush: {
        version: '6.0.0',
        _reporterProtocolMajor: 2,
        launch: () => undefined
      }
    } as unknown as typeof import('@microsoft/rush-lib');

    expect(() => RushCommandSelector.execute('5.178.1', incompatibleRushLib, options)).toThrow(
      /reporter protocol major 2/
    );
  });

  it('fails an explicit reporter request for an incompatible older engine protocol', () => {
    const options: IRushFrontendLaunchOptions = {
      isManaged: true,
      reporter: { eventSink: new ReporterManager(), sessionId: 'test-session' },
      reporterCloseAsync: async () => {},
      reporterEnabled: true,
      reporterSelectionReason: 'explicit --reporter'
    };
    const incompatibleRushLib = {
      Rush: {
        version: '5.177.0',
        _reporterProtocolMajor: 0,
        launch: () => undefined
      }
    } as unknown as typeof import('@microsoft/rush-lib');

    expect(() => RushCommandSelector.execute('5.178.1', incompatibleRushLib, options)).toThrow(
      /reporter protocol major 0/
    );
  });

  it('falls back to legacy engine rendering for an implicit incompatible protocol', () => {
    let receivedOptions: IRushFrontendLaunchOptions | undefined;
    const options: IRushFrontendLaunchOptions = {
      isManaged: true,
      reporter: { eventSink: new ReporterManager(), sessionId: 'test-session' },
      reporterCloseAsync: async () => {},
      reporterEnabled: true,
      reporterSelectionReason: 'repository experiment'
    };
    const incompatibleRushLib = {
      Rush: {
        version: '6.0.0',
        _reporterProtocolMajor: 2,
        launch: (launcherVersion: string, launchOptions: IRushFrontendLaunchOptions) => {
          void launcherVersion;
          receivedOptions = launchOptions;
        }
      }
    } as unknown as typeof import('@microsoft/rush-lib');

    RushCommandSelector.execute('5.178.1', incompatibleRushLib, options);
    expect(receivedOptions).toMatchObject({
      reporterEnabled: false,
      reporterSelectionReason: 'bootstrap compatibility fallback'
    });
    expect(receivedOptions?.reporter.eventSink).toBeInstanceOf(LegacyFallbackSink);
  });

  it('falls back to legacy engine rendering for an implicit older protocol', () => {
    let receivedOptions: IRushFrontendLaunchOptions | undefined;
    const options: IRushFrontendLaunchOptions = {
      isManaged: true,
      reporter: { eventSink: new ReporterManager(), sessionId: 'test-session' },
      reporterCloseAsync: async () => {},
      reporterEnabled: true,
      reporterSelectionReason: 'repository experiment'
    };
    const incompatibleRushLib = {
      Rush: {
        version: '5.177.0',
        _reporterProtocolMajor: 0,
        launch: (launcherVersion: string, launchOptions: IRushFrontendLaunchOptions) => {
          void launcherVersion;
          receivedOptions = launchOptions;
        }
      }
    } as unknown as typeof import('@microsoft/rush-lib');

    RushCommandSelector.execute('5.178.1', incompatibleRushLib, options);
    expect(receivedOptions).toMatchObject({
      reporterEnabled: false,
      reporterSelectionReason: 'bootstrap compatibility fallback'
    });
    expect(receivedOptions?.reporter.eventSink).toBeInstanceOf(LegacyFallbackSink);
  });
});
