// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { ConsoleTerminalProvider, type ITerminal, Terminal } from '@rushstack/terminal';

import { PurgeManager } from '../PurgeManager';
import { BaseInstallManager, pnpmIgnoreCompatibilityDbParameter } from '../base/BaseInstallManager';
import type { IInstallManagerOptions } from '../base/BaseInstallManagerTypes';

import { RushConfiguration } from '../../api/RushConfiguration';
import { RushGlobalFolder } from '../../api/RushGlobalFolder';
import type { Subspace } from '../../api/Subspace';

class FakeBaseInstallManager extends BaseInstallManager {
  public constructor(
    rushConfiguration: RushConfiguration,
    rushGlobalFolder: RushGlobalFolder,
    purgeManager: PurgeManager,
    options: IInstallManagerOptions
  ) {
    super(rushConfiguration, rushGlobalFolder, purgeManager, options);
  }

  protected prepareCommonTempAsync(): Promise<{
    shrinkwrapIsUpToDate: boolean;
    shrinkwrapWarnings: string[];
  }> {
    return Promise.resolve({ shrinkwrapIsUpToDate: true, shrinkwrapWarnings: [] });
  }

  protected installAsync(): Promise<void> {
    return Promise.resolve();
  }

  protected postInstallAsync(): Promise<void> {
    return Promise.resolve();
  }
  public pushConfigurationArgs(args: string[], options: IInstallManagerOptions, subspace: Subspace): void {
    return super.pushConfigurationArgs(args, options, subspace);
  }
}

describe('BaseInstallManager Test', () => {
  const rushGlobalFolder: RushGlobalFolder = new RushGlobalFolder();

  it('pnpm version in 6.32.12 - 6.33.x || 7.0.1 - 7.8.x should output warning', () => {
    const rushJsonFilePnpmV6: string = path.resolve(__dirname, 'ignoreCompatibilityDb/rush1.json');
    const rushJsonFilePnpmV7: string = path.resolve(__dirname, 'ignoreCompatibilityDb/rush2.json');
    const rushConfigurationV6: RushConfiguration =
      RushConfiguration.loadFromConfigurationFile(rushJsonFilePnpmV6);
    const rushConfigurationV7: RushConfiguration =
      RushConfiguration.loadFromConfigurationFile(rushJsonFilePnpmV7);
    const terminal: ITerminal = new Terminal(new ConsoleTerminalProvider());
    const options6: IInstallManagerOptions = {
      subspace: rushConfigurationV6.defaultSubspace,
      terminal
    } as IInstallManagerOptions;
    const options7: IInstallManagerOptions = {
      subspace: rushConfigurationV7.defaultSubspace,
      terminal
    } as IInstallManagerOptions;
    const purgeManager6: typeof PurgeManager.prototype = new PurgeManager(
      rushConfigurationV6,
      rushGlobalFolder
    );
    const purgeManager7: typeof PurgeManager.prototype = new PurgeManager(
      rushConfigurationV7,
      rushGlobalFolder
    );

    const fakeBaseInstallManager6: FakeBaseInstallManager = new FakeBaseInstallManager(
      rushConfigurationV6,
      rushGlobalFolder,
      purgeManager6,
      options6
    );

    const fakeBaseInstallManager7: FakeBaseInstallManager = new FakeBaseInstallManager(
      rushConfigurationV7,
      rushGlobalFolder,
      purgeManager7,
      options7
    );

    const mockWrite = jest.fn();
    jest.spyOn(ConsoleTerminalProvider.prototype, 'write').mockImplementation(mockWrite);

    const argsPnpmV6: string[] = [];
    fakeBaseInstallManager6.pushConfigurationArgs(argsPnpmV6, options6, rushConfigurationV7.defaultSubspace);
    expect(argsPnpmV6).not.toContain(pnpmIgnoreCompatibilityDbParameter);
    expect(mockWrite.mock.calls[0][0]).toContain(
      "Warning: Your rush.json specifies a pnpmVersion with a known issue that may cause unintended version selections. It's recommended to upgrade to PNPM >=6.34.0 or >=7.9.0. For details see: https://rushjs.io/link/pnpm-issue-5132"
    );

    const argsPnpmV7: string[] = [];
    fakeBaseInstallManager7.pushConfigurationArgs(argsPnpmV7, options7, rushConfigurationV7.defaultSubspace);
    expect(argsPnpmV7).not.toContain(pnpmIgnoreCompatibilityDbParameter);
    expect(mockWrite.mock.calls[0][0]).toContain(
      "Warning: Your rush.json specifies a pnpmVersion with a known issue that may cause unintended version selections. It's recommended to upgrade to PNPM >=6.34.0 or >=7.9.0. For details see: https://rushjs.io/link/pnpm-issue-5132"
    );
  });

  it(`pnpm version ^6.34.0 || gte 7.9.0 should add ${pnpmIgnoreCompatibilityDbParameter}`, () => {
    const rushJsonFile: string = path.resolve(__dirname, 'ignoreCompatibilityDb/rush3.json');
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
    const purgeManager: typeof PurgeManager.prototype = new PurgeManager(rushConfiguration, rushGlobalFolder);
    const options: IInstallManagerOptions = {
      subspace: rushConfiguration.defaultSubspace
    } as IInstallManagerOptions;

    const fakeBaseInstallManager: FakeBaseInstallManager = new FakeBaseInstallManager(
      rushConfiguration,
      rushGlobalFolder,
      purgeManager,
      options
    );

    const mockWrite = jest.fn();
    jest.spyOn(ConsoleTerminalProvider.prototype, 'write').mockImplementation(mockWrite);

    const args: string[] = [];
    fakeBaseInstallManager.pushConfigurationArgs(args, options, rushConfiguration.defaultSubspace);
    expect(args).toContain(pnpmIgnoreCompatibilityDbParameter);

    if (mockWrite.mock.calls.length) {
      expect(mockWrite.mock.calls[0][0]).not.toContain(
        "Warning: Your rush.json specifies a pnpmVersion with a known issue that may cause unintended version selections. It's recommended to upgrade to PNPM >=6.34.0 or >=7.9.0. For details see: https://rushjs.io/link/pnpm-issue-5132"
      );
    }
  });
});
