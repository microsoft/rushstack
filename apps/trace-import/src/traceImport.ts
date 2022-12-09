// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, IPackageJson, JsonFile } from '@rushstack/node-core-library';
import colors from 'colors';
import * as path from 'path';
import * as process from 'process';

import * as Resolve from 'resolve';

export type ResolutionType = 'cjs' | 'es' | 'ts';

interface IExecuteOptions {
  importPath: string;
  baseFolder: string | undefined;
  resolutionType: ResolutionType;
}

// Somewhat loosely matches inputs such as:
//   my-package/path/to/file.js
//   [group 1 ][group 2       ]
//
//   @scope/my-package/path/to/file.js
//   [group 1        ][group 2       ]
//
//   @scope/my-package
//   [group 1        ]
const packageImportPathRegExp: RegExp = /^((?:@[a-z0-9\-_\.]+\/)?[a-z0-9\-_\.]+)(\/.*)?$/i;

function logInputField(title: string, value: string): void {
  console.log(colors.cyan(title.padEnd(25)) + value);
}
function logOutputField(title: string, value: string): void {
  console.log(colors.green(title.padEnd(25)) + value);
}

export function traceImport(options: IExecuteOptions): void {
  let baseFolder: string;
  if (options.baseFolder) {
    baseFolder = path.resolve(options.baseFolder);
  } else {
    baseFolder = process.cwd();
  }

  const importFullPath: string = options.importPath.trim();
  if (!importFullPath) {
    throw new Error(`Invalid import path syntax: ${JSON.stringify(importFullPath)}`);
  }
  const match: RegExpExecArray | null = packageImportPathRegExp.exec(importFullPath);

  logInputField('Base folder:', baseFolder);

  if (match) {
    const importPackageName: string = match[1];
    const importRemainder: string | undefined = match[2];
    const importRemainderWithoutSlash: string | undefined = importRemainder
      ? importRemainder.substring(1)
      : undefined;

    logInputField('Package name:', importPackageName);
    logInputField('Module path:', importRemainderWithoutSlash || '(none)');

    // Resolve the NPM package first
    let resolvedPackageFolder: string;
    try {
      const resolvedPackageJsonPath: string = Resolve.sync(importPackageName, {
        basedir: baseFolder,
        preserveSymlinks: false,
        packageFilter: (pkg: Resolve.PackageJSON, pkgFile: string, dir: string): Resolve.PackageJSON => {
          // Hardwire "main" to point to a file that is guaranteed to exist.
          // This helps resolve packages such as @types/node that have no entry point.
          // And then we can use path.dirname() below to locate the package folder,
          // even if the real entry point was in an subfolder with arbitrary nesting.
          pkg.main = 'package.json';
          return pkg;
        }
      });
      resolvedPackageFolder = path.dirname(resolvedPackageJsonPath);
    } catch (e) {
      throw new Error(`Cannot find package "${importPackageName}" from "${baseFolder}".`);
    }
    console.log('\nResolving...\n');
    logOutputField('Package folder:', resolvedPackageFolder);

    const packageJson: IPackageJson = JsonFile.load(path.join(resolvedPackageFolder, 'package.json'));
    logOutputField(
      'package.json:',
      `${packageJson.name || '(missing name)'} (${packageJson.version || 'missing version'})`
    );

    const jsExtensions: string[] = ['.js', '.cjs', '.jsx', '.json'];

    switch (options.resolutionType) {
      case 'cjs':
        {
          if (!importRemainder) {
            if (packageJson.main) {
              logOutputField('Default entry point:', `"main"=${JSON.stringify(packageJson.main)}`);
            } else {
              logOutputField('Default entry point:', '(none)');
            }
          }

          let targetPath: string;
          try {
            targetPath = Resolve.sync(importFullPath, {
              basedir: resolvedPackageFolder,
              preserveSymlinks: false,
              extensions: jsExtensions
            });
          } catch (error) {
            // Are we importing the default entry point?
            if (importRemainder) {
              throw new Error(`Unable to resolve remainder of import path: ...${importRemainder}`);
            } else {
              console.log('\nThis package does not define a default entry point.');
              return;
            }
          }
          console.log();
          logOutputField('Target path:', targetPath);
        }
        break;
      case 'ts':
        {
          // Are we importing the default entry point?
          if (!importRemainder) {
            if (packageJson.types) {
              logOutputField('Default entry point:', `"types"=${JSON.stringify(packageJson.types)}`);
              console.log();
              logOutputField('Target path:', path.join(resolvedPackageFolder, packageJson.types));
            } else if (packageJson.typings) {
              logOutputField('Default entry point:', `"typings"=${JSON.stringify(packageJson.typings)}`);
              console.log();
              logOutputField('Target path:', path.join(resolvedPackageFolder, packageJson.typings));
            } else {
              let cjsTargetPath: string;
              try {
                cjsTargetPath = Resolve.sync(importPackageName, {
                  basedir: resolvedPackageFolder,
                  preserveSymlinks: false
                });
              } catch (error) {
                console.log('\nThis package does not define a default CommonJS entry point.');
                return;
              }
              // Try to replace the file extension
              const parsedPath: path.ParsedPath = path.parse(cjsTargetPath);
              const dtsTargetPath: string = parsedPath.dir + parsedPath.base + '.d.ts';
              if (!FileSystem.exists(dtsTargetPath)) {
                throw new Error(
                  'Unable to find a .d.ts file corresponding to the CommonJS entry point: ' + cjsTargetPath
                );
              }
              logOutputField('Default entry point:', '(inferred from .js entry point)');
              console.log();
              logOutputField('Target path:', dtsTargetPath);
            }
            return;
          }

          let targetPath: string;
          try {
            targetPath = Resolve.sync(importFullPath, {
              basedir: resolvedPackageFolder,
              preserveSymlinks: false,
              extensions: ['.d.ts', '.ts', '.tsx', ...jsExtensions]
            });
          } catch (error) {
            throw new Error(`Unable to resolve remainder of import path: ...${importRemainder}`);
          }
          console.log();
          logOutputField('Target path:', targetPath);
        }
        break;
      default:
        throw new Error(`The "${options.resolutionType}" resolution type is not implemented yet`);
    }
  } else {
    console.log(`The import path does not appear to reference an NPM package.\n`);
    logOutputField('Module path:', importFullPath);
  }
}
