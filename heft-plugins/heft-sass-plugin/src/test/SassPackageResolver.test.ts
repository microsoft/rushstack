// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FileSystem, JsonFile } from '@rushstack/node-core-library';
import { compileStringAsync, NodePackageImporter, type CompileResult } from 'sass-embedded';
import type { PathConditions } from 'resolve-pkg-maps';

import { resolveSassPackageExportsAsync, type ISassPackageExport } from '../SassPackageResolver';

const fixtureFolder: string = path.resolve(__dirname, '../../src/test/fixtures/package-exports');
const packageFolder: string = `${fixtureFolder}/node_modules/@test/exported-styles`;

interface IResolutionTestCase {
  name: string;
  exports: PathConditions;
  subpath?: string;
  expectedFile?: string;
}

describe(resolveSassPackageExportsAsync.name, () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const testCases: IResolutionTestCase[] = [
    {
      name: 'string root export',
      exports: './styles/_tokens.scss',
      expectedFile: 'styles/_tokens.scss'
    },
    {
      name: 'conditional root export',
      exports: { sass: './styles/_tokens.scss', default: './index.js' },
      expectedFile: 'styles/_tokens.scss'
    },
    {
      name: 'root fallback array',
      exports: { '.': ['./styles/_tokens.scss', './styles/other.scss'] },
      expectedFile: 'styles/_tokens.scss'
    },
    {
      name: 'manifest condition order',
      exports: { '.': { style: './styles/other.scss', sass: './styles/_tokens.scss' } },
      expectedFile: 'styles/other.scss'
    },
    {
      name: 'JavaScript conditions are skipped',
      exports: { '.': { import: './index.js', require: './index.js', sass: './styles/_tokens.scss' } },
      expectedFile: 'styles/_tokens.scss'
    },
    {
      name: 'default stylesheet condition',
      exports: { '.': { default: './styles/plain.css' } },
      expectedFile: 'styles/plain.css'
    },
    {
      name: 'indented Sass target',
      exports: { '.': { sass: './styles/indented.sass' } },
      expectedFile: 'styles/indented.sass'
    },
    {
      name: 'extensionless subpath',
      exports: { './tokens.scss': './styles/_tokens.scss' },
      subpath: 'tokens',
      expectedFile: 'styles/_tokens.scss'
    },
    {
      name: 'partial subpath',
      exports: { './_tokens.scss': './styles/_tokens.scss' },
      subpath: 'tokens',
      expectedFile: 'styles/_tokens.scss'
    },
    {
      name: 'index subpath',
      exports: { './theme/index.scss': './styles/_tokens.scss' },
      subpath: 'theme',
      expectedFile: 'styles/_tokens.scss'
    },
    {
      name: 'partial index subpath',
      exports: { './theme/_index.scss': './styles/_tokens.scss' },
      subpath: 'theme',
      expectedFile: 'styles/_tokens.scss'
    },
    {
      name: 'root index fallback',
      exports: { './_index.scss': './_index.scss' },
      expectedFile: '_index.scss'
    },
    {
      name: 'explicit extension prevents index fallback',
      exports: { './theme.scss/index.scss': './styles/_tokens.scss' },
      subpath: 'theme.scss'
    },
    {
      name: 'missing export',
      exports: { './other': './styles/other.scss' },
      subpath: 'tokens'
    },
    {
      name: 'null export',
      exports: { './tokens': null },
      subpath: 'tokens'
    },
    {
      name: 'no Sass condition',
      exports: { '.': { import: './index.js' } }
    },
    {
      name: 'URL-encoded target',
      exports: { '.': './styles/_spaced%20tokens.scss' },
      expectedFile: 'styles/_spaced tokens.scss'
    },
    {
      name: 'wildcard partial',
      exports: { './theme/*.scss': './styles/*.scss' },
      subpath: 'theme/tokens',
      expectedFile: 'styles/_tokens.scss'
    },
    {
      name: 'wildcard fallback array',
      exports: { './theme/*.scss': ['./missing/*.scss', './styles/*.scss'] },
      subpath: 'theme/tokens',
      expectedFile: 'styles/_tokens.scss'
    },
    {
      name: 'exact mapping beats a wildcard',
      exports: { './theme/*': './styles/*', './theme/_tokens.scss': './styles/other.scss' },
      subpath: 'theme/_tokens.scss',
      expectedFile: 'styles/other.scss'
    },
    {
      name: 'longer wildcard prefix wins',
      exports: { './*': './missing/*', './theme/*.scss': './styles/*.scss' },
      subpath: 'theme/_tokens.scss',
      expectedFile: 'styles/_tokens.scss'
    },
    {
      name: 'missing wildcard target',
      exports: { './theme/*.scss': './missing/*.scss' },
      subpath: 'theme/tokens'
    }
  ];

  it.each(testCases)('resolves $name', async ({ exports, subpath = '', expectedFile }) => {
    const result: ISassPackageExport | undefined = await resolveSassPackageExportsAsync(
      packageFolder,
      subpath,
      exports
    );
    expect(result?.filePath).toBe(expectedFile ? path.resolve(packageFolder, expectedFile) : undefined);
  });

  it('returns contents already read when resolving a wildcard', async () => {
    const result: ISassPackageExport | undefined = await resolveSassPackageExportsAsync(
      packageFolder,
      'theme/tokens',
      { './theme/*.scss': './styles/*.scss' }
    );

    expect(result?.contents?.toString()).toBe(
      await FileSystem.readFileAsync(`${packageFolder}/styles/_tokens.scss`)
    );
  });

  it('defers reading exact targets to the importer, even if they do not exist', async () => {
    const readSpy: jest.SpyInstance = jest.spyOn(FileSystem, 'readFileToBufferAsync');
    const result: ISassPackageExport | undefined = await resolveSassPackageExportsAsync(packageFolder, '', {
      '.': './styles/missing.scss'
    });

    expect(result?.filePath).toBe(path.resolve(packageFolder, 'styles/missing.scss'));
    expect(readSpy).not.toHaveBeenCalled();
  });

  it('propagates wildcard read errors other than missing files', async () => {
    const error: NodeJS.ErrnoException = Object.assign(new Error('Access denied'), {
      code: 'EACCES',
      errno: -13,
      syscall: 'open'
    });
    jest.spyOn(FileSystem, 'readFileToBufferAsync').mockRejectedValue(error);

    await expect(
      resolveSassPackageExportsAsync(packageFolder, 'theme/tokens', {
        './theme/*.scss': './styles/*.scss'
      })
    ).rejects.toBe(error);
  });

  it('reports ambiguous extensionless exports', async () => {
    await expect(
      resolveSassPackageExportsAsync(packageFolder, 'tokens', {
        './tokens.scss': './styles/_tokens.scss',
        './tokens.sass': './styles/indented.sass'
      })
    ).rejects.toThrow('Ambiguous Sass exports');
  });

  it.each(['./index.js', './styles/tokens'])('rejects non-stylesheet target %s', async (target) => {
    await expect(resolveSassPackageExportsAsync(packageFolder, '', { '.': target })).rejects.toThrow(
      'not a .scss, .sass, or .css file'
    );
  });

  it('does not hide malformed export maps', async () => {
    await expect(
      resolveSassPackageExportsAsync(packageFolder, '', {
        '.': './styles/_tokens.scss',
        sass: './styles/other.scss'
      })
    ).rejects.toThrow('"exports" cannot contain');
  });

  it('rejects targets outside the package root', async () => {
    await expect(
      resolveSassPackageExportsAsync(packageFolder, '', { '.': '../outside.scss' })
    ).rejects.toThrow('Invalid "exports" target');
  });

  it.each(['', 'theme/tokens', 'fallback/tokens'])(
    'agrees with Sass NodePackageImporter for subpath %j',
    async (subpath) => {
      const { exports }: { exports: PathConditions } = await JsonFile.loadAsync(
        `${packageFolder}/package.json`
      );
      const result: ISassPackageExport | undefined = await resolveSassPackageExportsAsync(
        packageFolder,
        subpath,
        exports
      );
      if (!result) {
        throw new Error(`Expected a Sass export for "${subpath || '.'}".`);
      }

      const specifier: string = `pkg:@test/exported-styles${subpath ? `/${subpath}` : ''}`;
      const compiled: CompileResult = await compileStringAsync(
        `@use "${specifier}" as tokens; .root { color: tokens.$brand; }`,
        { importers: [new NodePackageImporter(fixtureFolder)] }
      );

      expect(compiled.loadedUrls.map((url) => path.relative(result.filePath, fileURLToPath(url)))).toContain(
        ''
      );
      expect(compiled.css).toContain('#123456');
    }
  );
});
