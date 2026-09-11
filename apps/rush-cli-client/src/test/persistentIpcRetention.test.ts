// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { setTimeout as delayAsync } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { DaemonClient } from '@rushstack/rush-client-core';
import type { IDaemonWarmProjectRank, IDaemonWarmSetStatus } from '@rushstack/rush-daemon-protocol';

import {
  createPersistentIpcTestFixture,
  type IIpcEvent,
  type IPersistentIpcTestFixture
} from './PersistentIpcTestFixture';
import { getPressureAllocationBytes, type IPressureMemorySample } from './PersistentIpcPressure';
import { writeIpcFixtureFile } from './IpcFixtureFile';

const BUDGET_MB: number = 512;
const BYTES_PER_MB: number = 1024 * 1024;
const PRESSURE_WORK_MARGIN_MS: number = 100;
const PROJECTS = ['a', 'b'] as const;
type ProjectName = typeof PROJECTS[number];
const MEMORY_BYTES: Readonly<Record<ProjectName, number>> = {
  a: 64 * BYTES_PER_MB,
  b: 16 * BYTES_PER_MB
};
jest.setTimeout(60_000);

interface IMeasuredRank extends IDaemonWarmProjectRank {
  readonly timeSavedMs: number;
  readonly measuredRunnerMemoryBytes: number;
}

function measuredRank(warm: IDaemonWarmSetStatus, name: ProjectName): IMeasuredRank {
  const rank = warm.projectRanks?.find((project) => project.projectName === name);
  if (!rank || rank.timeSavedMs === undefined || !rank.measuredRunnerMemoryBytes) {
    throw new Error(`Missing real timing/RSS measurements for ${name}: ${JSON.stringify(warm)}`);
  }
  return { ...rank, timeSavedMs: rank.timeSavedMs, measuredRunnerMemoryBytes: rank.measuredRunnerMemoryBytes };
}

function score(rank: IMeasuredRank): number {
  return rank.timeSavedMs * rank.frequency / rank.measuredRunnerMemoryBytes;
}

