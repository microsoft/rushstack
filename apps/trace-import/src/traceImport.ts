// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  FileSystem,
  IPackageJson,
  IParsedPackageName,
  JsonFile,
  PackageName
} from '@rushstack/node-core-library';
import colors from 'colors/safe';
import * as path from 'path';
import * as process from 'process';
import * as Resolve from 'resolve';

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
const packageImportPathRegExp: RegExp = /^((?:@[a-z0-9\-_\.]+\/)?[a-z0-9\-_\.]+)(\/.*)?$/i;

function logInputField(title: string, value: string): void {
  console.log(colors.cyan(title.padEnd(25)) + value);
}

function logOutputField(title: string, value: string): void {
  console.log(colors.green(title.padEnd(25)) + value);
}

function traceTypeScriptPackage(options: {
  importRemainder: string;
  packageFolder: string;
  packageJson: IPackageJson;
  warnings: string[];
  atTypes?: boolean;
}): boolean {
  const { importRemainder, packageFolder, packageJson, atTypes, warnings } = options;

  // For example, if we started with importFullPath="semver/index",
  // here we may get normalizedImportFullPath="@types/semver/index"
  const normalizedImportFullPath: string = packageJson.name + importRemainder;

  // First try to resolve the .js default entry point
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

  const defaultIndexTitle: string = atTypes ? '@types default index:' : 'Default index:';

  if (cjsTargetPath) {
    const parsedPath: path.ParsedPath = path.parse(cjsTargetPath);

    // Is the resolved .js extension okay?
    if (tsExtensions.indexOf(parsedPath.ext.toLocaleLowerCase()) >= 0) {
      logOutputField(defaultIndexTitle, '(inferred from .js entry point)');
      console.log();
      logOutputField('Target path:', cjsTargetPath);
      return true;
    }

    // Try to replace the file extension
    const dtsTargetPath: string = path.join(parsedPath.dir, parsedPath.name + '.d.ts');
    if (FileSystem.exists(dtsTargetPath)) {
      logOutputField(defaultIndexTitle, '(inferred from .js entry point)');
      console.log();
      logOutputField('Target path:', dtsTargetPath);
      return true;
    }
  }

  if (!importRemainder) {
    // Try importing the "types"/"typings" default:

    if (packageJson.types) {
      logOutputField(defaultIndexTitle, `"types": ${JSON.stringify(packageJson.types)}`);
      console.log();
      logOutputField('Target path:', path.join(packageFolder, packageJson.types));
      return true;
    }

    if (packageJson.typings) {
      logOutputField(defaultIndexTitle, `"typings": ${JSON.stringify(packageJson.typings)}`);
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
    const importRemainder: string | undefined = match[2];
    const importRemainderWithoutSlash: string | undefined = importRemainder
      ? importRemainder.substring(1)
      : undefined;

    logInputField('Package name:', importPackageName);
    logInputField('Module path:', importRemainderWithoutSlash || '(not specified)');

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

          if (!importRemainder) {
            if (packageJson.main) {
              logOutputField('Default entry point:', `"main": ${JSON.stringify(packageJson.main)}`);
            } else {
              logOutputField('Default entry point:', '(none)');
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
        if (!packageFolder || (!packageJson && !atTypesPackageFolder && !atTypesPackageJson)) {
          throw new Error(`Cannot find package "${importPackageName}" from "${baseFolder}".`);
        }

        if (packageFolder && packageJson) {
          if (traceTypeScriptPackage({ importRemainder, packageFolder, packageJson, warnings })) {
            if (atTypesPackageFolder) {
              warnings.push('An @types package was found but not used.');
            }

            return;
          }
        }

        if (atTypesPackageFolder && atTypesPackageJson) {
          if (
            traceTypeScriptPackage({
              importRemainder,
              packageFolder: atTypesPackageFolder,
              packageJson: atTypesPackageJson,
              warnings,
              atTypes: true
            })
          ) {
            return;
          }
        }

        throw new Error(`Unable to resolve remainder of import path: ...${importRemainder}`);
      default:
        throw new Error(`The "${options.resolutionType}" resolution type is not implemented yet`);
    }
  } else {
    console.log(`The import path does not appear to reference an NPM package.\n`);
    logOutputField('Module path:', importFullPath);
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
        console.log(colors.yellow('Warning: ' + warning));
      }
    }
  }
}
