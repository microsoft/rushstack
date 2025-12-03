// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { RushConfiguration } from '../../api/RushConfiguration';
import { Git } from '../Git';
import { PublishGit } from '../PublishGit';
import { PublishUtilities } from '../PublishUtilities';

describe('PublishGit Test', () => {
  let gitPath: string;
  let execCommand: jest.SpyInstance;
  let publishGit: PublishGit;

  beforeAll(() => {
    gitPath = '/usr/bin/git';
    process.env.RUSH_GIT_BINARY_PATH = gitPath;
  });

  beforeEach(() => {
    execCommand = jest.spyOn(PublishUtilities, 'execCommandAsync').mockImplementation(async () => {
      /* no-op */
    });

    const rushFilename: string = path.resolve(__dirname, '../../api/test/repo/rush-npm.json');
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);
    const git: Git = new Git(rushConfiguration);
    publishGit = new PublishGit(git, 'test');
  });

  afterEach(() => {
    execCommand.mockClear();
  });

  it('Test git with no command line arg tag', async () => {
    await publishGit.addTagAsync(
      false,
      'project1',
      '2',
      undefined,
      undefined // This is undefined to simulate `rush publish ...` without --prerelease-name
    );
    expect(execCommand).toBeCalledTimes(1);
    expect(execCommand).toBeCalledWith(false, gitPath, ['tag', '-a', `project1_v2`, '-m', 'project1 v2']);
  });

  it('Test git with command line arg tag', async () => {
    await publishGit.addTagAsync(
      false,
      'project1',
      '2',
      undefined,
      'new_version_prerelease' // Simulates `rush publish ... --prerelease-name new_version_prerelease`
    );
    expect(execCommand).toBeCalledTimes(1);
    expect(execCommand).toBeCalledWith(false, gitPath, [
      'tag',
      '-a',
      `project1_v2-new_version_prerelease`,
      '-m',
      'project1 v2-new_version_prerelease'
    ]);
  });
});
