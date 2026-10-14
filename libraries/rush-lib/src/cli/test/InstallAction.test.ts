// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import { RushConfiguration } from '../../api/RushConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { IInstallManagerOptions } from '../../logic/base/BaseInstallManagerTypes';
import { InstallAction } from '../actions/InstallAction';
import type { RushCommandLineParser } from '../RushCommandLineParser';

class TestInstallAction extends InstallAction {
  public override buildInstallOptionsAsync(): Promise<Omit<IInstallManagerOptions, 'subspace'>> {
    return super.buildInstallOptionsAsync();
  }
}

describe(InstallAction.name, () => {
  function createAction(
    pnpmVersion: string,
    resolutionOnly: boolean
  ): { action: TestInstallAction; selectProjects: jest.Mock } {
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
      `${__dirname}/catalogSyncTestRepo/rush.json`
    );
    Object.defineProperty(rushConfiguration, 'packageManagerToolVersion', { value: pnpmVersion });
    const action: TestInstallAction = new TestInstallAction({
      rushConfiguration,
      cwd: rushConfiguration.rushJsonFolder,
      terminal: new Terminal(new StringBufferTerminalProvider()),
      rushSession: { getReporter: () => undefined }
    } as unknown as RushCommandLineParser);
    Object.defineProperty(action.getFlagParameter('--resolution-only'), 'value', { value: resolutionOnly });

    const selectProjects: jest.Mock = jest.fn().mockResolvedValue(new Set<RushConfigurationProject>());
    Object.assign(action, {
      _selectionParameters: {
        getSelectedProjectsAsync: selectProjects,
        getPnpmFilterArgumentValuesAsync: async () => []
      }
    });
    return { action, selectProjects };
  }

  it('rejects PNPM 12 resolution-only before project selection or installation', async () => {
    const { action, selectProjects } = createAction('12.11.2', true);

    await expect(action.buildInstallOptionsAsync()).rejects.toThrow(
      'The "--resolution-only" parameter is not supported with PNPM 12.11.2. ' +
        'Use "rush-pnpm why <package>" to inspect dependencies, or run "rush update" to update the lockfile.'
    );
    expect(selectProjects).not.toHaveBeenCalled();
  });

  it('preserves PNPM 8 resolution-only behavior', async () => {
    const { action, selectProjects } = createAction('8.14.0', true);

    await expect(action.buildInstallOptionsAsync()).resolves.toMatchObject({
      resolutionOnly: true,
      allowShrinkwrapUpdates: false
    });
    expect(selectProjects).toHaveBeenCalledTimes(1);
  });

  it('allows ordinary PNPM 12 installs', async () => {
    const { action, selectProjects } = createAction('12.11.2', false);

    await expect(action.buildInstallOptionsAsync()).resolves.toMatchObject({
      resolutionOnly: false,
      allowShrinkwrapUpdates: false
    });
    expect(selectProjects).toHaveBeenCalledTimes(1);
  });
});
