// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import * as v8 from 'node:v8';
import * as vm from 'node:vm';

import { PhasedCommandEngine, type IParsePhasedCommandOptions } from '@microsoft/rush-lib';
import type { IDaemonRequestEnvelope } from '@rushstack/rush-daemon-protocol';
import { TerminalProviderSeverity } from '@rushstack/terminal';

import type { IResolveDaemonRequestOptions } from '../DaemonRequestDispatcher';
import { ProductionDaemonRequestResolver } from '../ProductionDaemonRequestResolver';
import type { IWorkspaceSession } from '../WorkspaceSession';
import { createWireEnvelope } from './DaemonRequestWireTestUtilities';

function createSession(): IWorkspaceSession {
  // The native engine is already bound, so that a resolution only parses and selects operations.
  return {
    rushConfiguration: {},
    rushSession: {},
    operationGraph: {},
    engineShape: {},
    initializeEngineAsync: async () => undefined
  } as unknown as IWorkspaceSession;
}

function createOptions(
  workspaceSession: IWorkspaceSession,
  abortController: AbortController = new AbortController()
): IResolveDaemonRequestOptions {
  return {
    abortSignal: abortController.signal,
    envelope: createWireEnvelope('request', 'build', process.cwd(), {
      commandOrigin: 'built-in',
      environment: Object.fromEntries(
        Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
      )
    }),
    workspaceSession
  };
}

/** Checks the identity of a request, which is unreachable when this returns. */
async function checkIdentityAsync(
  resolver: ProductionDaemonRequestResolver,
  session: IWorkspaceSession
): Promise<void> {
  await resolver.getCommandParameterIdentityAsync(createOptions(session));
}

/**
 * Returns V8's garbage collection function. Unless the process already exposes `gc`, `--expose-gc` is turned off
 * again once one context has it, because every context that is created while it is on gets a `gc` global: that
 * includes the one that jest creates for the next test file in this worker.
 */
function getGarbageCollection(): () => void {
  const exposed: unknown = (globalThis as { gc?: unknown }).gc;
  if (typeof exposed === 'function') {
    return exposed as () => void;
  }
  v8.setFlagsFromString('--expose-gc');
  try {
    return vm.runInNewContext('gc');
  } finally {
    v8.setFlagsFromString('--no-expose-gc');
  }
}

/** The workspace lifecycle resolves a request with a copy of the envelope of its identity check. */
function dispatched(options: IResolveDaemonRequestOptions): IResolveDaemonRequestOptions {
  return { ...options, envelope: { ...options.envelope, admission: { waitTimeoutMs: 1000 } } };
}

