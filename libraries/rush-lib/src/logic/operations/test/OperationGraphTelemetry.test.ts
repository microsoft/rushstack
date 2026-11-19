// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('../OperationStateFile');
// Mock project log file creation to avoid filesystem writes.
jest.mock('../ProjectLogWritable', () => {
  const actual = jest.requireActual('../ProjectLogWritable');
  const { TerminalWritable } = jest.requireActual('@rushstack/terminal');
  class MockTerminalWritable extends TerminalWritable {
    protected onWriteChunk(): void {
      /* noop */
    }
    protected onClose(): void {
      /* noop */
    }
  }
  return {
    ...actual,
    initializeProjectLogFilesAsync: jest.fn(async () => new MockTerminalWritable())
  };
});

import { MockWritable } from '@rushstack/terminal';

import type { IPhase } from '../../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import type { ITelemetryData } from '../../Telemetry';
import { Operation } from '../Operation';
import { OperationGraph } from '../OperationGraph';
import { MockOperationRunner } from './MockOperationRunner';

const mockPhase: IPhase = {
  name: 'phase',
  allowWarningsOnSuccess: false,
  associatedParameters: new Set(),
  dependencies: {
    self: new Set(),
    upstream: new Set()
  },
  isSynthetic: false,
  logFilenameIdentifier: 'phase',
  missingScriptBehavior: 'silent'
};

describe('OperationGraph telemetry', () => {
  it("runs beforeLogRequest taps, then beforeLog taps, before it logs an iteration's entry", async () => {
    const events: string[] = [];
    const operation: Operation = new Operation({
      runner: new MockOperationRunner('logged'),
      logFilenameIdentifier: 'logged',
      phase: mockPhase,
      project: { packageName: 'logged' } as unknown as RushConfigurationProject
    });
    const graph: OperationGraph = new OperationGraph(new Set([operation]), {
      quietMode: true,
      debugMode: false,
      parallelism: 1,
      allowOversubscription: true,
      destinations: [new MockWritable()],
      abortController: new AbortController(),
      telemetry: {
        initialExtraData: {},
        changedProjectsOnlyKey: undefined,
        nameForLog: 'build',
        log: ({ extraData }: ITelemetryData) => {
          events.push(`log ${JSON.stringify(extraData)}`);
        }
      }
    });
    // Tapped first, to show that the hook, not the tap order, runs beforeLogRequest taps first.
    graph.hooks.beforeLog.tap('iteration report', (data: ITelemetryData) => {
      events.push(`beforeLog, pluginActive ${data.extraData!.pluginActive}`);
      data.extraData!.iterationAuthSeconds = 2;
    });
    graph.hooks.beforeLogRequest.tap('plugin flag', (data: ITelemetryData) => {
      events.push('beforeLogRequest');
      data.extraData!.pluginActive = true;
    });

    await graph.executeAsync({});

    expect(events).toEqual([
      'beforeLogRequest',
      'beforeLog, pluginActive true',
      expect.stringMatching(/^log \{.*"pluginActive":true,"iterationAuthSeconds":2\}$/)
    ]);
  });
});
