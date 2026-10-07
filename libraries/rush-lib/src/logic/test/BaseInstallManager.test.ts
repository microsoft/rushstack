// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { FileSystem } from '@rushstack/node-core-library';
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

  public override pushConfigurationArgs(
    args: string[],
    options: IInstallManagerOptions,
    subspace: Subspace
  ): void {
    return super.pushConfigurationArgs(args, options, subspace);
  }

  public override shouldCopyTempShrinkwrapAsync(
    subspace: Subspace,
    variant: string | undefined,
    shrinkwrapIsUpToDate: boolean
  ): Promise<boolean> {
    return super.shouldCopyTempShrinkwrapAsync(subspace, variant, shrinkwrapIsUpToDate);
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

describe(BaseInstallManager.name, () => {
  describe('shouldCopyTempShrinkwrapAsync', () => {
    const rushGlobalFolder: RushGlobalFolder = new RushGlobalFolder();
    let tempFolder: string;
    let tempShrinkwrapPath: string;
    let committedShrinkwrapPath: string;

    beforeEach(async () => {
      tempFolder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-temp-shrinkwrap-'));
      tempShrinkwrapPath = path.join(tempFolder, 'temp-lock.yaml');
      committedShrinkwrapPath = path.join(tempFolder, 'committed-lock.yaml');
    });

    afterEach(async () => {
      jest.restoreAllMocks();
      await FileSystem.deleteFolderAsync(tempFolder);
    });

    function createManager(
      rushJsonName: string,
      allowShrinkwrapUpdates: boolean
    ): { manager: FakeBaseInstallManager; subspace: Subspace } {
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        path.resolve(__dirname, 'tempShrinkwrapSync', rushJsonName)
      );
      const subspace: Subspace = rushConfiguration.defaultSubspace;
      jest.spyOn(subspace, 'getTempShrinkwrapFilename').mockReturnValue(tempShrinkwrapPath);
      jest.spyOn(subspace, 'getCommittedShrinkwrapFilePath').mockReturnValue(committedShrinkwrapPath);
      const options: IInstallManagerOptions = {
        subspace,
        allowShrinkwrapUpdates,
        terminal: new Terminal(new ConsoleTerminalProvider())
      } as unknown as IInstallManagerOptions;
      const manager: FakeBaseInstallManager = new FakeBaseInstallManager(
        rushConfiguration,
        rushGlobalFolder,
        new PurgeManager(rushConfiguration, rushGlobalFolder),
        options
      );
      return { manager, subspace };
    }

    it('returns true for rush update when the shrinkwrap is out of date', async () => {
      const { manager, subspace } = createManager('rush-pnpm11.json', true);
      await expect(manager.shouldCopyTempShrinkwrapAsync(subspace, undefined, false)).resolves.toBe(true);
    });

    it('returns false for rush install, even when the files differ', async () => {
      await FileSystem.writeFileAsync(tempShrinkwrapPath, 'new');
      await FileSystem.writeFileAsync(committedShrinkwrapPath, 'old');
      const { manager, subspace } = createManager('rush-pnpm12.json', false);
      await expect(manager.shouldCopyTempShrinkwrapAsync(subspace, undefined, false)).resolves.toBe(false);
      await expect(manager.shouldCopyTempShrinkwrapAsync(subspace, undefined, true)).resolves.toBe(false);
    });

    it('returns true with pnpm 12 when pnpm changed the temp lockfile', async () => {
      await FileSystem.writeFileAsync(tempShrinkwrapPath, 'graphql@16.13.1\n');
      await FileSystem.writeFileAsync(committedShrinkwrapPath, 'graphql@17.0.0-alpha.7\n');
      const { manager, subspace } = createManager('rush-pnpm12.json', true);
      await expect(manager.shouldCopyTempShrinkwrapAsync(subspace, undefined, true)).resolves.toBe(true);
    });

    it('returns false with pnpm 12 when the files are equal', async () => {
      await FileSystem.writeFileAsync(tempShrinkwrapPath, 'same\n');
      await FileSystem.writeFileAsync(committedShrinkwrapPath, 'same\n');
      const { manager, subspace } = createManager('rush-pnpm12.json', true);
      await expect(manager.shouldCopyTempShrinkwrapAsync(subspace, undefined, true)).resolves.toBe(false);
    });

    it('returns false with pnpm 12 when only line endings differ', async () => {
      await FileSystem.writeFileAsync(tempShrinkwrapPath, 'a\nb\n');
      await FileSystem.writeFileAsync(committedShrinkwrapPath, 'a\r\nb\r\n');
      const { manager, subspace } = createManager('rush-pnpm12.json', true);
      await expect(manager.shouldCopyTempShrinkwrapAsync(subspace, undefined, true)).resolves.toBe(false);
    });

    it('returns false with pnpm 12 when the temp lockfile is missing', async () => {
      await FileSystem.writeFileAsync(committedShrinkwrapPath, 'old\n');
      const { manager, subspace } = createManager('rush-pnpm12.json', true);
      await expect(manager.shouldCopyTempShrinkwrapAsync(subspace, undefined, true)).resolves.toBe(false);
    });

    it('returns true with pnpm 12 when the committed lockfile is missing', async () => {
      await FileSystem.writeFileAsync(tempShrinkwrapPath, 'new\n');
      const { manager, subspace } = createManager('rush-pnpm12.json', true);
      await expect(manager.shouldCopyTempShrinkwrapAsync(subspace, undefined, true)).resolves.toBe(true);
    });

    it('reads the committed lockfile for the given variant', async () => {
      const variantShrinkwrapPath: string = path.join(tempFolder, 'variant-lock.yaml');
      await FileSystem.writeFileAsync(tempShrinkwrapPath, 'new\n');
      await FileSystem.writeFileAsync(variantShrinkwrapPath, 'new\n');
      await FileSystem.writeFileAsync(committedShrinkwrapPath, 'old\n');
      const { manager, subspace } = createManager('rush-pnpm12.json', true);
      jest
        .spyOn(subspace, 'getCommittedShrinkwrapFilePath')
        .mockImplementation((variant) =>
          variant === 'my-variant' ? variantShrinkwrapPath : committedShrinkwrapPath
        );
      await expect(manager.shouldCopyTempShrinkwrapAsync(subspace, 'my-variant', true)).resolves.toBe(false);
      expect(subspace.getCommittedShrinkwrapFilePath).toHaveBeenCalledWith('my-variant');
    });

    it('returns true with a pnpm 12 prerelease when pnpm changed the temp lockfile', async () => {
      await FileSystem.writeFileAsync(tempShrinkwrapPath, 'new\n');
      await FileSystem.writeFileAsync(committedShrinkwrapPath, 'old\n');
      const { manager, subspace } = createManager('rush-pnpm12-prerelease.json', true);
      await expect(manager.shouldCopyTempShrinkwrapAsync(subspace, undefined, true)).resolves.toBe(true);
    });

    it('returns true with pnpm 12 when the shrinkwrap is out of date and the temp lockfile is missing', async () => {
      await FileSystem.writeFileAsync(committedShrinkwrapPath, 'old\n');
      const { manager, subspace } = createManager('rush-pnpm12.json', true);
      await expect(manager.shouldCopyTempShrinkwrapAsync(subspace, undefined, false)).resolves.toBe(true);
    });

    it('rethrows a read error other than a missing file', async () => {
      await FileSystem.ensureFolderAsync(tempShrinkwrapPath);
      await FileSystem.writeFileAsync(committedShrinkwrapPath, 'old\n');
      const { manager, subspace } = createManager('rush-pnpm12.json', true);
      await expect(manager.shouldCopyTempShrinkwrapAsync(subspace, undefined, true)).rejects.toThrow();
    });

    it('returns false for pnpm 11 when the files differ', async () => {
      await FileSystem.writeFileAsync(tempShrinkwrapPath, 'new\n');
      await FileSystem.writeFileAsync(committedShrinkwrapPath, 'old\n');
      const { manager, subspace } = createManager('rush-pnpm11.json', true);
      await expect(manager.shouldCopyTempShrinkwrapAsync(subspace, undefined, true)).resolves.toBe(false);
    });

    it('returns false for npm when the files differ', async () => {
      await FileSystem.writeFileAsync(tempShrinkwrapPath, 'new\n');
      await FileSystem.writeFileAsync(committedShrinkwrapPath, 'old\n');
      const { manager, subspace } = createManager('rush-npm.json', true);
      await expect(manager.shouldCopyTempShrinkwrapAsync(subspace, undefined, true)).resolves.toBe(false);
    });
  });
});
