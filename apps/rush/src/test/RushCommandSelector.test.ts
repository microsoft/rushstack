// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  LegacyFallbackSink,
  ReporterManager,
  type IReporter,
  type IReporterEventEnvelope
} from '@rushstack/rush-reporter';

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

describe(RushCommandSelector.name, () => {
  it('keeps old-engine legacy output visible while bridging it to the frontend host', async () => {
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
    let visibleOutput: string = '';
    process.argv = ['node', 'rush', 'build'];
    process.stderr.write = ((text: string): boolean => {
      visibleOutput += text;
      return true;
    }) as typeof process.stderr.write;

    const options: IRushFrontendLaunchOptions = {
      isManaged: true,
      reporterEventSink: manager,
      reporterEnabled: true,
      reporterSelectionReason: 'explicit --reporter'
    };
    const oldRushLib = {
      Rush: {
        version: '5.177.0',
        launch: () => {
          process.stdout.write('legacy engine output\n');
        }
      }
    } as unknown as typeof import('@microsoft/rush-lib');

    try {
      RushCommandSelector.execute('5.178.1', oldRushLib, options);
      await manager.flushAsync();
    } finally {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
      delete markedStdout[marker];
      delete (process.stderr as unknown as { [key: symbol]: boolean | undefined })[
        Symbol.for('rush.reporter.old-engine-output.stderr')
      ];
      process.argv = originalArgv;
    }

    expect(visibleOutput).toBe('legacy engine output\n');
    expect(reporter.events).toHaveLength(1);
    expect(reporter.events[0]).toMatchObject({
      type: 'externalOutput',
      payload: { stream: 'stdout', text: 'legacy engine output\n' }
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
        reporterEventSink: manager,
        reporterEnabled: true,
        reporterSelectionReason: 'explicit --reporter'
      });
      await manager.flushAsync();
    } finally {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
      delete markedStdout[marker];
      delete (process.stderr as unknown as { [key: symbol]: boolean | undefined })[
        Symbol.for('rush.reporter.old-engine-output.stderr')
      ];
      process.argv = originalArgv;
    }

    expect(reporter.events).toHaveLength(1);
    expect(reporter.events[0].payload).toEqual({ stream: 'stdout', text: '€' });
  });

  it('fails an explicit reporter request for an incompatible new engine protocol', () => {
    const options: IRushFrontendLaunchOptions = {
      isManaged: true,
      reporterEventSink: new ReporterManager(),
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
      reporterEventSink: new ReporterManager(),
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
      reporterEventSink: new ReporterManager(),
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
    expect(receivedOptions?.reporterEventSink).toBeInstanceOf(LegacyFallbackSink);
  });

  it('falls back to legacy engine rendering for an implicit older protocol', () => {
    let receivedOptions: IRushFrontendLaunchOptions | undefined;
    const options: IRushFrontendLaunchOptions = {
      isManaged: true,
      reporterEventSink: new ReporterManager(),
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
    expect(receivedOptions?.reporterEventSink).toBeInstanceOf(LegacyFallbackSink);
  });
});
