// <reference types='mocha' />

import { expect } from 'chai';
import * as path from 'path';
import RushConfiguration from '../RushConfiguration';

describe('RushHooks', () => {
  it('loads post command hooks from rush.json', () => {
    const rushFilename: string = path.resolve(__dirname, 'repo', 'rush.json');
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);
    console.log('here is ' + rushConfiguration.rushHooks.postCommandHooks[0]);
    expect(rushConfiguration.rushHooks.postCommandHooks).to.eql(['do something'],
      'Failed to get correct post command hooks script');
  });

  it('loads when there is no rush hooks in rush.json', () => {
    const rushFilename: string = path.resolve(__dirname, 'repo1', 'rush.json');
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);
    expect(rushConfiguration.rushHooks).to.be.undefined;
  });
});