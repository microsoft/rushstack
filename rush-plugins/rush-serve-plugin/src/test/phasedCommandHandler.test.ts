// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('@rushstack/debug-certificate-manager', () => {
  return {
    CertificateManager: class {
      public async ensureCertificateAsync(): Promise<{}> {
        // The server does not need a real certificate to start listening.
        return {};
      }
    }
  };
});

import type {
  ICreateOperationsContext,
  IPhasedCommand,
  Operation,
  RushConfiguration,
  RushSession
} from '@rushstack/rush-sdk';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';
import {
  type CommandLineIntegerParameter,
  DynamicCommandLineAction,
  DynamicCommandLineParser
} from '@rushstack/ts-command-line';

import { phasedCommandHandler } from '../phasedCommandHandler';

type CreateOperationsAsync = (
  operations: Set<Operation>,
  context: ICreateOperationsContext
) => Promise<Set<Operation>>;

describe(phasedCommandHandler.name, () => {
  it('writes the port that the server listens on back to the port parameter', async () => {
    const parser: DynamicCommandLineParser = new DynamicCommandLineParser({
      toolFilename: 'rush',
      toolDescription: 'test'
    });
    const action: DynamicCommandLineAction = new DynamicCommandLineAction({
      actionName: 'start',
      summary: 'test',
      documentation: 'test'
    });
    parser.addAction(action);
    const portParameter: CommandLineIntegerParameter = action.defineIntegerParameter({
      parameterLongName: '--port',
      argumentName: 'PORT',
      description: 'The port to serve on'
    });
    // The port is not specified, so the server should pick one
    await parser.executeWithoutErrorHandlingAsync(['start']);
    expect(portParameter.value).toBeUndefined();

    let createOperationsAsync: CreateOperationsAsync | undefined;
    const sessionAbortController: AbortController = new AbortController();
    const command: IPhasedCommand = {
      actionName: 'start',
      hooks: {
        createOperationsAsync: {
          tapPromise: (options: unknown, fn: CreateOperationsAsync) => {
            createOperationsAsync = fn;
          }
        },
        onGraphCreatedAsync: {
          tap: () => {
            // Not needed by this test
          }
        }
      },
      sessionAbortController
    } as unknown as IPhasedCommand;

    const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
    const terminal: Terminal = new Terminal(terminalProvider);
    const rushSession: RushSession = {
      getLogger: () => ({ terminal })
    } as unknown as RushSession;

    await phasedCommandHandler({
      rushSession,
      rushConfiguration: {} as RushConfiguration,
      command,
      portParameterLongName: '--port',
      logServePath: undefined,
      globalRoutingRules: [],
      buildStatusWebSocketPath: undefined
    });

    const context: ICreateOperationsContext = {
      isWatch: true,
      generateFullGraph: false,
      projectSelection: new Set(),
      customParameters: new Map([['--port', portParameter]])
    } as unknown as ICreateOperationsContext;

    try {
      await createOperationsAsync!(new Set(), context);

      const port: number | undefined = portParameter.value;
      expect(typeof port).toBe('number');
      expect(port).toBeGreaterThan(0);
      expect(terminalProvider.getOutput()).toContain(`https://localhost:${port}/`);

      // This is how the value is forwarded to the operations that receive the parameter
      const argList: string[] = [];
      portParameter.appendToArgList(argList);
      expect(argList).toEqual(['--port', `${port}`]);
    } finally {
      sessionAbortController.abort();
    }
  });
});
