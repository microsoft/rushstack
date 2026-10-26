// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('node:readline', () => ({ createInterface: jest.fn() }));

import { createInterface } from 'node:readline';

import type { ITerminal } from '@rushstack/terminal';

import { ensureCliAbortSignal } from './HeftActionRunner';

describe(ensureCliAbortSignal.name, () => {
  it('uses the graceful abort path for terminal Ctrl+C and external termination signals', () => {
    const cli = { on: jest.fn(), close: jest.fn() };
    (createInterface as jest.Mock).mockReturnValue(cli);
    const on = jest.spyOn(process, 'on').mockImplementation(() => process);
    try {
      const signal: AbortSignal = ensureCliAbortSignal({
        writeLine: jest.fn()
      } as unknown as ITerminal);
      const sigint = on.mock.calls.find(([event]) => event === 'SIGINT')![1];
      const sigterm = on.mock.calls.find(([event]) => event === 'SIGTERM')![1];
      expect(sigint).toBe(sigterm);
      expect(cli.on).toHaveBeenCalledWith('SIGINT', sigint);
      expect(signal.aborted).toBe(false);
      (sigterm as () => void)();
      expect(signal.aborted).toBe(true);
      expect(cli.close).toHaveBeenCalledTimes(1);
    } finally {
      on.mockRestore();
    }
  });
});
