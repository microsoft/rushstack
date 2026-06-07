// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

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
    // Use Jest fake timers so new Date() is intercepted at the engine level, which is
    // more reliable than spying on the Date constructor (the spy approach is fragile on
    // Windows with Node.js v24 because the V8 Date fast-path can bypass the spy).
    jest.useFakeTimers().setSystemTime(new Date('2017-05-01T20:20:30.000Z'));

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
      const filename: string = path.basename(generatedPath);

      // The seconds must be present and the filename must be fully dash-separated
      // (no leftover colons from the time portion).
      // Check toContain on the forward-slash-normalised path so it works on Windows too.
      expect(generatedPath.replace(/\\/g, '/')).toContain('my-branch_2017-05-01-20-20-30.json');
      // Only check the filename for colons, not the full path: on Windows the path
      // includes a drive letter (e.g. "D:\...") which legitimately contains a colon.
      expect(filename).not.toContain(':');
    } finally {
      jest.useRealTimers();
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
