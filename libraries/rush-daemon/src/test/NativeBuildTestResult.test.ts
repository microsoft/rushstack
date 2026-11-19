// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DaemonFrameType, encodeDaemonLogChunk } from '@rushstack/rush-daemon-protocol';

import type { ITerminalExchange } from './DaemonRequestWireTestUtilities';
import { assertSuccessfulNativeBuild } from './NativeBuildTestResult';

it('includes the actual operation stream and full terminal failure instead of an exit-code-only diff', () => {
  const exchange: ITerminalExchange = {
    terminal: {
      kind: 'requestResult',
      payload: {
        requestId: 'failure',
        exitCode: 1,
        outcome: 'failure',
        aborted: false,
        errorMessage: 'native runner failed'
      }
    },
    frames: [
      {
        kind: DaemonFrameType.logStdout,
        payload: encodeDaemonLogChunk({
          operationId: 'a (compile)',
          chunk: new TextEncoder().encode('Invoking the real script\n')
        })
      },
      {
        kind: DaemonFrameType.logStderr,
        payload: encodeDaemonLogChunk({
          operationId: 'a (compile)',
          chunk: new TextEncoder().encode('Error: write EPIPE\n    at fixtureChild (build.cjs:8:9)\n')
        })
      }
    ]
  };
  expect(() => assertSuccessfulNativeBuild(exchange)).toThrow(
    /native runner failed[\s\S]*\[stdout a \(compile\)\][\s\S]*Invoking the real script[\s\S]*\[stderr a \(compile\)\][\s\S]*Error: write EPIPE[\s\S]*build\.cjs:8:9/
  );
});

it('does not convert a rejected request into a successful graph', () => {
  const exchange: ITerminalExchange = {
    frames: [],
    terminal: {
      kind: 'requestRejected',
      payload: { requestId: 'rejected', code: 'routingFailed', message: 'native snapshot unavailable' }
    }
  };
  expect(() => assertSuccessfulNativeBuild(exchange)).toThrow('native snapshot unavailable');
});
