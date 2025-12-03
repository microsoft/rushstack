// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import builtinPackageNames from 'builtin-modules';

import { Colorize } from '@rushstack/terminal';
import type { CommandLineFlagParameter } from '@rushstack/ts-command-line';
import { FileSystem } from '@rushstack/node-core-library';

import type { RushCommandLineParser } from '../RushCommandLineParser';
import { BaseConfiglessRushAction } from './BaseRushAction';

export interface IJsonOutput {
  /**
   * Dependencies scan from source code
   */
  detectedDependencies: string[];
  /**
   * Dependencies detected but not declared in package.json
   */
  missingDependencies: string[];
  /**
   * Dependencies declared in package.json, but not used in source code
   */
  unusedDependencies: string[];
}

export class ScanAction extends BaseConfiglessRushAction {
  private readonly _jsonFlag: CommandLineFlagParameter;
  private readonly _allFlag: CommandLineFlagParameter;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'scan',
      summary:
        'When migrating projects into a Rush repo, this command is helpful for detecting' +
        ' undeclared dependencies.',
      documentation:
        `The Node.js module system allows a project to import NPM packages without explicitly` +
        ` declaring them as dependencies in the package.json file.  Such "phantom dependencies"` +
        ` can cause problems.  Rush and PNPM use symlinks specifically to protect against phantom dependencies.` +
        ` These protections may cause runtime errors for existing projects when they are first migrated into` +
        ` a Rush monorepo.  The "rush scan" command is a handy tool for fixing these errors. It scans the "./src"` +
        ` and "./lib" folders for import syntaxes such as "import __ from '__'", "require('__')",` +
        ` and "System.import('__').  It prints a report of the referenced packages.  This heuristic is` +
        ` not perfect, but it can save a lot of time when migrating projects.`,
      safeForSimultaneousRushProcesses: true,
      parser
    });

    this._jsonFlag = this.defineFlagParameter({
      parameterLongName: '--json',
      description: 'If this flag is specified, output will be in JSON format.'
    });
    this._allFlag = this.defineFlagParameter({
      parameterLongName: '--all',
      description: 'If this flag is specified, output will list all detected dependencies.'
    });
  }

  protected async runAsync(): Promise<void> {
    const packageJsonFilename: string = path.resolve('./package.json');

    if (!FileSystem.exists(packageJsonFilename)) {
      throw new Error('You must run "rush scan" in a project folder containing a package.json file.');
    }

    const requireRegExps: RegExp[] = [
      // Example: require('something')
      /\brequire\s*\(\s*[']([^']+\s*)[']\s*\)/,
      /\brequire\s*\(\s*["]([^"]+\s*)["]\s*\)/,

      // Example: require.ensure('something')
      /\brequire\.ensure\s*\(\s*[']([^']+\s*)[']\s*\)/,
      /\brequire\.ensure\s*\(\s*["]([^"]+\s*)["]\s*\)/,

      // Example: require.resolve('something')
      /\brequire\.resolve\s*\(\s*[']([^']+\s*)[']\s*\)/,
      /\brequire\.resolve\s*\(\s*["]([^"]+\s*)["]\s*\)/,

      // Example: System.import('something')
      /\bSystem\.import\s*\(\s*[']([^']+\s*)[']\s*\)/,
      /\bSystem\.import\s*\(\s*["]([^"]+\s*)["]\s*\)/,

      // Example: Import.lazy('something', require);
      /\bImport\.lazy\s*\(\s*[']([^']+\s*)[']/,
      /\bImport\.lazy\s*\(\s*["]([^"]+\s*)["]/,

      // Example:
      //
      // import {
      //   A, B
      // } from 'something';
      /\bfrom\s*[']([^']+)[']/,
      /\bfrom\s*["]([^"]+)["]/,

      // Example:  import 'something';
      /\bimport\s*[']([^']+)[']\s*\;/,
      /\bimport\s*["]([^"]+)["]\s*\;/,

      // Example: await import('fast-glob')
      /\bimport\s*\(\s*[']([^']+)[']\s*\)/,
      /\bimport\s*\(\s*["]([^"]+)["]\s*\)/,

      // Example:
      // /// <reference types="something" />
      /\/\/\/\s*<\s*reference\s+types\s*=\s*["]([^"]+)["]\s*\/>/
    ];

    // Example: "my-package/lad/dee/dah" --> "my-package"
    // Example: "@ms/my-package" --> "@ms/my-package"
    // Example: "lodash.get" --> "lodash.get"
    const packageRegExp: RegExp = /^((@[a-z\-0-9!_]+\/)?[a-z\-0-9!_][a-z\-0-9!_.]*)\/?/;

    const requireMatches: Set<string> = new Set<string>();

    const { default: glob } = await import('fast-glob');
    const scanResults: string[] = await glob(['./*.{ts,js,tsx,jsx}', './{src,lib}/**/*.{ts,js,tsx,jsx}']);
    for (const filename of scanResults) {
      try {
        const contents: string = FileSystem.readFile(filename);
        const lines: string[] = contents.split('\n');

        for (const line of lines) {
          for (const requireRegExp of requireRegExps) {
            const requireRegExpResult: RegExpExecArray | null = requireRegExp.exec(line);
            if (requireRegExpResult) {
              requireMatches.add(requireRegExpResult[1]);
            }
          }
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.log(Colorize.bold('Skipping file due to error: ' + filename));
      }
    }

    const packageMatches: Set<string> = new Set<string>();

    requireMatches.forEach((requireMatch: string) => {
      const packageRegExpResult: RegExpExecArray | null = packageRegExp.exec(requireMatch);
      if (packageRegExpResult) {
        packageMatches.add(packageRegExpResult[1]);
      }
    });

    const detectedPackageNames: string[] = [];

    packageMatches.forEach((packageName: string) => {
      if (builtinPackageNames.indexOf(packageName) < 0) {
        detectedPackageNames.push(packageName);
      }
    });

    detectedPackageNames.sort();

    const declaredDependencies: Set<string> = new Set<string>();
    const declaredDevDependencies: Set<string> = new Set<string>();
    const missingDependencies: string[] = [];
    const unusedDependencies: string[] = [];
    const packageJsonContent: string = FileSystem.readFile(packageJsonFilename);
    try {
      const manifest: {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      } = JSON.parse(packageJsonContent);
      if (manifest.dependencies) {
        for (const depName of Object.keys(manifest.dependencies)) {
          declaredDependencies.add(depName);
        }
      }
      if (manifest.devDependencies) {
        for (const depName of Object.keys(manifest.devDependencies)) {
          declaredDevDependencies.add(depName);
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`JSON.parse ${packageJsonFilename} error`);
    }

    for (const detectedPkgName of detectedPackageNames) {
      /**
       * Missing(phantom) dependencies are
       * - used in source code
       * - not decalred in dependencies and devDependencies in package.json
       */
      if (!declaredDependencies.has(detectedPkgName) && !declaredDevDependencies.has(detectedPkgName)) {
        missingDependencies.push(detectedPkgName);
      }
    }
    for (const declaredPkgName of declaredDependencies) {
      /**
       * Unused dependencies are
       * - declared in dependencies in package.json (devDependencies not included)
       * - not used in source code
       */
      if (!detectedPackageNames.includes(declaredPkgName) && !declaredPkgName.startsWith('@types/')) {
        unusedDependencies.push(declaredPkgName);
      }
    }

    const output: IJsonOutput = {
      detectedDependencies: detectedPackageNames,
      missingDependencies: missingDependencies,
      unusedDependencies: unusedDependencies
    };

    if (this._jsonFlag.value) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(output, undefined, 2));
    } else if (this._allFlag.value) {
      if (detectedPackageNames.length !== 0) {
        // eslint-disable-next-line no-console
        console.log('Dependencies that seem to be imported by this project:');
        for (const packageName of detectedPackageNames) {
          // eslint-disable-next-line no-console
          console.log('  ' + packageName);
        }
      } else {
        // eslint-disable-next-line no-console
        console.log('This project does not seem to import any NPM packages.');
      }
    } else {
      let wroteAnything: boolean = false;

      if (missingDependencies.length > 0) {
        // eslint-disable-next-line no-console
        console.log(
          Colorize.yellow('Possible phantom dependencies') +
            " - these seem to be imported but aren't listed in package.json:"
        );
        for (const packageName of missingDependencies) {
          // eslint-disable-next-line no-console
          console.log('  ' + packageName);
        }
        wroteAnything = true;
      }

      if (unusedDependencies.length > 0) {
        if (wroteAnything) {
          // eslint-disable-next-line no-console
          console.log('');
        }
        // eslint-disable-next-line no-console
        console.log(
          Colorize.yellow('Possible unused dependencies') +
            " - these are listed in package.json but don't seem to be imported:"
        );
        for (const packageName of unusedDependencies) {
          // eslint-disable-next-line no-console
          console.log('  ' + packageName);
        }
        wroteAnything = true;
      }

      if (!wroteAnything) {
        // eslint-disable-next-line no-console
        console.log(
          Colorize.green('Everything looks good.') + '  No missing or unused dependencies were found.'
        );
      }
    }
  }
}
