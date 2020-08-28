// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as sinon from 'sinon';
import * as path from 'path';
import { assert } from 'chai';

import { MinimalRushConfiguration } from '../MinimalRushConfiguration';

describe('MinimalRushConfiguration', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('legacy rush config', () => {
    beforeEach(() => {
      sandbox.stub(process, 'cwd', () => path.join(__dirname, 'sandbox', 'legacy-repo', 'project'));
    });

    it('correctly loads the rush.json file', () => {
      const config: MinimalRushConfiguration = MinimalRushConfiguration.loadFromDefaultLocation() as MinimalRushConfiguration;
      assert.equal(config.rushVersion, '2.5.0');
    });
  });

  describe('non-legacy rush config', () => {
    beforeEach(() => {
      sandbox.stub(process, 'cwd', () => path.join(__dirname, 'sandbox', 'repo', 'project'));
    });

    it('correctly loads the rush.json file', () => {
      const config: MinimalRushConfiguration = MinimalRushConfiguration.loadFromDefaultLocation() as MinimalRushConfiguration;
      assert.equal(config.rushVersion, '4.0.0');
    });
  });
});
