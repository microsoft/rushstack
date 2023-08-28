// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushCommandLine } from '../RushCommandLine';
import { RushCommandLineParser } from '../../cli/RushCommandLineParser';

describe('RushCLI', () => {
  test.only(`Returns a spec`, async () => {
    const spec = RushCommandLine.getSpec(process.cwd());
    // Check that RushCommandLine returns the same action names as RushCommandLineParser
    const commandLineParser = new RushCommandLineParser({ cwd: process.cwd() });

    const specActionItems = spec.map((action) => action.actionName);
    const parserActionItems = commandLineParser.actions.map((action) => action.actionName);

    expect(specActionItems).toEqual(parserActionItems);
  });
});