describe('ProductionDaemonRequestResolver command line parsing', () => {
  let parses: number;
  let parameterIdentity: string;
  let selectionError: Error | undefined;
  let commands: WeakRef<PhasedCommandEngine>[];
  let parse: jest.SpyInstance;

  beforeEach(() => {
    parses = 0;
    parameterIdentity = 'parameters';
    selectionError = undefined;
    commands = [];
    parse = jest
      .spyOn(PhasedCommandEngine, 'parseAsync')
      .mockImplementation(async ({ terminalProvider }: IParsePhasedCommandOptions) => {
        terminalProvider.write(`Warning from parse ${++parses}\n`, TerminalProviderSeverity.warning);
        const command: PhasedCommandEngine = {
          commandName: 'build',
          parameterIdentity,
          requestSettings: {},
          unmatchedCompatiblePluginNames: [],
          // The engine of any parse can serve any other parse.
          getEngineSharingBlocker: () => undefined,
          selectOperationsAsync: async () => {
            if (selectionError) throw selectionError;
            return new Map();
          }
        } as unknown as PhasedCommandEngine;
        commands.push(new WeakRef(command));
        return command;
      });
  });

  afterEach(() => {
    parse.mockRestore();
  });

  it('resolves a request with the parse of its identity check', async () => {
    const resolver: ProductionDaemonRequestResolver = new ProductionDaemonRequestResolver();
    const options: IResolveDaemonRequestOptions = createOptions(createSession());
    await expect(resolver.getCommandParameterIdentityAsync(options)).resolves.toBe('parameters');
    await expect(resolver.resolveRequestAsync(dispatched(options))).resolves.toMatchObject({
      kind: 'phased',
      request: { requestId: 'request' }
    });
    expect(parses).toBe(1);
  });

  it('resolves a request that the bound engine serves with the parse of its identity check', async () => {
    const resolver: ProductionDaemonRequestResolver = new ProductionDaemonRequestResolver();
    const session: IWorkspaceSession = createSession();
    await resolver.resolveRequestAsync(createOptions(session));
    // The identity check answers with the identity of the bound engine, which can serve this parse.
    parameterIdentity = 'other parameters';
    const options: IResolveDaemonRequestOptions = createOptions(session);
    await expect(resolver.getCommandParameterIdentityAsync(options)).resolves.toBe('parameters');
    await expect(resolver.resolveRequestAsync(dispatched(options))).resolves.toMatchObject({
      kind: 'phased',
      request: { requestId: 'request' }
    });
    expect(parses).toBe(2);
  });

  it.each<[string, Partial<IDaemonRequestEnvelope>]>([
    // build and rebuild are both built-in, so here only the name does not match the parse.
    ['name', { commandName: 'rebuild' }],
    ['origin', { commandOrigin: 'custom' }]
  ])(
    'checks the command %s of a request that it resolves with the parse of its identity check',
    async (name, change) => {
      const resolver: ProductionDaemonRequestResolver = new ProductionDaemonRequestResolver();
      const options: IResolveDaemonRequestOptions = createOptions(createSession());
      await resolver.getCommandParameterIdentityAsync(options);
      await expect(
        resolver.resolveRequestAsync({ ...options, envelope: { ...options.envelope, ...change } })
      ).rejects.toMatchObject({
        code: 'invalidRequest',
        message: 'The command name or origin does not match the native parsed argv.'
      });
      expect(parses).toBe(1);
    }
  );

  it('reports the diagnostics of the parse that it reused with a selection error', async () => {
    const resolver: ProductionDaemonRequestResolver = new ProductionDaemonRequestResolver();
    const session: IWorkspaceSession = createSession();
    await resolver.resolveRequestAsync(createOptions(session));
    const options: IResolveDaemonRequestOptions = createOptions(session);
    await resolver.getCommandParameterIdentityAsync(options);
    selectionError = new Error('The project name "nope" does not exist.');
    await expect(resolver.resolveRequestAsync(dispatched(options))).rejects.toMatchObject({
      code: 'invalidRequest',
      message: 'The project name "nope" does not exist.\nWarning from parse 2'
    });
    expect(parses).toBe(2);
  });

  it.each<[string, (envelope: IDaemonRequestEnvelope) => Partial<IDaemonRequestEnvelope>]>([
    ['another request', () => ({ requestId: 'another' })],
    ['another argv', ({ argv }) => ({ argv: [...argv] })],
    ['another working folder', ({ cwd }) => ({ cwd: path.dirname(cwd) })],
    ['another environment', ({ environment }) => ({ environment: { ...environment } })]
  ])('parses again to resolve %s', async (name, change) => {
    const resolver: ProductionDaemonRequestResolver = new ProductionDaemonRequestResolver();
    const options: IResolveDaemonRequestOptions = createOptions(createSession());
    await resolver.getCommandParameterIdentityAsync(options);
    await resolver.resolveRequestAsync({
      ...options,
      envelope: { ...options.envelope, ...change(options.envelope) }
    });
    expect(parses).toBe(2);
  });

  it('parses again to resolve a request for another session, or with another resolver', async () => {
    const resolver: ProductionDaemonRequestResolver = new ProductionDaemonRequestResolver();
    const options: IResolveDaemonRequestOptions = createOptions(createSession());
    await resolver.getCommandParameterIdentityAsync(options);
    await resolver.resolveRequestAsync({ ...options, workspaceSession: createSession() });
    expect(parses).toBe(2);
    await resolver.getCommandParameterIdentityAsync(options);
    await resolver.createForSession().resolveRequestAsync(dispatched(options));
    expect(parses).toBe(4);
  });

  it('uses the parse of an identity check for only one resolution', async () => {
    const resolver: ProductionDaemonRequestResolver = new ProductionDaemonRequestResolver();
    const options: IResolveDaemonRequestOptions = createOptions(createSession());
    await resolver.getCommandParameterIdentityAsync(options);
    await resolver.resolveRequestAsync(dispatched(options));
    await resolver.resolveRequestAsync(dispatched(options));
    expect(parses).toBe(2);
  });

  it('rejects a request that was cancelled after its identity check', async () => {
    const resolver: ProductionDaemonRequestResolver = new ProductionDaemonRequestResolver();
    const abortController: AbortController = new AbortController();
    const options: IResolveDaemonRequestOptions = createOptions(createSession(), abortController);
    await resolver.getCommandParameterIdentityAsync(options);
    abortController.abort();
    await expect(resolver.resolveRequestAsync(dispatched(options))).rejects.toMatchObject({
      code: 'routingFailed',
      message: 'The request was cancelled before engine initialization.'
    });
    expect(parses).toBe(1);
  });

  it('rejects a request if the daemon environment changed after its identity check', async () => {
    // A name that a plugin adds to the daemon's environment is not a change, so this changes a startup name.
    process.env.RUSHD_TEST_REQUEST_PARSE = 'startup';
    try {
      const resolver: ProductionDaemonRequestResolver = new ProductionDaemonRequestResolver();
      const options: IResolveDaemonRequestOptions = createOptions(createSession());
      await resolver.getCommandParameterIdentityAsync(options);
      process.env.RUSHD_TEST_REQUEST_PARSE = 'changed';
      await expect(resolver.resolveRequestAsync(dispatched(options))).rejects.toMatchObject({
        code: 'unsupported',
        message: expect.stringContaining(
          "The daemon's own environment changed after it started (RUSHD_TEST_REQUEST_PARSE)"
        )
      });
      expect(parses).toBe(1);
    } finally {
      delete process.env.RUSHD_TEST_REQUEST_PARSE;
    }
  });

  it('keeps the parse of an identity check only as long as its request', async () => {
    const collectGarbage: () => void = getGarbageCollection();
    const resolver: ProductionDaemonRequestResolver = new ProductionDaemonRequestResolver();
    await checkIdentityAsync(resolver, createSession());
    parse.mockClear();
    // A WeakRef keeps its target until the current job ends.
    await new Promise((resolve) => setImmediate(resolve));
    collectGarbage();
    expect(commands).toHaveLength(1);
    expect(commands[0].deref()).toBeUndefined();
  });
});
