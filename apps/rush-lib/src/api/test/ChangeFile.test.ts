// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { ChangeFile } from '../ChangeFile';
import { RushConfiguration } from '../RushConfiguration';
import { ChangeType } from '../ChangeManagement';

describe('ChangeFile', () => {
  it('can add a change', () => {
    const rushFilename: string = path.resolve(__dirname, 'repo', 'rush-npm.json');
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);

    const changeFile: ChangeFile = new ChangeFile({
      packageName: 'a',
      changes: [],
      email: 'fake@microsoft.com'
    }, rushConfiguration);

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

    expect(changeFile.getChanges('a').length).toEqual(2);
    expect(changeFile.getChanges('a')[0].comment).toEqual('for minor');
    expect(changeFile.getChanges('a')[1].comment).toEqual('for patch');
  });
});