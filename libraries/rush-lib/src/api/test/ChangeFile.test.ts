// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ChangeFile } from '../ChangeFile';
import { RushConfiguration } from '../RushConfiguration';
import { ChangeType } from '../ChangeManagement';
import { Git } from '../../logic/Git';

describe(ChangeFile.name, () => {
  it('generates a path that includes seconds so repeated invocations do not collide', () => {
    const rushFilename: string = `${__dirname}/repo/rush-npm.json`;
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);

    // Pin the branch name so the generated filename is deterministic.
    const getGitInfoSpy: jest.SpyInstance = jest
      .spyOn(Git.prototype, 'getGitInfo')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockReturnValue({ branch: 'my-branch' } as any);

    // Pin the clock to 2017-05-01 20:20:30 UTC so the timestamp is deterministic.
    const fixedDate: Date = new Date('2017-05-01T20:20:30.000Z');
    const dateSpy: jest.SpyInstance = jest
      .spyOn(global, 'Date')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation(() => fixedDate as any);

    try {
      const changeFile: ChangeFile = new ChangeFile(
        {
          packageName: 'a',
          changes: [],
          email: 'fake@microsoft.com'
        },
        rushConfiguration
      );

      const generatedPath: string = changeFile.generatePath();

      // The seconds must be present and every part must be dash-separated (no leftover colons).
      expect(generatedPath.replace(/\\/g, '/')).toContain('my-branch_2017-05-01-20-20-30.json');
      expect(generatedPath).not.toContain(':');
    } finally {
      dateSpy.mockRestore();
      getGitInfoSpy.mockRestore();
    }
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
