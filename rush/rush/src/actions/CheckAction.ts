/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

import * as colors from 'colors';
import * as fs from 'fs';
import * as glob from 'glob';
import * as os from 'os';
import * as path from 'path';

import CommandLineAction from '../commandLine/CommandLineAction';
import RushCommandLineParser from './RushCommandLineParser';
import RushConfig from '../data/RushConfig';

export default class CheckAction extends CommandLineAction {
  private _parser: RushCommandLineParser;
  private _rushConfig: RushConfig;

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
    this._rushConfig = this._rushConfig = RushConfig.loadFromDefaultLocation();

    console.log('Starting "rush check"' + os.EOL);

    const packageJsonFilename: string = path.resolve('./package.json');

    if (!fs.existsSync(packageJsonFilename)) {
      throw new Error('You must run this project from the top-level folder that contains a package.json file');
    }

    const requireRegExps: RegExp[] = [
      /\Wrequire\s*\(\s*[']([^']+\s*)[']\)/,
      /\Wrequire\s*\(\s*["]([^"]+)["]\s*\)/,
      /\Wfrom\s*[']([^']+)[']/,
      /\Wfrom\s*["]([^"]+)["]/
    ];

    const packageRegExp: RegExp = /^((@[a-z\-0-9!_]+\/)?[a-z\-0-9!_]+)\/?/;

    const requireMatches: Set<string> = new Set<string>();

    for (const filename of glob.sync('{./*.{ts,js,tsx,jsx},./{src,lib}/**/*.{ts,js,tsx,jsx}}')) {
      // console.log(filename);
      try {
        const contents: string = fs.readFileSync(filename, 'utf8');
        const lines: string[] = contents.split('\n');

        for (const line of lines) {
          // console.log('[' + line.trim() + ']');
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
      } else {
        // console.log('REJECT: ' + requireMatch);
      }
    });

    const packageNames: string[] = [];

    packageMatches.forEach((packageName: string) => {
      packageNames.push(packageName);
    });

    packageNames.sort();

    const nodejsNames: string[] = [
      'assert', 'buffer', 'child_process', 'cluster', 'constants', 'crypto', 'dgram', 'dns',
      'domain', 'events', 'fs', 'http', 'https', 'net', 'os', 'path', 'punycode', 'querystring',
      'readline', 'repl', 'stream', 'string_decoder', 'tls', 'tty', 'url', 'util', 'vm', 'zlib'
    ];

    console.log('Detected dependencies:');
    for (const packageName of packageNames) {
      if (nodejsNames.indexOf(packageName) < 0) {
        console.log('  ' + packageName);
      }
    }
  }
}
