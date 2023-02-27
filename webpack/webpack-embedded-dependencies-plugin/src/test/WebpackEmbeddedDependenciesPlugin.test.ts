import path from 'path';
import { createFsFromVolume, IFs, Volume } from 'memfs';
import EmbeddedDependenciesWebpackPlugin from '../';

import { LICENSE_FILES_REGEXP, COPYRIGHT_REGEX } from '../regexpUtils';

import { Testing } from '@rushstack/webpack-plugin-utilities';
import { FileSystem } from '@rushstack/node-core-library';

const TESTS_FOLDER_PATH: string = path.resolve(path.join(process.cwd(), 'src', 'test'));
const FIXTURES_FOLDER_PATH: string = path.resolve(TESTS_FOLDER_PATH, 'fixtures');
const FAKE_NODE_MODULES_FOLDER_PATH: string = path.resolve(path.join(TESTS_FOLDER_PATH, 'node_modules'));
const VIRTUAL_FILE_SYSTEM_OUTPUT_PATH: string = path.join(
  process.cwd(),
  '../',
  'webpack-embedded-dependencies-plugin',
  'dist'
);
const fixtures: string[] = FileSystem.readFolderItemNames(FIXTURES_FOLDER_PATH);

const defaultConfigurationWithPlugin = {
  context: TESTS_FOLDER_PATH,
  plugins: [new EmbeddedDependenciesWebpackPlugin()]
};

const defaultConfigurationCustomOutputFileName = {
  context: TESTS_FOLDER_PATH,
  plugins: [new EmbeddedDependenciesWebpackPlugin({ outputFileName: 'custom-file-name.json' })]
};

const configurationWithLicenseFileGenerated = {
  context: TESTS_FOLDER_PATH,
  plugins: [new EmbeddedDependenciesWebpackPlugin({ generateLicenseFile: true })]
};

const configurationWithLicenseFileGeneratedAndCustomPackageFilter = {
  context: TESTS_FOLDER_PATH,
  plugins: [
    new EmbeddedDependenciesWebpackPlugin({
      generateLicenseFile: true,
      packageFilterPredicate: (packageJson, filePath) => {
        return !filePath.includes('@rushstack/tree-pattern');
      }
    })
  ]
};

describe('COPYRIGHT_REGEX', () => {
  it('should extract the right copyright from apache 2.0 license', () => {
    const license = FileSystem.readFile(
      path.join(FAKE_NODE_MODULES_FOLDER_PATH, 'fake-package-apache-with-copyleft-dep', 'LICENSE.txt')
    );
    const match = license.match(COPYRIGHT_REGEX);

    expect(match).toBeDefined();
    expect(match?.[0]).toBe('Copyright 2023 Fake Package Apache License w/ AGPL Transitive');
  });

  it('should extract the right copyright from mit license', () => {
    const license = FileSystem.readFile(
      path.join(FAKE_NODE_MODULES_FOLDER_PATH, 'fake-package-mit-license', 'LICENSE-MIT.txt')
    );
    const match = license.match(COPYRIGHT_REGEX);

    expect(match).toBeDefined();
    expect(match?.[0]).toBe('Copyright © 2023 FAKE-PACKAGE-MIT-LICENSE');
  });

  it('should extract the right copyright from agpl license', () => {
    const license = FileSystem.readFile(
      path.join(FAKE_NODE_MODULES_FOLDER_PATH, 'fake-package-agpl-license', 'LICENSE')
    );
    const match = license.match(COPYRIGHT_REGEX);

    expect(match).toBeDefined();
    expect(match?.[0]).toBe('Copyright (C) 2007 Free Software Foundation, Inc. <https://fsf.org/>');
  });

  it('should extract the right copyright from agpl license', () => {
    const license = FileSystem.readFile(
      path.join(FAKE_NODE_MODULES_FOLDER_PATH, 'fake-package-copyleft-license', 'license')
    );
    const match = license.match(COPYRIGHT_REGEX);

    expect(match).toBeDefined();
    expect(match?.[0]).toBe('Copyright (C) 2007 Free Software Foundation, Inc. <https://fsf.org/>');
  });
});

