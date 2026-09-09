// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { setTimeout as delayAsync } from 'node:timers/promises';
import * as fs from 'node:fs';

import type { IDaemonWarmProjectRank } from '@rushstack/rush-daemon-protocol';

import { createPersistentIpcTestFixture, type IPersistentIpcTestFixture } from './PersistentIpcTestFixture';

const BUDGET_MB: number = 512;
const BYTES_PER_MB: number = 1024 * 1024;
jest.setTimeout(60_000);

function score(rank: IDaemonWarmProjectRank): number {
  if (rank.timeSavedMs === undefined || rank.measuredRunnerMemoryBytes === undefined) {
    throw new Error(`Missing real timing/RSS measurements for ${rank.projectName}.`);
  }
  return rank.timeSavedMs * rank.frequency / rank.measuredRunnerMemoryBytes;
}

describe('measured production IPC retention through the public client', () => {
  let activeFixture: IPersistentIpcTestFixture | undefined;
  afterEach(async () => {
    const closing = activeFixture;
    activeFixture = undefined;
    await closing?.closeAsync();
  }, 35_000);

  it.each([false, true])('uses actual score versus opposite recency under real memory pressure (telemetry: %s)', (telemetry) => {
    const fixture = createPersistentIpcTestFixture({ telemetry, budgetMB: BUDGET_MB });
    activeFixture = fixture;
    return fixture.runAsync(async () => {
      fixture.input('a', { value: 'cold', memoryBytes: 64 * BYTES_PER_MB });
      fixture.input('b', { value: 'cold', memoryBytes: 16 * BYTES_PER_MB });
      await fixture.buildAsync('--only', 'a');
      await fixture.buildAsync('--only', 'b');
      fixture.input('a', { value: 'warm', memoryBytes: 64 * BYTES_PER_MB });
      fixture.input('b', { value: 'warm', memoryBytes: 16 * BYTES_PER_MB });
      await fixture.buildAsync('--only', 'a');
      await fixture.buildAsync('--only', 'b');
      const before = await fixture.statusAsync();
      const warm = before.workspace?.warmSet;
      const a = warm?.projectRanks?.find((rank) => rank.projectName === 'a');
      const b = warm?.projectRanks?.find((rank) => rank.projectName === 'b');
      if (!warm || !a || !b || !a.measuredRunnerMemoryBytes || !b.measuredRunnerMemoryBytes) {
        throw new Error(`Expected both genuine resident Node tools: ${JSON.stringify(before)}`);
      }
      expect(a.frequency).toBe(2);
      expect(b.frequency).toBe(2);
      expect(a.timeSavedMs).toBeGreaterThan(0);
      expect(b.timeSavedMs).toBeGreaterThanOrEqual(0);
      expect(score(a)).toBeGreaterThan(score(b));
      expect(b.lastUsed).toBeGreaterThan(a.lastUsed);
      expect(warm.retainedProjectNames).toEqual(telemetry ? ['a', 'b'] : ['b', 'a']);
      expect(warm.overMemoryBudget).toBe(false);
      for (const rank of [a, b]) {
        const sample = fixture.events().filter((event) => event.project === rank.projectName && event.kind === 'complete').at(-1);
        expect(rank.measuredRunnerMemoryBytes).toBe(sample?.residentMemoryBytes);
      }

      // The actual requested tool allocates memory; no RSS getter, runner, clock, or launcher is substituted.
      const allocation = Math.floor(BUDGET_MB * BYTES_PER_MB - warm.daemonResidentMemoryBytes -
        b.measuredRunnerMemoryBytes - a.measuredRunnerMemoryBytes / 2);
      expect(allocation).toBeGreaterThan(16 * BYTES_PER_MB);
      fixture.input('b', { value: 'pressure', memoryBytes: allocation });
      await fixture.buildAsync('--only', 'b');
      const keep = telemetry ? 'a' : 'b';
      const evict = telemetry ? 'b' : 'a';
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
          daemonPid: before.pid,
          rankingInputs: [a, b],
          independentlyCalculatedScores: { a: score(a), b: score(b) },
          allocation,
          retained: after.workspace?.warmSet?.retainedProjectNames,
          watched: after.workspace?.warmSet?.watchedProjectNames,
          events: fixture.events()
        }) + '\n');
      }
    });
  });
});
