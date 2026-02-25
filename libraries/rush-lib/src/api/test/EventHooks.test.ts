// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfiguration } from '../RushConfiguration.ts';
import { Event, EventHooks } from '../EventHooks.ts';

describe(EventHooks.name, () => {
  it('loads a post build hook from rush.json', () => {
    const rushFilename: string = `${__dirname}/repo/rush-npm.json`;
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);
    expect(rushConfiguration.eventHooks.get(Event.postRushBuild)).toEqual(['do something']);
  });

  it('loads empty rush hooks', () => {
    const eventHooks: EventHooks = new EventHooks({});
    expect(eventHooks.get(Event.postRushBuild)).toHaveLength(0);
  });

  it('loads two rush hooks', () => {
    const expectedHooks: string[] = ['do one', 'do two'];
    const eventHooks: EventHooks = new EventHooks({
      postRushBuild: expectedHooks
    });
    const resultHooks: string[] = eventHooks.get(Event.postRushBuild);
    expect(resultHooks).toEqual(expectedHooks);
  });
});
