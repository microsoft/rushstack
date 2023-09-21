// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CustomTipsConfiguration } from '../CustomTipsConfiguration';
import { RushConfiguration } from '../RushConfiguration';

describe(CustomTipsConfiguration.name, () => {
  it('loads the config file (custom-tips.json)', () => {
    const rushFilename: string = `${__dirname}/repo/rush-npm.json`;
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);
    expect(rushConfiguration.customTipsConfiguration.providedCustomTipsByTipId).toMatchSnapshot();
  });

  it('reports an error for duplicate tips', () => {
    expect(() => {
      new CustomTipsConfiguration(`${__dirname}/jsonFiles/custom-tips.error.json`);
    }).toThrowError('TIP_RUSH_INCONSISTENT_VERSIONS');
  });
});
