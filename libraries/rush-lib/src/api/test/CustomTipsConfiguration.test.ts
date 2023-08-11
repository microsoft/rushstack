import { CustomTipsConfiguration } from '../CustomTipsConfiguration';
import { RushConfiguration } from '../RushConfiguration';

describe(CustomTipsConfiguration.name, () => {
  it('loads the config file (rush-custom-tips.json)', () => {
    const rushFilename: string = `${__dirname}/repo/rush-npm.json`;
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);
    expect(rushConfiguration.customTipsConfiguration.configuration.customTips?.length).toBe(1);
  });
});
