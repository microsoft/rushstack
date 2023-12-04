// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Note that Jest tests import the CommonJS files (from lib-commonjs/*.js)
// whereas Webpack will import the ESM files (from lib/*.js)
import { ToggleSwitch } from 'heft-web-rig-library-tutorial';

describe('ToggleSwitch', () => {
  it('can be tested', () => {
    expect(ToggleSwitch).toBeDefined();
  });
});
