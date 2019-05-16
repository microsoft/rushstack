// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { RushConfiguration } from '../../../api/RushConfiguration';
import { NpmLinkManager } from '../NpmLinkManager';

describe('_linkProjects', () => {
  const rushFilename: string = path.resolve(__dirname, 'repo', 'rush.json');
  const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);

  const testNpmLinkManager: NpmLinkManager = new NpmLinkManager(rushConfiguration);

  it('links projects', () => {
    return testNpmLinkManager.createSymlinksForProjects(false).then(() => {
      // HALP: Not sure how to get this into an error state first to test the new logic
    });
  });
});
