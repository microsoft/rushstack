import { CustomTipsConfiguration } from '../CustomTipsConfiguration';
import { RushConfiguration } from '../RushConfiguration';

describe(CustomTipsConfiguration.name, () => {
  it('loads the config file (custom-tips.json)', () => {
    const rushFilename: string = `${__dirname}/repo/rush-npm.json`;
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);
    expect(rushConfiguration.customTipsConfiguration.configuration.customTips?.length).toBe(1);
  });

  it('reports an error for duplicate tips', () => {
    expect(() => {
      new CustomTipsConfiguration(`${__dirname}/jsonFiles/custom-tips.error.json`);
    }).toThrowError('TIP_RUSH_INCONSISTENT_VERSIONS');
  });
});
