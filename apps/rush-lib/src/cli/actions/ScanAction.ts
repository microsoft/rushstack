// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// eslint-disable-next-line
const importLazy = require('import-lazy')(require);

import * as colors from 'colors';
// import * as glob from 'glob';
const glob = importLazy('glob');
import * as path from 'path';
import * as builtinPackageNames from 'builtin-modules';
import { FileSystem } from '@rushstack/node-core-library';

import { RushCommandLineParser } from '../RushCommandLineParser';
import { BaseConfiglessRushAction } from './BaseRushAction';

export class ScanAction extends BaseConfiglessRushAction {
  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'scan',
      summary: 'Scan the current project folder and display a report of imported packages.',
      documentation:
        `The NPM system allows a project to import dependencies without explicitly` +
        ` listing them in its package.json file. This is a dangerous practice, because` +
        ` there is no guarantee you will get a compatible version. The "rush scan" command` +
        ` reports a list of packages that are imported by your code, which you can` +
        ` compare against your package.json file to find mistakes. It searches the "./src"` +
        ` and "./lib" folders for typical import syntaxes such as "import __ from '__'",` +
        ` "require('__')", "System.import('__'), etc.  The results are only approximate,` +
        ` but generally pretty accurate.`,
      safeForSimultaneousRushProcesses: true,
      parser
    });
  }

  protected onDefineParameters(): void {
    // abstract
  }

  protected runAsync(): Promise<void> {
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
    return Promise.resolve();
  }
}
