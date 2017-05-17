// <reference types='mocha' />

import { assert } from 'chai';
import * as path from 'path';
import RushConfiguration from '../RushConfiguration';
import { RushHookName, default as RushHooks } from '../RushHooks';

describe('RushHooks', () => {
  it('loads post command hooks from rush.json', () => {
    const rushFilename: string = path.resolve(__dirname, 'repo', 'rush.json');
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);
    assert.deepEqual(rushConfiguration.rushHooks.get(RushHookName.postBuild), ['do something'],
      'Failed to get correct post command hooks script');
  });

  it('loads empty rush hooks', () => {
    const rushHooks: RushHooks = new RushHooks({});
    assert.equal(rushHooks.get(RushHookName.postBuild).length, 0);
  });

  it('loads two rush hooks', () => {
    const expectedHooks: string[] = [
        'do one',
        'do two'
      ];
    const rushHooks: RushHooks = new RushHooks({
      postBuild: expectedHooks
    });
    const resultHooks: string[] = rushHooks.get(RushHookName.postBuild);
    assert.deepEqual(resultHooks, expectedHooks);
  });

});