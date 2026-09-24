// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IConfigurableOperation, Operation } from '@microsoft/rush-lib';
import { OperationStatus } from '@microsoft/rush-lib';
import type { IDaemonPhasedOperationSelection, IDaemonPhasedRequest } from '@rushstack/rush-daemon-protocol';

import { PhasedRequestRouter } from '../PhasedRequestRouter';
import {
  TEST_ENGINE_SHAPE,
  TestOperationRunner,
  TestPhasedRequestClient,
  createRoutingFixture
} from './PhasedRequestRouterTestUtilities';
import type { ITestRoutingFixture } from './PhasedRequestRouterTestUtilities';

const OPERATION_A: string = 'project-a (_phase:test)';
const OPERATION_B: string = 'project-b (_phase:test)';
const OPERATION_C: string = 'project-c (_phase:test)';
const DURATION_LINE: RegExp = /^rush build \(\d+\.\d\d seconds\)$/m;

function createRequest(requestId: string, ...operationIds: string[]): IDaemonPhasedRequest {
  return {
    commandName: 'build',
    commandOrigin: 'built-in',
    engineShape: TEST_ENGINE_SHAPE,
    environment: {},
    operationSelection: operationIds.map(
      (operationId: string): IDaemonPhasedOperationSelection => ({ enabledState: true, operationId })
    ),
    requestId
  };
}

function createFixture(statusA: OperationStatus = OperationStatus.Success): ITestRoutingFixture {
  return createRoutingFixture(
    new Map([
      [OPERATION_A, new TestOperationRunner(OPERATION_A, statusA)],
      [OPERATION_B, new TestOperationRunner(OPERATION_B)],
      [OPERATION_C, new TestOperationRunner(OPERATION_C)]
    ]),
    [[OPERATION_B, OPERATION_A]]
  );
}

function getActivity(client: TestPhasedRequestClient, stream: 'stdout' | 'stderr'): string {
  let text: string = '';
  for (const { event } of client.writes) {
    const payload: { stream?: string; text?: string } | undefined =
      event?.type === 'activityChanged' ? (event.payload as { stream?: string; text?: string }) : undefined;
    if (payload?.stream === stream) {
      text += payload.text;
    }
  }
  return text;
}

function getSummary(stdout: string): string {
  // Operation headers are structured events, so the first activity banner starts the end-of-run summary.
  return stdout.slice(stdout.indexOf('==[ '));
}

describe('phased request summary', () => {
  it('reports the native summary tables and duration line after a cold build', async () => {
    const fixture: ITestRoutingFixture = createFixture();
    try {
      const client: TestPhasedRequestClient = new TestPhasedRequestClient();
      await new PhasedRequestRouter(fixture.session).executeAsync(
        createRequest('cold', OPERATION_B),
        client
      );
      const stdout: string = getActivity(client, 'stdout');
      const summary: string = getSummary(stdout);
      expect(summary).toContain('==[ SUCCESS: 2 operations ]==');
      expect(summary).toContain('These operations completed successfully:');
      expect(summary).toContain(`  ${OPERATION_A}`);
      expect(summary).toContain(`  ${OPERATION_B}`);
      expect(summary).not.toContain(OPERATION_C);
      expect(stdout).toMatch(DURATION_LINE);
      expect(stdout.indexOf('==[ SUCCESS')).toBeLessThan(stdout.search(DURATION_LINE));
      expect(client.writes[client.writes.length - 1].result).toBeDefined();
    } finally {
      await fixture.session[Symbol.asyncDispose]();
    }
  });

  it('reports up-to-date operations and the duration line for a warm no-op', async () => {
    const fixture: ITestRoutingFixture = createFixture();
    try {
      const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
      await router.executeAsync(createRequest('cold', OPERATION_B), new TestPhasedRequestClient());
      // Simulate the incremental plugin disabling every operation whose inputs did not change.
      fixture.graph.hooks.configureIteration.tap(
        'test',
        (records: ReadonlyMap<Operation, IConfigurableOperation>) => {
          for (const record of records.values()) {
            record.enabled = false;
          }
        }
      );
      const client: TestPhasedRequestClient = new TestPhasedRequestClient();
      const result = await router.executeAsync(createRequest('warm', OPERATION_B), client);
      expect(result.scheduled).toBe(false);
      const stdout: string = getActivity(client, 'stdout');
      expect(stdout).toContain('==[ SKIPPED: 2 operations ]==');
      expect(stdout).toContain('These operations were already up to date:');
      expect(stdout).toMatch(DURATION_LINE);
      expect(getActivity(client, 'stderr')).toBe('');
    } finally {
      await fixture.session[Symbol.asyncDispose]();
    }
  });

  it('reports failed and blocked operations and the duration line for a failing build', async () => {
    const fixture: ITestRoutingFixture = createFixture(OperationStatus.Failure);
    try {
      const client: TestPhasedRequestClient = new TestPhasedRequestClient();
      const result = await new PhasedRequestRouter(fixture.session).executeAsync(
        createRequest('failing', OPERATION_B),
        client
      );
      expect(result.exitCode).not.toBe(0);
      const stdout: string = getActivity(client, 'stdout');
      expect(stdout).toContain('==[ BLOCKED: 1 operation ]==');
      expect(stdout).toContain('==[ FAILURE: 1 operation ]==');
      expect(stdout).toContain(`--[ FAILURE: ${OPERATION_A} ]--`);
      expect(stdout).toMatch(DURATION_LINE);
      expect(getActivity(client, 'stderr')).toContain('Operations failed.');
    } finally {
      await fixture.session[Symbol.asyncDispose]();
    }
  });

  it('gives each coalesced request a summary of only its own selection', async () => {
    const fixture: ITestRoutingFixture = createFixture();
    try {
      const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
      const clientA: TestPhasedRequestClient = new TestPhasedRequestClient('one');
      const clientC: TestPhasedRequestClient = new TestPhasedRequestClient('two');
      await Promise.all([
        router.executeAsync(createRequest('a', OPERATION_A), clientA),
        router.executeAsync(createRequest('c', OPERATION_C), clientC)
      ]);
      expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(1);
      expect(fixture.runners.get(OPERATION_C)?.runCount).toBe(1);
      const stdoutA: string = getSummary(getActivity(clientA, 'stdout'));
      const stdoutC: string = getSummary(getActivity(clientC, 'stdout'));
      expect(stdoutA).toContain('==[ SUCCESS: 1 operation ]==');
      expect(stdoutA).toContain(`  ${OPERATION_A}`);
      expect(stdoutA).not.toContain(OPERATION_C);
      expect(stdoutC).toContain('==[ SUCCESS: 1 operation ]==');
      expect(stdoutC).toContain(`  ${OPERATION_C}`);
      expect(stdoutC).not.toContain(OPERATION_A);
      expect(stdoutA).toMatch(DURATION_LINE);
      expect(stdoutC).toMatch(DURATION_LINE);
    } finally {
      await fixture.session[Symbol.asyncDispose]();
    }
  });
});
