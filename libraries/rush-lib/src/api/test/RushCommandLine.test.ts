// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';

import { RushCommandLine } from '../RushCommandLine.ts';

describe(RushCommandLine.name, () => {
  it(`Returns a spec`, async () => {
    const spec = RushCommandLine.getCliSpec(path.resolve(__dirname, '../../cli/test/repo/'));
    expect(spec).toMatchSnapshot();
  });
});
