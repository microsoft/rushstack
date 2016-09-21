/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

import * as colors from 'colors';
import * as fs from 'fs';
import * as glob from 'glob';
import * as os from 'os';
import * as path from 'path';
import builtinPackageNames = require('builtins');

import { CommandLineAction } from '@microsoft/ts-command-line';
import RushCommandLineParser from './RushCommandLineParser';

export default class CheckAction extends CommandLineAction {
  private _parser: RushCommandLineParser;

  constructor(parser: RushCommandLineParser) {
    super({
      actionVerb: 'check',
      summary: 'Check for imports that are missing from a project\'s package.json file',
      documentation: 'Check for imports that are missing from a project\'s package.json file.'
    });
    this._parser = parser;
  }

  protected onDefineParameters(): void {
    // abstract
  }

  protected onExecute(): void {
    console.log('Starting "rush check"' + os.EOL);

    const packageJsonFilename: string = path.resolve('./package.json');

    if (!fs.existsSync(packageJsonFilename)) {
      throw new Error('You must run this project from the top-level folder that contains a package.json file');
    }

    const requireRegExps: RegExp[] = [
      /\brequire\s*\(\s*[']([^']+\s*)[']\)/,
      /\brequire\s*\(\s*["]([^"]+)["]\s*\)/,
      /\brequire.ensure\s*\(\s*[']([^']+\s*)[']\)/,
      /\brequire.ensure\s*\(\s*["]([^"]+)["]\s*\)/,
      /\brequire.resolve\s*\(\s*[']([^']+\s*)[']\)/,
      /\brequire.resolve\s*\(\s*["]([^"]+)["]\s*\)/,
      /\bSystem.import\s*\(\s*[']([^']+\s*)[']\)/,
      /\bSystem.import\s*\(\s*["]([^"]+)["]\s*\)/,
      /\bfrom\s*[']([^']+)[']/,
      /\bfrom\s*["]([^"]+)["]/,
      /\bimport\s*[']([^']+)[']\s*\;/,
      /\bimport\s*["]([^"]+)["]\s*\;/
    ];

    // Example: "my-package/lad/dee/dah" --> "my-package"
    // Example: "@ms/my-package" --> "@ms/my-package"
    const packageRegExp: RegExp = /^((@[a-z\-0-9!_]+\/)?[a-z\-0-9!_]+)\/?/;

    const requireMatches: Set<string> = new Set<string>();

    for (const filename of glob.sync('{./*.{ts,js,tsx,jsx},./{src,lib}/**/*.{ts,js,tsx,jsx}}')) {
      try {
        const contents: string = fs.readFileSync(filename, 'utf8');
        const lines: string[] = contents.split('\n');

        for (const line of lines) {
          for (const requireRegExp of requireRegExps) {
            const requireRegExpResult: RegExpExecArray = requireRegExp.exec(line);
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
      const packageRegExpResult: RegExpExecArray = packageRegExp.exec(requireMatch);
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
