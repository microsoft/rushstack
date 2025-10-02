// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import * as process from 'node:process';

import * as Resolve from 'resolve';

import { Colorize } from '@rushstack/terminal';
import {
  FileSystem,
  type IPackageJson,
  type IParsedPackageName,
  JsonFile,
  PackageName
} from '@rushstack/node-core-library';

const jsExtensions: string[] = ['.js', '.cjs', '.jsx', '.json'];
const tsExtensions: string[] = ['.d.ts', '.ts', '.tsx', '.json'];

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
const packageImportPathRegExp: RegExp = /^((?:@[a-z0-9_][a-z0-9\-_\.]*\/)?[a-z0-9_][a-z0-9\-_\.]*)(\/.*)?$/i;

function logInputField(title: string, value: string): void {
  console.log(Colorize.cyan(title.padEnd(25)) + value);
}

function logOutputField(title: string, value: string): void {
  console.log(Colorize.green(title.padEnd(25)) + value);
}

function traceTypeScriptPackage(options: {
  packageSubpath: string;
  packageFolder: string;
  packageJson: IPackageJson;
  warnings: string[];
  atTypes?: boolean;
}): boolean {
  const { packageSubpath, packageFolder, packageJson, atTypes, warnings } = options;

  // For example, if we started with importFullPath="semver/index",
  // here we may get normalizedImportFullPath="@types/semver/index"
  const normalizedImportFullPath: string = packageJson.name + packageSubpath;

  // First try to resolve the .js main index
  let cjsTargetPath: string | undefined = undefined;
  try {
    cjsTargetPath = Resolve.sync(normalizedImportFullPath, {
      basedir: packageFolder,
      preserveSymlinks: false,
      extensions: jsExtensions
    });
  } catch (error) {
    // not found
  }

  const mainIndexTitle: string = atTypes ? '@types main index:' : 'Main index:';

  if (cjsTargetPath) {
    const parsedPath: path.ParsedPath = path.parse(cjsTargetPath);

    // Is the resolved .js extension okay?
    if (tsExtensions.indexOf(parsedPath.ext.toLocaleLowerCase()) >= 0) {
      logOutputField(mainIndexTitle, '(inferred from .js main index)');
      console.log();
      logOutputField('Target path:', cjsTargetPath);
      return true;
    }

    // Try to replace the file extension
    const dtsTargetPath: string = path.join(parsedPath.dir, parsedPath.name + '.d.ts');
    if (FileSystem.exists(dtsTargetPath)) {
      logOutputField(mainIndexTitle, '(inferred from .js entry point)');
      console.log();
      logOutputField('Target path:', dtsTargetPath);
      return true;
    }
  }

  if (!packageSubpath) {
    // Try importing the "types"/"typings" main index:

    if (packageJson.types) {
      logOutputField(mainIndexTitle, `"types": ${JSON.stringify(packageJson.types)}`);
      console.log();
      logOutputField('Target path:', path.join(packageFolder, packageJson.types));
      return true;
    }

    if (packageJson.typings) {
      logOutputField(mainIndexTitle, `"typings": ${JSON.stringify(packageJson.typings)}`);
      console.log();
      logOutputField('Target path:', path.join(packageFolder, packageJson.typings));
      return true;
    }

    if (atTypes) {
      warnings.push('The @types package does not define "types" or "typings" field.');
    }
  } else {
    // Try importing the .d.ts file directly
    let dtsTargetPath: string | undefined = undefined;
    try {
      dtsTargetPath = Resolve.sync(normalizedImportFullPath, {
        basedir: packageFolder,
        preserveSymlinks: false,
        extensions: tsExtensions
      });
    } catch (error) {
      // not found
    }

    if (dtsTargetPath) {
      console.log();
      logOutputField('Target path:', dtsTargetPath);
      return true;
    }
  }

  return false;
}

