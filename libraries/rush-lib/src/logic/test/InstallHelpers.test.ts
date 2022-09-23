import { InstallHelpers } from '../installManager/InstallHelpers';
import { RushConfiguration } from '../../api/RushConfiguration';
import { IPackageJson, JsonFile } from '@rushstack/node-core-library';

describe('InstallHelpers', () => {
  describe('generateCommonPackageJson', () => {
    const originalJsonFileSave = JsonFile.save;
    const mockJsonFileSave: jest.Mock = jest.fn();
    beforeAll(() => {
      JsonFile.save = mockJsonFileSave;
    });
    afterEach(() => {
      mockJsonFileSave.mockClear();
    });
    afterAll(() => {
      JsonFile.save = originalJsonFileSave;
    });

    it('generates correct package json with pnpm configurations', () => {
      const RUSH_JSON_FILENAME: string = `${__dirname}/pnpmConfig/rush.json`;
      const rushConfiguration: RushConfiguration =
        RushConfiguration.loadFromConfigurationFile(RUSH_JSON_FILENAME);
      InstallHelpers.generateCommonPackageJson(rushConfiguration);
      const packageJson: IPackageJson = mockJsonFileSave.mock.calls[0][0];
      expect(packageJson).toEqual(
        expect.objectContaining({
          pnpm: {
            overrides: {
              foo: '^2.0.0', // <-- unsupportedPackageJsonSettings.pnpm.override.foo
              quux: 'npm:@myorg/quux@^1.0.0',
              'bar@^2.1.0': '3.0.0',
              'qar@1>zoo': '2'
            },
            packageExtensions: {
              'react-redux': {
                peerDependencies: {
                  'react-dom': '*'
                }
              }
            },
            neverBuiltDependencies: ['fsevents', 'level'],
            pnpmFutureFeature: true
          }
        })
      );
    });
  });
});
