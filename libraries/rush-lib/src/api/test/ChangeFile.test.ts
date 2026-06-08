// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { GitRepoInfo } from 'git-repo-info';

import { ChangeFile } from '../ChangeFile';
import { RushConfiguration } from '../RushConfiguration';
import { ChangeType } from '../ChangeManagement';
import { Git } from '../../logic/Git';

describe(ChangeFile.name, () => {
  it('generates a path that includes seconds so repeated invocations do not collide', () => {
    const rushFilename: string = `${__dirname}/repo/rush-npm.json`;
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);

    // Pin the branch name so the generated filename is deterministic.
    jest.spyOn(Git.prototype, 'getGitInfo').mockReturnValue({ branch: 'my-branch' } as Readonly<GitRepoInfo>);

    // Pin the clock to 2017-05-01 20:20:30 UTC so the timestamp is deterministic.
    jest.useFakeTimers({
      now: new Date('2017-05-01T20:20:30.000Z').getTime()
    });

    const changeFile: ChangeFile = new ChangeFile(
      {
        packageName: 'a',
        changes: [],
        email: 'fake@microsoft.com'
      },
      rushConfiguration
    );

    const generatedPath: string = changeFile.generatePath();
    // The seconds must be present and the filename must be fully dash-separated
    // (no leftover colons from the time portion).
    // Check toContain on the forward-slash-normalised path so it works on Windows too.
    expect(generatedPath.replace(/\\/g, '/').endsWith('my-branch_2017-05-01-20-20-30.json')).toBe(true);
  });

  it('can add a change', () => {
    const rushFilename: string = `${__dirname}/repo/rush-npm.json`;
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);

    const changeFile: ChangeFile = new ChangeFile(
      {
        packageName: 'a',
        changes: [],
        email: 'fake@microsoft.com'
      },
      rushConfiguration
    );

    changeFile.addChange({
      packageName: 'a',
      changeType: ChangeType.minor,
      comment: 'for minor'
    });

    changeFile.addChange({
      packageName: 'a',
      changeType: ChangeType.patch,
      comment: 'for patch'
    });

    expect(changeFile.getChanges('a')).toHaveLength(2);
    expect(changeFile.getChanges('a')[0].comment).toEqual('for minor');
    expect(changeFile.getChanges('a')[1].comment).toEqual('for patch');
  });
});