function traceImportInner(options: IExecuteOptions, warnings: string[]): void {
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
    const packageSubpath: string | undefined = match[2];
    const packageSubpathWithoutSlash: string | undefined = packageSubpath
      ? packageSubpath.substring(1)
      : undefined;

    logInputField('Package name:', importPackageName);
    logInputField('Package subpath:', packageSubpathWithoutSlash || '(not specified)');

    console.log('\nResolving...\n');

    // Resolve the NPM package first
    let packageFolder: string | undefined;
    let packageJson: IPackageJson | undefined = undefined;
    {
      let resolvedPackageJsonPath: string | undefined;
      try {
        resolvedPackageJsonPath = Resolve.sync(`${importPackageName}/package.json`, {
          basedir: baseFolder,
          preserveSymlinks: false
        });
      } catch (e) {
        // Could not find NPM package
      }

      if (resolvedPackageJsonPath) {
        packageFolder = path.dirname(resolvedPackageJsonPath);
        logOutputField('Package folder:', packageFolder);

        packageJson = JsonFile.load(resolvedPackageJsonPath) as IPackageJson;
        logOutputField(
          'package.json:',
          `${packageJson.name || '(missing name)'} (${packageJson.version || 'missing version'})`
        );
      }
    }

    // Also try to resolve the @types package
    let atTypesPackageFolder: string | undefined = undefined;
    let atTypesPackageJson: IPackageJson | undefined = undefined;

    if (options.resolutionType === 'ts') {
      if (!importPackageName.startsWith('@types/')) {
        const parsedPackageName: IParsedPackageName = PackageName.parse(importPackageName);
        let atTypesPackageName: string;
        if (parsedPackageName.scope) {
          atTypesPackageName = `@types/${parsedPackageName.scope}__${parsedPackageName.unscopedName}`;
        } else {
          atTypesPackageName = `@types/${parsedPackageName.unscopedName}`;
        }

        let atTypesPackageJsonPath: string | undefined;
        try {
          atTypesPackageJsonPath = Resolve.sync(`${atTypesPackageName}/package.json`, {
            basedir: baseFolder,
            preserveSymlinks: false
          });
        } catch (e) {
          // Unable to resolve @types package
        }

        if (atTypesPackageJsonPath) {
          atTypesPackageFolder = path.dirname(atTypesPackageJsonPath);
          logOutputField('@types folder:', atTypesPackageFolder);

          atTypesPackageJson = JsonFile.load(atTypesPackageJsonPath) as IPackageJson;
          logOutputField(
            '@types package.json:',
            `${atTypesPackageJson.name || '(missing name)'} (${
              atTypesPackageJson.version || 'missing version'
            })`
          );
        }
      }
    }

    switch (options.resolutionType) {
      case 'cjs':
        {
          if (!packageFolder || !packageJson) {
            throw new Error(`Cannot find package "${importPackageName}" from "${baseFolder}".`);
          }

          if (!packageSubpath) {
            if (packageJson.main) {
              logOutputField('Main index:', `"main": ${JSON.stringify(packageJson.main)}`);
            } else {
              logOutputField('Main index:', '(none)');
            }
          }

          let targetPath: string;
          try {
            targetPath = Resolve.sync(importFullPath, {
              basedir: packageFolder,
              preserveSymlinks: false,
              extensions: jsExtensions
            });
          } catch (error) {
            // Are we importing the main index?
            if (packageSubpath) {
              throw new Error(`Unable to resolve the module subpath: ...${packageSubpath}`);
            } else {
              console.log('\nThis package does not define a main index.');
              return;
            }
          }
          console.log();
          logOutputField('Target path:', targetPath);
        }
        break;
      case 'ts':
        if (!packageFolder || (!packageJson && !atTypesPackageFolder && !atTypesPackageJson)) {
          throw new Error(`Cannot find package "${importPackageName}" from "${baseFolder}".`);
        }

        if (packageFolder && packageJson) {
          if (traceTypeScriptPackage({ packageSubpath, packageFolder, packageJson, warnings })) {
            if (atTypesPackageFolder) {
              warnings.push('An @types package was found but not used.');
            }

            return;
          }
        }

        if (atTypesPackageFolder && atTypesPackageJson) {
          if (
            traceTypeScriptPackage({
              packageSubpath,
              packageFolder: atTypesPackageFolder,
              packageJson: atTypesPackageJson,
              warnings,
              atTypes: true
            })
          ) {
            return;
          }
        }

        throw new Error(`Unable to resolve the module subpath: ...${packageSubpath}`);
      default:
        throw new Error(`The "${options.resolutionType}" resolution type is not implemented yet`);
    }
  } else {
    logInputField('Import path:', importFullPath);
    console.log(`\nThe import path does not appear to reference an NPM package.`);
    console.log('Resolving...\n');

    let targetPath: string;
    try {
      targetPath = Resolve.sync(importFullPath, {
        basedir: baseFolder,
        preserveSymlinks: false,
        extensions: options.resolutionType === 'ts' ? tsExtensions : jsExtensions
      });
    } catch (error) {
      throw new Error(`Unable to resolve the import path: ${importFullPath}`);
    }

    logOutputField('Target path:', targetPath);
  }
}

export function traceImport(options: IExecuteOptions): void {
  const warnings: string[] = [];
  try {
    traceImportInner(options, warnings);
  } finally {
    if (warnings.length) {
      console.log();
      for (const warning of warnings) {
        console.log(Colorize.yellow('Warning: ' + warning));
      }
    }
  }
}
