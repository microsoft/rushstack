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

describe('PNPM configuration arguments', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  interface IConfigurationArgsScenario {
    frozenLockfileForInstall?: boolean;
    hasInjectedDependencies?: boolean;
  }

  function getConfigurationArgs(
    pnpmVersion: string,
    npmrcSettings: boolean,
    pnpmOptions: Partial<Pick<PnpmOptionsConfiguration, 'autoInstallPeers' | 'resolutionMode'>> = {},
    { frozenLockfileForInstall = false, hasInjectedDependencies = false }: IConfigurationArgsScenario = {}
  ): { args: string[]; output: string; warnings: string } {
    jest.spyOn(npmrcUtilities, 'isVariableSetInNpmrcFile').mockReturnValue(npmrcSettings);
    const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
    const manager: FakeBaseInstallManager = Object.create(FakeBaseInstallManager.prototype);
    Object.assign(manager, {
      rushConfiguration: {
        packageManager: 'pnpm',
        isPnpm: true,
        packageManagerToolVersion: pnpmVersion,
        pnpmOptions: { pnpmStore: 'global', pnpmStorePath: '/repo/common/temp/pnpm-store', ...pnpmOptions },
        experimentsConfiguration: {
          configuration: { usePnpmFrozenLockfileForRushInstall: frozenLockfileForInstall }
        }
      },
      _terminal: new Terminal(terminalProvider)
    });
    const args: string[] = [];
    manager.pushConfigurationArgs(
      args,
      { pnpmFilterArgumentValues: [], allowShrinkwrapUpdates: false } as unknown as IInstallManagerOptions,
      {
        getSubspaceConfigFolderPath: () => '/repo/common/config/rush',
        getPackageJsonInjectedDependenciesHash: () => (hasInjectedDependencies ? 'hash' : undefined)
      } as unknown as Subspace
    );
    return { args, output: terminalProvider.getOutput(), warnings: terminalProvider.getWarningOutput() };
  }

  it.each([
    ['10.27.0', true],
    ['12.10.1', false]
  ])(
    'uses a frozen lockfile for install with PNPM %s when injected dependencies=%s',
    (pnpmVersion: string, hasInjectedDependencies: boolean) => {
      const { args, output } = getConfigurationArgs(
        pnpmVersion,
        false,
        {},
        {
          frozenLockfileForInstall: true,
          hasInjectedDependencies
        }
      );

      expect(args).toContain('--frozen-lockfile');
      expect(args).not.toContain('--no-frozen-lockfile');
      expect(args).not.toContain('--prefer-frozen-lockfile');
      expect(output).not.toContain('injected workspace dependencies');
    }
  );

  it('prefers the lockfile for install with native PNPM and injected dependencies', () => {
    const { args, output, warnings } = getConfigurationArgs(
      '12.10.1',
      false,
      {},
      {
        frozenLockfileForInstall: true,
        hasInjectedDependencies: true
      }
    );

    expect(args).toContain('--no-frozen-lockfile');
    expect(args).toContain('--prefer-frozen-lockfile');
    expect(args).not.toContain('--frozen-lockfile');
    expect(output).toContain('cannot verify injected workspace dependencies with "--frozen-lockfile"');
    expect(warnings).toBe('');
  });

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
