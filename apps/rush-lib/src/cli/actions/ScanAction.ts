// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import colors from 'colors';
import * as path from 'path';
import builtinPackageNames from 'builtin-modules';

import { Import, FileSystem } from '@rushstack/node-core-library';
import { RushCommandLineParser } from '../RushCommandLineParser';
import { BaseConfiglessRushAction } from './BaseRushAction';

const glob: typeof import('glob') = Import.lazy('glob', require);

export class ScanAction extends BaseConfiglessRushAction {
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
  }

  protected onDefineParameters(): void {
    // abstract
  }

  protected async runAsync(): Promise<void> {
    const packageJsonFilename: string = path.resolve('./package.json');

    if (!FileSystem.exists(packageJsonFilename)) {
      throw new Error('You must run "rush scan" in a project folder containing a package.json file.');
    }

    const requireRegExps: RegExp[] = [
      // Example: require('something')
      /\brequire\s*\(\s*[']([^']+\s*)[']\)/,
      /\brequire\s*\(\s*["]([^"]+)["]\s*\)/,

      // Example: require.ensure('something')
      /\brequire.ensure\s*\(\s*[']([^']+\s*)[']\)/,
      /\brequire.ensure\s*\(\s*["]([^"]+)["]\s*\)/,

      // Example: require.resolve('something')
      /\brequire.resolve\s*\(\s*[']([^']+\s*)[']\)/,
      /\brequire.resolve\s*\(\s*["]([^"]+)["]\s*\)/,

      // Example: System.import('something')
      /\bSystem.import\s*\(\s*[']([^']+\s*)[']\)/,
      /\bSystem.import\s*\(\s*["]([^"]+)["]\s*\)/,

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

      // Example:
      // /// <reference types="something" />
      /\/\/\/\s*<\s*reference\s+types\s*=\s*["]([^"]+)["]\s*\/>/
    ];

    // Example: "my-package/lad/dee/dah" --> "my-package"
    // Example: "@ms/my-package" --> "@ms/my-package"
    const packageRegExp: RegExp = /^((@[a-z\-0-9!_]+\/)?[a-z\-0-9!_]+)\/?/;

    const requireMatches: Set<string> = new Set<string>();

    for (const filename of glob.sync('{./*.{ts,js,tsx,jsx},./{src,lib}/**/*.{ts,js,tsx,jsx}}')) {
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
        console.log(colors.bold('Skipping file due to error: ' + filename));
      }
    }

    const packageMatches: Set<string> = new Set<string>();

    requireMatches.forEach((requireMatch: string) => {
      const packageRegExpResult: RegExpExecArray | null = packageRegExp.exec(requireMatch);
      if (packageRegExpResult) {
        packageMatches.add(packageRegExpResult[1]);
      }
    });

    const packageNames: string[] = [];

    packageMatches.forEach((packageName: string) => {
      packageNames.push(packageName);
    });

    packageNames.sort();

    console.log('Detected dependencies:');
    for (const packageName of packageNames) {
      if (builtinPackageNames.indexOf(packageName) < 0) {
        console.log('  ' + packageName);
      }
    }
  }
}