describe('LICENSE_FILES_REGEXP', () => {
  for (const filename of ['LICENSE', 'LICENSE-MIT.txt', 'LICENSE.md', 'LICENSE.txt', 'license']) {
    it(`should match ${filename}`, () => {
      expect(LICENSE_FILES_REGEXP.test(filename)).toBe(true);
    });
  }
});

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

    it('should generate a tertiary asset if generating a license file', async () => {
      const stats = await Testing.getTestingWebpackCompiler(
        `./fixtures/${fixture}/src`,
        configurationWithLicenseFileGenerated
      );
      const embeddedDepAsset = stats
        ?.toJson({ all: false, assets: true })
        .assets?.some((asset) => asset.name === 'THIRD-PARTY-NOTICES.html');

      // No dependencies fixture should not generate a license file
      // and emit a warning so we'll exclude it here, but also should test separately
      if (fixture !== 'no-dependencies') {
        expect(embeddedDepAsset).toBe(true);
      }
    });
  });

  const virtualFileSystem: IFs = createFsFromVolume(new Volume());

  switch (fixture) {
    case 'dependencies-with-copyleft-licenses':
      break;
    case 'dependencies-with-licenses':
      break;
    case 'dependencies-with-transient-copyleft-license':
      it('should have three files created when using the generator from the entire build with correct default names', async () => {
        // For this test we'll create the virtual file system and pass it to the Testing.getTestingWebpackCompiler
        // beacuse we want to reuse it to verify the files generated by the plugin

        await Testing.getTestingWebpackCompiler(
          `./fixtures/${fixture}/src`,
          configurationWithLicenseFileGenerated,
          virtualFileSystem
        );

        // get files generated from the plugin in the virtual file system
        const files = virtualFileSystem.readdirSync(VIRTUAL_FILE_SYSTEM_OUTPUT_PATH);

        expect(files).toBeDefined();
        expect(files.length).toBe(3);
        // verify the name of each file is correct
        expect(files).toContain('embedded-dependencies.json');
        expect(files).toContain('THIRD-PARTY-NOTICES.html');
        expect(files).toContain('test-bundle.js');

        for (const file of files) {
          const fileContent = virtualFileSystem.readFileSync(
            path.join(VIRTUAL_FILE_SYSTEM_OUTPUT_PATH, file.toString()),
            {
              encoding: 'utf8'
            }
          );

          expect(fileContent).toBeDefined();
        }
      });
      break;
    case 'no-dependencies':
      it('should not emit a warning if there are no third party deps but license generation is set to true', async () => {
        const stats = await Testing.getTestingWebpackCompiler(
          `./fixtures/${fixture}/src`,
          configurationWithLicenseFileGenerated
        );

        const warnings = stats?.toJson({ all: false, warnings: true }).warnings;

        expect(warnings).toBeDefined();
        expect(warnings?.length).toBe(0);
      });

      break;

    case 'depednencies-with-workspace-dependencies':
      it('should filter out specific packages using a package filter function option', async () => {
        // For this test we'll create the virtual file system and pass it to the Testing.getTestingWebpackCompiler
        // beacuse we want to reuse it to verify the files generated by the plugin

        await Testing.getTestingWebpackCompiler(
          `./fixtures/${fixture}/src`,
          configurationWithLicenseFileGeneratedAndCustomPackageFilter,
          virtualFileSystem
        );

        // get files generated from the plugin in the virtual file system
        const files = virtualFileSystem.readdirSync(VIRTUAL_FILE_SYSTEM_OUTPUT_PATH);

        expect(files).toBeDefined();
        expect(files.length).toBe(3);
        // verify the name of each file is correct
        expect(files).toContain('embedded-dependencies.json');
        expect(files).toContain('THIRD-PARTY-NOTICES.html');
        expect(files).toContain('test-bundle.js');

        for (const file of files) {
          const fileContent = virtualFileSystem.readFileSync(
            path.join(VIRTUAL_FILE_SYSTEM_OUTPUT_PATH, file.toString()),
            {
              encoding: 'utf8'
            }
          );

          if (file.toString() === 'embedded-dependencies.json') {
            const { embeddedDependencies } = JSON.parse(fileContent.toString());
            // make sure tree-pattern isn't in the embedded dependencies
            expect(embeddedDependencies[0].name).not.toBe('tree-pattern');
            expect(embeddedDependencies).toBeDefined();
          }

          expect(fileContent).toBeDefined();
        }
      });

      break;
    default:
      break;
  }
}
