// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import {
  ConsoleTerminalProvider,
  type ITerminal,
  StringBufferTerminalProvider,
  Terminal
} from '@rushstack/terminal';

import { PurgeManager } from '../PurgeManager';
import { BaseInstallManager, pnpmIgnoreCompatibilityDbParameter } from '../base/BaseInstallManager';
import type { IInstallManagerOptions } from '../base/BaseInstallManagerTypes';

import { RushConfiguration } from '../../api/RushConfiguration';
import { RushGlobalFolder } from '../../api/RushGlobalFolder';
import type { Subspace } from '../../api/Subspace';
import type { PnpmOptionsConfiguration } from '../pnpm/PnpmOptionsConfiguration';
import * as npmrcUtilities from '../../utilities/npmrcUtilities';
import { EnvironmentConfiguration, EnvironmentVariableNames } from '../../api/EnvironmentConfiguration';

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

  public override pushConfigurationArgs(
    args: string[],
    options: IInstallManagerOptions,
    subspace: Subspace
  ): void {
    return super.pushConfigurationArgs(args, options, subspace);
  }
}

describe('BaseInstallManager Test', () => {
  const rushGlobalFolder: RushGlobalFolder = new RushGlobalFolder();

  afterEach(() => {
    EnvironmentConfiguration.reset();
  });

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

  it('passes --store when RUSH_PNPM_ENABLE_GLOBAL_VIRTUAL_STORE is used with a local PNPM store', () => {
    const originalPnpmGlobalVirtualStore: string | undefined =
      process.env[EnvironmentVariableNames.RUSH_PNPM_ENABLE_GLOBAL_VIRTUAL_STORE];
    const originalPnpmStorePath: string | undefined =
      process.env[EnvironmentVariableNames.RUSH_PNPM_STORE_PATH];
    try {
      process.env[EnvironmentVariableNames.RUSH_PNPM_ENABLE_GLOBAL_VIRTUAL_STORE] = '1';
      delete process.env[EnvironmentVariableNames.RUSH_PNPM_STORE_PATH];
      EnvironmentConfiguration.reset();

      const rushJsonFile: string = path.resolve(__dirname, 'ignoreCompatibilityDb/rush3.json');
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
      const purgeManager: typeof PurgeManager.prototype = new PurgeManager(
        rushConfiguration,
        rushGlobalFolder
      );
      const options: IInstallManagerOptions = {
        subspace: rushConfiguration.defaultSubspace
      } as IInstallManagerOptions;
      const fakeBaseInstallManager: FakeBaseInstallManager = new FakeBaseInstallManager(
        rushConfiguration,
        rushGlobalFolder,
        purgeManager,
        options
      );

      const args: string[] = [];
      fakeBaseInstallManager.pushConfigurationArgs(args, options, rushConfiguration.defaultSubspace);

      expect(rushConfiguration.pnpmOptions.pnpmStore).toEqual('local');
      expect(rushConfiguration.pnpmOptions.pnpmStorePath).not.toEqual('');
      expect(args).toContain('--store');
      expect(args).toContain(rushConfiguration.pnpmOptions.pnpmStorePath);
    } finally {
      if (originalPnpmGlobalVirtualStore === undefined) {
        delete process.env[EnvironmentVariableNames.RUSH_PNPM_ENABLE_GLOBAL_VIRTUAL_STORE];
      } else {
        process.env[EnvironmentVariableNames.RUSH_PNPM_ENABLE_GLOBAL_VIRTUAL_STORE] =
          originalPnpmGlobalVirtualStore;
      }
      if (originalPnpmStorePath === undefined) {
        delete process.env[EnvironmentVariableNames.RUSH_PNPM_STORE_PATH];
      } else {
        process.env[EnvironmentVariableNames.RUSH_PNPM_STORE_PATH] = originalPnpmStorePath;
      }
      EnvironmentConfiguration.reset();
    }
  });

  it('does not pass --store when RUSH_PNPM_ENABLE_GLOBAL_VIRTUAL_STORE is used with a global PNPM store', () => {
    const originalPnpmGlobalVirtualStore: string | undefined =
      process.env[EnvironmentVariableNames.RUSH_PNPM_ENABLE_GLOBAL_VIRTUAL_STORE];
    const originalPnpmStorePath: string | undefined =
      process.env[EnvironmentVariableNames.RUSH_PNPM_STORE_PATH];
    try {
      process.env[EnvironmentVariableNames.RUSH_PNPM_ENABLE_GLOBAL_VIRTUAL_STORE] = '1';
      delete process.env[EnvironmentVariableNames.RUSH_PNPM_STORE_PATH];
      EnvironmentConfiguration.reset();

      const rushJsonFile: string = path.resolve(__dirname, '../../api/test/repo/rush-pnpm-global.json');
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
      const purgeManager: typeof PurgeManager.prototype = new PurgeManager(
        rushConfiguration,
        rushGlobalFolder
      );
      const options: IInstallManagerOptions = {
        subspace: rushConfiguration.defaultSubspace
      } as IInstallManagerOptions;
      const fakeBaseInstallManager: FakeBaseInstallManager = new FakeBaseInstallManager(
        rushConfiguration,
        rushGlobalFolder,
        purgeManager,
        options
      );

      const args: string[] = [];
      fakeBaseInstallManager.pushConfigurationArgs(args, options, rushConfiguration.defaultSubspace);

      expect(rushConfiguration.pnpmOptions.pnpmStore).toEqual('global');
      expect(rushConfiguration.pnpmOptions.pnpmStorePath).toEqual('');
      expect(args).not.toContain('--store');
    } finally {
      if (originalPnpmGlobalVirtualStore === undefined) {
        delete process.env[EnvironmentVariableNames.RUSH_PNPM_ENABLE_GLOBAL_VIRTUAL_STORE];
      } else {
        process.env[EnvironmentVariableNames.RUSH_PNPM_ENABLE_GLOBAL_VIRTUAL_STORE] =
          originalPnpmGlobalVirtualStore;
      }
      if (originalPnpmStorePath === undefined) {
        delete process.env[EnvironmentVariableNames.RUSH_PNPM_STORE_PATH];
      } else {
        process.env[EnvironmentVariableNames.RUSH_PNPM_STORE_PATH] = originalPnpmStorePath;
      }
      EnvironmentConfiguration.reset();
    }
  });

  it('passes --store when RUSH_PNPM_ENABLE_GLOBAL_VIRTUAL_STORE uses an explicit PNPM store path', () => {
    const originalPnpmGlobalVirtualStore: string | undefined =
      process.env[EnvironmentVariableNames.RUSH_PNPM_ENABLE_GLOBAL_VIRTUAL_STORE];
    const originalPnpmStorePath: string | undefined =
      process.env[EnvironmentVariableNames.RUSH_PNPM_STORE_PATH];
    try {
      const expectedStorePath: string = path.resolve('/var/temp/pnpm-store');
      process.env[EnvironmentVariableNames.RUSH_PNPM_ENABLE_GLOBAL_VIRTUAL_STORE] = '1';
      process.env[EnvironmentVariableNames.RUSH_PNPM_STORE_PATH] = expectedStorePath;
      EnvironmentConfiguration.reset();

      const rushJsonFile: string = path.resolve(__dirname, 'ignoreCompatibilityDb/rush3.json');
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
      const purgeManager: typeof PurgeManager.prototype = new PurgeManager(
        rushConfiguration,
        rushGlobalFolder
      );
      const options: IInstallManagerOptions = {
        subspace: rushConfiguration.defaultSubspace
      } as IInstallManagerOptions;
      const fakeBaseInstallManager: FakeBaseInstallManager = new FakeBaseInstallManager(
        rushConfiguration,
        rushGlobalFolder,
        purgeManager,
        options
      );

      const args: string[] = [];
      fakeBaseInstallManager.pushConfigurationArgs(args, options, rushConfiguration.defaultSubspace);

      expect(rushConfiguration.pnpmOptions.pnpmStorePath).toEqual(expectedStorePath);
      expect(args).toContain('--store');
      expect(args).toContain(expectedStorePath);
    } finally {
      if (originalPnpmGlobalVirtualStore === undefined) {
        delete process.env[EnvironmentVariableNames.RUSH_PNPM_ENABLE_GLOBAL_VIRTUAL_STORE];
      } else {
        process.env[EnvironmentVariableNames.RUSH_PNPM_ENABLE_GLOBAL_VIRTUAL_STORE] =
          originalPnpmGlobalVirtualStore;
      }
      if (originalPnpmStorePath === undefined) {
        delete process.env[EnvironmentVariableNames.RUSH_PNPM_STORE_PATH];
      } else {
        process.env[EnvironmentVariableNames.RUSH_PNPM_STORE_PATH] = originalPnpmStorePath;
      }
      EnvironmentConfiguration.reset();
    }
  });
});

