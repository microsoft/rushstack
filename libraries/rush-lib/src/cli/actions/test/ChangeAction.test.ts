// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import '../../test/mockRushCommandLineParser';

import { AlreadyReportedError, LockFile } from '@rushstack/node-core-library';

import { EnvironmentConfiguration } from '../../../api/EnvironmentConfiguration';
import * as PolicyValidator from '../../../logic/policy/PolicyValidator';
import { RushCommandLineParser } from '../../RushCommandLineParser';
import { ChangeAction } from '../ChangeAction';

describe(ChangeAction.name, () => {
  let oldExitCode: number | string | undefined;
  let oldArgs: string[];

  beforeEach(() => {
    jest.spyOn(process, 'exit').mockImplementation();

    // Suppress "Another Rush command is already running" error
    jest.spyOn(LockFile, 'tryAcquire').mockImplementation(() => ({}) as LockFile);

    oldExitCode = process.exitCode;
    oldArgs = process.argv;
  });

  afterEach(() => {
    jest.clearAllMocks();
    process.exitCode = oldExitCode;
    process.argv = oldArgs;
    EnvironmentConfiguration.reset();
  });

  it('runs policy validation before verifying change files', async () => {
    const startPath: string = `${__dirname}/changeRepo`;
    const parser: RushCommandLineParser = new RushCommandLineParser({ cwd: startPath });

    const validatePolicySpy: jest.SpyInstance = jest
      .spyOn(PolicyValidator, 'validatePolicyAsync')
      .mockResolvedValue();
    const verifySpy: jest.SpyInstance = jest
      .spyOn(ChangeAction.prototype as unknown as { _verifyAsync: () => Promise<void> }, '_verifyAsync')
      .mockResolvedValue();

    process.argv = [
      'pretend-this-is-node.exe',
      'pretend-this-is-rush',
      'change',
      '--verify',
      '--target-branch',
      'origin/main'
    ];

    await expect(parser.executeAsync()).resolves.toEqual(true);
    expect(validatePolicySpy).toHaveBeenCalledTimes(1);
    expect(validatePolicySpy).toHaveBeenCalledWith(
      parser.rushConfiguration,
      parser.rushConfiguration.defaultSubspace,
      undefined,
      {
        allowShrinkwrapUpdates: true
      }
    );
    expect(verifySpy).toHaveBeenCalledTimes(1);
  });

  it('aborts rush change when policy validation fails', async () => {
    const startPath: string = `${__dirname}/changeRepo`;
    const parser: RushCommandLineParser = new RushCommandLineParser({ cwd: startPath });

    const verifySpy: jest.SpyInstance = jest
      .spyOn(ChangeAction.prototype as unknown as { _verifyAsync: () => Promise<void> }, '_verifyAsync')
      .mockResolvedValue();
    jest.spyOn(PolicyValidator, 'validatePolicyAsync').mockRejectedValue(new AlreadyReportedError());

    process.argv = [
      'pretend-this-is-node.exe',
      'pretend-this-is-rush',
      'change',
      '--verify',
      '--target-branch',
      'origin/main'
    ];

    await expect(parser.executeAsync()).resolves.toEqual(false);
    expect(verifySpy).not.toHaveBeenCalled();
  });
});
