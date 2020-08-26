// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as nodeJsPath from 'path';
import { Import } from '../Import';
import { PackageJsonLookup } from '../PackageJsonLookup';

describe('Import', () => {
  describe('resolve', () => {
    const pacakgeRoot: string = PackageJsonLookup.instance.tryGetPackageFolderFor(__dirname)!;

    it('returns an absolute path as-is', () => {
      const absolutePaths: string[] = ['C:\\test\\path', '/var/test/path'];

      for (const absolutePath of absolutePaths) {
        expect(Import.resolve({ resolvePath: absolutePath, baseFolderPath: __dirname })).toEqual(
          absolutePath
        );
      }
    });

    it('resolves a relative path', () => {
      expect(Import.resolve({ resolvePath: './baz', baseFolderPath: __dirname })).toEqual(
        nodeJsPath.join(__dirname, 'baz')
      );
      expect(Import.resolve({ resolvePath: '../baz', baseFolderPath: __dirname })).toEqual(
        nodeJsPath.resolve(__dirname, '..', 'baz')
      );
      expect(Import.resolve({ resolvePath: './baz/ban', baseFolderPath: __dirname })).toEqual(
        nodeJsPath.join(__dirname, 'baz', 'ban')
      );
      expect(Import.resolve({ resolvePath: '../baz/ban', baseFolderPath: __dirname })).toEqual(
        nodeJsPath.resolve(__dirname, '..', 'baz', 'ban')
      );
    });

    it('resolves a dependency', () => {
      expect(
        Import.resolve({ resolvePath: '@rushstack/heft', baseFolderPath: __dirname }).replace(/\\/g, '/')
      ).toMatch(/node_modules\/@rushstack\/heft$/);
    });

    it('resolves a path inside a dependency', () => {
      expect(
        Import.resolve({ resolvePath: '@rushstack/heft/lib/start.js', baseFolderPath: __dirname }).replace(
          /\\/g,
          '/'
        )
      ).toMatch(/node_modules\/@rushstack\/heft\/lib\/start\.js$/);
    });

    it('resolves a dependency of a dependency', () => {
      expect(
        Import.resolve({
          resolvePath: '@rushstack/ts-command-line',
          baseFolderPath: nodeJsPath.join(pacakgeRoot, 'node_modules', '@rushstack', 'heft')
        }).replace(/\\/g, '/')
      ).toMatch(/node_modules\/@rushstack\/ts-command-line$/);
    });

    it('resolves a path inside a dependency of a dependency', () => {
      expect(
        Import.resolve({
          resolvePath: '@rushstack/ts-command-line/lib/index.js',
          baseFolderPath: nodeJsPath.join(pacakgeRoot, 'node_modules', '@rushstack', 'heft')
        }).replace(/\\/g, '/')
      ).toMatch(/node_modules\/@rushstack\/ts-command-line\/lib\/index\.js$/);
    });

    describe('allowSelfReference', () => {
      it('resolves a path inside this package with allowSelfReference turned on', () => {
        expect(
          Import.resolve({
            resolvePath: '@rushstack/node-core-library',
            baseFolderPath: __dirname,
            allowSelfReference: true
          })
        ).toEqual(pacakgeRoot);
        expect(
          Import.resolve({
            resolvePath: '@rushstack/node-core-library/foo/bar',
            baseFolderPath: __dirname,
            allowSelfReference: true
          })
        ).toEqual(nodeJsPath.join(pacakgeRoot, 'foo', 'bar'));
      });

      it('throws on an attempt to reference this package without allowSelfReference turned on', () => {
        expect(() =>
          Import.resolve({
            resolvePath: '@rushstack/node-core-library',
            baseFolderPath: __dirname
          })
        ).toThrowError(/^Cannot find module "@rushstack\/node-core-library" from ".+"\.$/);
        expect(() =>
          Import.resolve({
            resolvePath: '@rushstack/node-core-library/foo/bar',
            baseFolderPath: __dirname
          })
        ).toThrowError(/^Cannot find module "@rushstack\/node-core-library" from ".+"\.$/);
      });
    });

    describe('includeSystemModules', () => {
      it('resolves a system module with includeSystemModules turned on', () => {
        expect(
          Import.resolve({ resolvePath: 'http', baseFolderPath: __dirname, includeSystemModules: true })
        ).toEqual('http');
      });

      it('throws on an attempt to resolve a system module without includeSystemModules turned on', () => {
        expect(() => Import.resolve({ resolvePath: 'http', baseFolderPath: __dirname })).toThrowError(
          /^Cannot find module "http" from ".+"\.$/
        );
      });

      it('throws on an attempt to resolve a path inside a system module with includeSystemModules turned on', () => {
        expect(() =>
          Import.resolve({
            resolvePath: 'http/foo/bar',
            baseFolderPath: __dirname,
            includeSystemModules: true
          })
        ).toThrowError(
          /^The package name "http" resolved to a NodeJS system module, but the path to resolve \("http\/foo\/bar"\) contains a path inside the system module, which is not allowed\.$/
        );
      });
    });
  });
});