describe('PNPM configuration arguments', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function getConfigurationArgs(
    pnpmVersion: string,
    npmrcSettings: boolean,
    pnpmOptions: Partial<Pick<PnpmOptionsConfiguration, 'autoInstallPeers' | 'resolutionMode'>> = {}
  ): { args: string[]; warnings: string } {
    jest.spyOn(npmrcUtilities, 'isVariableSetInNpmrcFile').mockReturnValue(npmrcSettings);
    const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
    const manager: FakeBaseInstallManager = Object.create(FakeBaseInstallManager.prototype);
    Object.assign(manager, {
      rushConfiguration: {
        packageManager: 'pnpm',
        isPnpm: true,
        packageManagerToolVersion: pnpmVersion,
        pnpmOptions: { pnpmStore: 'global', pnpmStorePath: '/repo/common/temp/pnpm-store', ...pnpmOptions },
        experimentsConfiguration: { configuration: {} }
      },
      _terminal: new Terminal(terminalProvider)
    });
    const args: string[] = [];
    manager.pushConfigurationArgs(
      args,
      { pnpmFilterArgumentValues: [] } as unknown as IInstallManagerOptions,
      { getSubspaceConfigFolderPath: () => '/repo/common/config/rush' } as Subspace
    );
    return { args, warnings: terminalProvider.getWarningOutput() };
  }

  it.each(['8.14.0', '12.11.2'])(
    'uses Rush defaults when settings are absent with PNPM %s',
    (pnpmVersion: string) => {
      const { args, warnings } = getConfigurationArgs(pnpmVersion, false);

      expect(args).toContain('--config.auto-install-peers=false');
      expect(args).toContain('--config.resolutionMode=highest');
      expect(warnings).toBe('');
    }
  );

  it.each(['8.14.0', '10.27.0', '11.0.0'])(
    'preserves the compatibility database flag for PNPM %s',
    (pnpmVersion: string) => {
      const { args } = getConfigurationArgs(pnpmVersion, false);

      expect(args).toContain('--config.ignoreCompatibilityDb');
      expect(args).not.toContain('--config.ignoreCompatibilityDb=true');
    }
  );

  it('explicitly disables the compatibility database for native PNPM', () => {
    const { args } = getConfigurationArgs('12.11.2', false);

    expect(args).toContain('--config.ignoreCompatibilityDb=true');
    expect(args).not.toContain('--config.ignoreCompatibilityDb');
  });

  it('lets PNPM 8 consume settings from npmrc', () => {
    const { args, warnings } = getConfigurationArgs('8.14.0', true);

    expect(args.some((arg) => arg.startsWith('--config.auto-install-peers='))).toBe(false);
    expect(args.some((arg) => arg.startsWith('--config.resolutionMode='))).toBe(false);
    expect(warnings).toBe('');
  });

  it.each(['11.0.0', '12.11.2'])(
    'does not let ignored npmrc settings suppress defaults with PNPM %s',
    (pnpmVersion: string) => {
      const { args, warnings } = getConfigurationArgs(pnpmVersion, true);

      expect(args).toContain('--config.auto-install-peers=false');
      expect(args).toContain('--config.resolutionMode=highest');
      expect(warnings).toContain('ignores "auto-install-peers" in .npmrc');
      expect(warnings).toContain('ignores "resolution-mode" in .npmrc');
      expect(warnings).toContain('pnpm-config.json');
    }
  );

  it.each([
    ['8.14.0', true],
    ['8.14.0', false],
    ['12.11.2', true],
    ['12.11.2', false]
  ])(
    'preserves explicit PNPM %s configuration with autoInstallPeers=%s',
    (pnpmVersion: string, autoInstallPeers: boolean) => {
      const { args } = getConfigurationArgs(pnpmVersion, true, {
        autoInstallPeers,
        resolutionMode: 'lowest-direct'
      });

      expect(args).toContain(`--config.auto-install-peers=${autoInstallPeers}`);
      expect(args).toContain('--config.resolutionMode=lowest-direct');
    }
  );
});