describe('measured production IPC retention through the public client', () => {
  let activeFixture: IPersistentIpcTestFixture | undefined;
  afterEach(async () => {
    const closing = activeFixture;
    activeFixture = undefined;
    await closing?.closeAsync();
  }, 35_000);

  it.each([
    [false, 'a'], [true, 'a'], [false, 'b'], [true, 'b']
  ] as const)('uses actual score versus opposite recency under real memory pressure (telemetry: %s, cold work: %s)', (telemetry, coldWork) => {
    const fixture = createPersistentIpcTestFixture({ telemetry, budgetMB: BUDGET_MB });
    activeFixture = fixture;
    return fixture.runAsync(async () => {
      const started = await fixture.invokeAsync(['daemon', 'start']);
      expect(started.code).toBe(0);
      expect(JSON.parse(started.stdout).workspace.graphInitialized).toBe(false);
      expect(fixture.events()).toEqual([]);
      const coldInvocationMs: Record<ProjectName, number> = { a: 0, b: 0 };
      for (const name of PROJECTS) {
        fixture.input(name, {
          value: 'cold',
          memoryBytes: MEMORY_BYTES[name],
          retainMemory: true,
          coldDelayMs: name === coldWork ? 800 : 50
        });
        const startedAt = performance.now();
        await fixture.buildAsync('--only', name);
        coldInvocationMs[name] = performance.now() - startedAt;
      }
      for (const name of PROJECTS) {
        fixture.input(name, { value: 'warm', memoryBytes: MEMORY_BYTES[name], retainMemory: true });
        await fixture.buildAsync('--only', name);
      }
      const initial = await fixture.statusAsync();
      if (!initial.workspace?.warmSet) throw new Error(`Missing warm status: ${JSON.stringify(initial)}`);
      if (fixture.events().filter((event) => event.kind === 'complete').length !== 4) {
        throw new Error(`Expected four real setup executions: ${JSON.stringify({ initial, events: fixture.events() })}`);
      }
      const initialA = measuredRank(initial.workspace.warmSet, 'a');
      const initialB = measuredRank(initial.workspace.warmSet, 'b');
      expect(initialA.frequency).toBe(2);
      expect(initialB.frequency).toBe(2);
      const higherValue: ProjectName = score(initialA) >= score(initialB) ? 'a' : 'b';
      const newer: ProjectName = higherValue === 'a' ? 'b' : 'a';
      const initialHigh = higherValue === 'a' ? initialA : initialB;
      const initialLow = newer === 'a' ? initialA : initialB;
      expect(score(initialHigh)).toBeGreaterThan(0);

      // Compute the entire bounded request plan from the real measurements, never retry until an assertion passes.
      const cacheHitRequests: ProjectName[] = [];
      if (initialHigh.lastUsed >= initialLow.lastUsed || score(initialHigh) === score(initialLow)) {
        const lowScoreAfterHit = initialLow.timeSavedMs * (initialLow.frequency + 1) /
          initialLow.measuredRunnerMemoryBytes;
        const highScorePerHit = initialHigh.timeSavedMs / initialHigh.measuredRunnerMemoryBytes;
        const requiredHighFrequency = Math.floor(lowScoreAfterHit / highScorePerHit) + 1;
        const highHits = Math.max(0, requiredHighFrequency - initialHigh.frequency);
        expect(highHits).toBeLessThanOrEqual(2);
        cacheHitRequests.push(...Array<ProjectName>(highHits).fill(higherValue), newer);
      }
      expect(cacheHitRequests.length).toBeLessThanOrEqual(3);
      for (const name of cacheHitRequests) await fixture.buildAsync('--only', name);
      const before = await fixture.statusAsync();
      const warm = before.workspace?.warmSet;
      if (!warm) throw new Error(`Missing warm status: ${JSON.stringify(before)}`);
      const a = measuredRank(warm, 'a');
      const b = measuredRank(warm, 'b');
      const high = higherValue === 'a' ? a : b;
      const low = newer === 'a' ? a : b;
      expect(high.frequency).toBe(initialHigh.frequency + cacheHitRequests.filter((name) => name === higherValue).length);
      expect(low.frequency).toBe(initialLow.frequency + cacheHitRequests.filter((name) => name === newer).length);
      expect(high.timeSavedMs).toBeGreaterThan(0);
      expect(low.timeSavedMs).toBeGreaterThanOrEqual(0);
      expect(score(high)).toBeGreaterThan(score(low));
      expect(low.lastUsed).toBeGreaterThan(high.lastUsed);
      expect(warm.retainedProjectNames).toEqual(telemetry ? [higherValue, newer] : [newer, higherValue]);
      expect(before.workspace?.generationToken).toBe(initial.workspace.generationToken);
      expect(fixture.events().filter((event) => event.kind === 'ready')).toHaveLength(2);
      expect(fixture.events().filter((event) => event.kind === 'complete')).toHaveLength(4);
      for (const [original, current] of [[initialA, a], [initialB, b]]) {
        expect(current.timeSavedMs).toBe(original.timeSavedMs);
        expect(current.measuredRunnerMemoryBytes).toBe(original.measuredRunnerMemoryBytes);
      }
      expect(warm.overMemoryBudget).toBe(false);
      for (const rank of [a, b]) {
        const sample = fixture.events().filter((event) => event.project === rank.projectName && event.kind === 'complete').at(-1);
        expect(rank.measuredRunnerMemoryBytes).toBe(sample?.residentMemoryBytes);
      }

      // A cold public invocation contains the complete native cold operation. Real pressure work lasting
      // longer than that upper bound must have zero savings under the unchanged production formula.
      const pressureDelayMs = Math.ceil(coldInvocationMs[newer]) + PRESSURE_WORK_MARGIN_MS;
      const pressureGate = path.join(fixture.folder, `common/temp/pressure-gate-${randomUUID()}.json`);
      fixture.input(newer, {
        value: 'pressure',
        memoryBytes: MEMORY_BYTES[newer],
        retainMemory: true,
        pressureGate,
        delayMs: pressureDelayMs
      });
      let allocation: number;
      let pressureAdjustment: number;
      let pressureAccounting: IDaemonWarmSetStatus | undefined;
      let verifiedPressure: IPressureMemorySample | undefined;
      let requestEnded = false;
      const request = fixture.buildAsync('--only', newer);
      void request.finally(() => { requestEnded = true; }).catch(() => undefined);
      try {
        const readyDeadline = Date.now() + pressureDelayMs + 15_000;
        const waitForPressureSampleAsync = async (
          kind: 'pressure-ready' | 'pressure-allocated' | 'pressure-adjusted'
        ): Promise<IIpcEvent & { residentMemoryBytes: number }> => {
          let sample: IIpcEvent | undefined;
          while (!(sample = fixture.events().find((event) =>
            event.project === newer && event.kind === kind && event.pressureGate === pressureGate
          ))) {
            if (requestEnded) {
              await request;
              throw new Error(`The real pressure operation completed before ${kind}.`);
            }
            if (Date.now() >= readyDeadline) throw new Error(`The real pressure operation did not reach ${kind}.`);
            await delayAsync(10);
          }
          if (!sample.residentMemoryBytes) throw new Error(`Missing real child RSS at ${kind}.`);
          return { ...sample, residentMemoryBytes: sample.residentMemoryBytes };
        };
        const readPressureAccountingAsync = async (): Promise<IDaemonWarmSetStatus> => {
          const client = await DaemonClient.connectAsync({ socketPath: fixture.paths.socketPath });
          try {
            const status = (await client.status).workspace?.warmSet;
            if (!status) throw new Error('Missing live pressure accounting.');
            return status;
          } finally {
            await client.closeAsync();
          }
        };
        const ready = await waitForPressureSampleAsync('pressure-ready');
        pressureAccounting = await readPressureAccountingAsync();
        expect([...pressureAccounting.retainedProjectNames].sort()).toEqual(['a', 'b']);
        const sampleMemory = (daemon: IDaemonWarmSetStatus, child: number): IPressureMemorySample => ({
          budgetBytes: BUDGET_MB * BYTES_PER_MB,
          daemonBytes: daemon.daemonResidentMemoryBytes,
          pressureRunnerBytes: child,
          otherRunnerBytes: high.measuredRunnerMemoryBytes
        });
        allocation = getPressureAllocationBytes(sampleMemory(pressureAccounting, ready.residentMemoryBytes));
        expect(allocation).toBeGreaterThan(16 * BYTES_PER_MB);
        writeIpcFixtureFile(pressureGate, JSON.stringify({ additionalMemoryBytes: allocation }));

        // A real daemon working-set drop can invalidate the first sizing sample. Recalibrate once,
        // then verify actual pressure while this request still owns admission, before releasing it.
        const allocated = await waitForPressureSampleAsync('pressure-allocated');
        pressureAdjustment = getPressureAllocationBytes(sampleMemory(
          await readPressureAccountingAsync(), allocated.residentMemoryBytes
        ));
        writeIpcFixtureFile(`${pressureGate}.adjust`, JSON.stringify({ additionalMemoryBytes: pressureAdjustment }));
        const adjusted = await waitForPressureSampleAsync('pressure-adjusted');
        verifiedPressure = sampleMemory(await readPressureAccountingAsync(), adjusted.residentMemoryBytes);
        const retainedBytes: number = verifiedPressure.daemonBytes + verifiedPressure.pressureRunnerBytes;
        expect(retainedBytes + verifiedPressure.otherRunnerBytes).toBeGreaterThan(verifiedPressure.budgetBytes);
        expect(retainedBytes).toBeLessThan(verifiedPressure.budgetBytes);
        writeIpcFixtureFile(`${pressureGate}.release`, '{}');
        await request;
      } finally {
        try {
          for (const gate of [pressureGate, `${pressureGate}.adjust`, `${pressureGate}.release`]) {
            if (!fs.existsSync(gate)) writeIpcFixtureFile(gate, '{"cancelled":true}');
          }
        } finally {
          await Promise.allSettled([request]);
        }
      }
      const pressure = fixture.events().filter((event) => event.project === newer && event.kind === 'complete').at(-1);
      expect(pressure?.durationMs).toBeGreaterThanOrEqual(coldInvocationMs[newer]);
      expect(pressure?.residentMemoryBytes).toBeGreaterThan(low.measuredRunnerMemoryBytes);
      const keep = telemetry ? higherValue : newer;
      const evict = telemetry ? newer : higherValue;
      const deadline = Date.now() + 10_000;
      let after = await fixture.statusAsync();
      while (after.workspace?.warmSet?.retainedProjectNames.length !== 1 && Date.now() < deadline) {
        await delayAsync(50);
        after = await fixture.statusAsync();
      }
      expect(after.workspace?.warmSet?.retainedProjectNames).toEqual([keep]);
      expect(after.workspace?.warmSet?.watchedProjectNames).toEqual([keep]);
      expect(after.workspace?.warmSet?.overMemoryBudget).toBe(false);
      expect(after.workspace?.generationToken).toBe(before.workspace?.generationToken);
      if (!after.workspace?.warmSet) throw new Error(`Missing final warm status: ${JSON.stringify(after)}`);
      const retainedRank = measuredRank(after.workspace.warmSet, keep);
      expect(retainedRank.timeSavedMs).toBe(telemetry ? high.timeSavedMs : 0);
      expect(retainedRank.frequency).toBe(telemetry ? high.frequency : low.frequency + 1);
      const evictedPid = fixture.events().find((event) => event.project === evict && event.kind === 'ready')!.pid;
      expect(fixture.events().some((event) => event.kind === 'closed' && event.pid === evictedPid)).toBe(true);
      expect(fixture.events().filter((event) => event.kind === 'ready')).toHaveLength(2);
      expect(fixture.events().filter((event) => event.kind === 'complete')).toHaveLength(5);
      const evidenceFile = process.env.RUSHD_P2_EVIDENCE;
      if (evidenceFile) {
        fs.appendFileSync(evidenceFile, JSON.stringify({
          platform: process.platform,
          nodeVersion: process.version,
          telemetry,
          coldWork,
          daemonPid: before.pid,
          initialRankingInputs: [initialA, initialB],
          rankingInputs: [a, b],
          independentlyCalculatedScores: { a: score(a), b: score(b) },
          higherValue,
          newer,
          cacheHitRequests,
          coldInvocationMs,
          pressureDelayMs,
          pressure,
          allocation,
          pressureAdjustment,
          pressureAccounting,
          verifiedPressure,
          retained: after.workspace?.warmSet?.retainedProjectNames,
          watched: after.workspace?.warmSet?.watchedProjectNames,
          events: fixture.events()
        }) + '\n');
      }
    });
  });
});
