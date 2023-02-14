import path from 'path';
import EmbeddedDependenciesWebpackPlugin from '../';
import { Testing } from '@rushstack/webpack-plugin-utilities';
import { FileSystem } from '@rushstack/node-core-library';

const TESTS_FOLDER_PATH: string = path.resolve(path.join(process.cwd(), 'src', 'test'));
const FIXTURES_FOLDER_PATH: string = path.resolve(path.join(TESTS_FOLDER_PATH, 'fixtures'));

const fixtures: string[] = FileSystem.readFolderItemNames(FIXTURES_FOLDER_PATH);

console.log(fixtures);

const defaultConfigurationWithPlugin = {
  context: TESTS_FOLDER_PATH,
  plugins: [new EmbeddedDependenciesWebpackPlugin()]
};

const defaultConfigurationCustomOutputFileName = {
  context: TESTS_FOLDER_PATH,
  plugins: [new EmbeddedDependenciesWebpackPlugin({ outputFileName: 'custom-file-name.json' })]
};

for (const fixture of fixtures) {
  describe('WebpackEmbeddedDependenciesPlugin', () => {
    it('should run', async () => {
      const stats = await Testing.getTestingWebpackCompiler(
        `./fixtures/${fixture}/src`,
        defaultConfigurationWithPlugin
      );

      expect(stats).toBeDefined();
    });

    it('should generate a secondary asset with the correct default name', async () => {
      const stats = await Testing.getTestingWebpackCompiler(
        `./fixtures/${fixture}/src`,
        defaultConfigurationWithPlugin
      );
      const embeddedDepAsset = stats
        ?.toJson({ all: false, assets: true })
        .assets?.some((asset) => asset.name === 'embedded-dependencies.json');

      expect(embeddedDepAsset).toBe(true);
    });

    it('should generate a secondary asset with a custom outputFileName', async () => {
      const stats = await Testing.getTestingWebpackCompiler(
        `./fixtures/${fixture}/src`,
        defaultConfigurationCustomOutputFileName
      );
      const embeddedDepAsset = stats
        ?.toJson({ all: false, assets: true })
        .assets?.some((asset) => asset.name === 'custom-file-name.json');

      expect(embeddedDepAsset).toBe(true);
    });
  });

  switch (fixture) {
    case 'dependencies-with-copyleft-licenses':
      break;
    case 'dependencies-with-licenses':
      break;
    case 'dependencies-with-transient-copyleft-license':
      break;
    case 'no-dependencies':
      break;
    default:
      break;
  }
}
