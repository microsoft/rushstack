// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// <reference types='mocha' />

import { assert } from 'chai';
import * as path from 'path';
import { RushConfiguration } from '../RushConfiguration';
import { Event, EventHooks } from '../EventHooks';

describe('EventHooks', () => {
  it('loads a post build hook from rush.json', () => {
    const rushFilename: string = path.resolve(__dirname, 'repo', 'rush-npm.json');
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);
    assert.deepEqual(rushConfiguration.eventHooks.get(Event.postRushBuild), ['do something'],
      'Failed to get the correct post rush build hook');
  });

  it('loads empty rush hooks', () => {
    const eventHooks: EventHooks = new EventHooks({});
    assert.equal(eventHooks.get(Event.postRushBuild).length, 0);
  });

  it('loads two rush hooks', () => {
    const expectedHooks: string[] = [
        'do one',
        'do two'
      ];
    const eventHooks: EventHooks = new EventHooks({
      postRushBuild: expectedHooks
    });
    const resultHooks: string[] = eventHooks.get(Event.postRushBuild);
    assert.deepEqual(resultHooks, expectedHooks);
  });

});