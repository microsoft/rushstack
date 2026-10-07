// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushCommandLineParser } from '../RushCommandLineParser';
import { EnvironmentConfiguration } from '../../api/EnvironmentConfiguration';
import { RushAlerts } from '../../utilities/RushAlerts';

describe('RushCommandLineParser alerts', () => {
  const originalArgv: string[] = process.argv;
  let originalExitCode: string | number | undefined;
  let printAlertsAsync: jest.Mock<Promise<void>, []>;

  beforeEach(() => {
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
    printAlertsAsync = jest.fn(async () => undefined);
    jest
      .spyOn(RushAlerts, 'loadFromConfigurationAsync')
      .mockResolvedValue({ printAlertsAsync } as unknown as RushAlerts);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    process.argv = originalArgv;
    EnvironmentConfiguration.reset();
    jest.restoreAllMocks();
  });

  async function executeAsync(args: string[]): Promise<void> {
    process.argv = ['pretend-this-is-node.exe', 'pretend-this-is-rush', ...args];
    const parser: RushCommandLineParser = new RushCommandLineParser({
      cwd: `${__dirname}/rushAlertsRepo`,
      reporterCloseAsync: async () => undefined
    });
    await expect(parser.executeAsync(args)).resolves.toBe(true);
  }

  it('prints alerts after a command when console output is not restricted', async () => {
    await executeAsync(['list']);

    expect(printAlertsAsync).toHaveBeenCalledTimes(1);
  });

  it.each(['list --json', '--quiet list', '-q list'])(
    'does not print alerts for "rush %s"',
    async (commandLine) => {
      await executeAsync(commandLine.split(' '));

      expect(RushAlerts.loadFromConfigurationAsync).not.toHaveBeenCalled();
      expect(printAlertsAsync).not.toHaveBeenCalled();
    }
  );
});
