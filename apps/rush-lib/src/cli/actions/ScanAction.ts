// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as fs from 'fs';
import builtinPackageNames from 'builtin-modules';
import { parseHeaderOrFail, Header } from '@definitelytyped/header-parser';
import { unmangleScopedPackage } from '@definitelytyped/utils';

import { Import, FileSystem, ConsoleTerminalProvider, Terminal, Colors } from '@rushstack/node-core-library';
import { RushCommandLineParser } from '../RushCommandLineParser';
import { CommandLineFlagParameter } from '@rushstack/ts-command-line';
import { BaseConfiglessRushAction } from './BaseRushAction';

const glob: typeof import('glob') = Import.lazy('glob', require);

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
  private _jsonFlag!: CommandLineFlagParameter;
  private _allFlag!: CommandLineFlagParameter;
  private _terminal!: Terminal;

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
    this._terminal = new Terminal(
      new ConsoleTerminalProvider({
        verboseEnabled: this.parser.isDebug
      })
    );

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

      // Example:  import('something');
      /(?<!\.)\bimport\([']([^']+)[']\)/,
      /(?<!\.)\bimport\(["]([^"]+)["]\)/,

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
        this._terminal.writeErrorLine(
          Colors.bold(`Skipping file(${filename}) due to error: ${error.message}`)
        );
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
       * Unused dependencies case 1:
       * - declared in dependencies in package.json (devDependencies not included)
       * - not used in source code
       */
      if (!detectedPackageNames.includes(declaredPkgName) && !declaredPkgName.startsWith('@types/')) {
        unusedDependencies.push(declaredPkgName);
      }
    }

    const allTypesDependencies: string[] = Array.from(declaredDependencies)
      .concat(Array.from(declaredDevDependencies))
      .filter((pkgName) => pkgName.startsWith('@types/'));
    for (const typesDependencyName of allTypesDependencies) {
      /**
       * Unused dependencies case 2:
       * - dependencies starts with @types/ in package.json (devDependencies included)
       * - not Type definitions for non-npm package
       * - corresponding package is unused
       */
      let typesPackageJsonPath: string | null = null;
      try {
        typesPackageJsonPath = require.resolve(`${typesDependencyName}/package.json`);
      } catch (e) {
        // no-catch
      }
      if (!typesPackageJsonPath) {
        this._terminal.writeVerboseLine(`${typesDependencyName} is not installed`);
        continue;
      }
      if (!fs.existsSync(typesPackageJsonPath)) {
        this._terminal.writeVerboseLine(`package.json does not exist: ${typesPackageJsonPath}`);
        continue;
      }
      const typesPackageDir: string = path.dirname(typesPackageJsonPath);
      try {
        const { types, typings }: { types?: string; typings?: string } = JSON.parse(
          fs.readFileSync(typesPackageJsonPath, 'utf8')
        );
        let typesIndexPath: string = path.resolve(typesPackageDir, 'index.d.ts');
        for (const t of [types, typings]) {
          if (t) {
            let resolvedTypes: string = t;
            if (!t.endsWith('.d.ts')) {
              resolvedTypes = t + '.d.ts';
            }
            const typesPath: string = path.resolve(typesPackageDir, resolvedTypes);
            if (fs.existsSync(typesPath)) {
              typesIndexPath = typesPath;
              break;
            }
          }
        }
        const typesIndex: string = fs.readFileSync(typesIndexPath, 'utf8');
        const typesHeader: Header = parseHeaderOrFail(typesIndex);
        if (typesHeader.nonNpm) {
          // skip nonNpm types, i.e. @types/node
          this._terminal.writeVerboseLine(`${typesDependencyName} is non-npm package definition`);
          continue;
        }

        const mangledPackageName: string = typesDependencyName.slice('@types/'.length);
        const unmangledPackageName: string = unmangleScopedPackage(mangledPackageName) || mangledPackageName;

        if (!detectedPackageNames.includes(unmangledPackageName)) {
          unusedDependencies.push(typesDependencyName);
        }
      } catch (e) {
        this._terminal.writeVerboseLine(`scan ${typesDependencyName} failed: ${e.message}`);
        continue;
      }
    }

    const output: IJsonOutput = {
      detectedDependencies: detectedPackageNames,
      missingDependencies: missingDependencies,
      unusedDependencies: unusedDependencies
    };

    if (this._jsonFlag.value) {
      console.log(JSON.stringify(output, undefined, 2));
    } else if (this._allFlag.value) {
      if (detectedPackageNames.length !== 0) {
        console.log('Dependencies that seem to be imported by this project:');
        for (const packageName of detectedPackageNames) {
          console.log('  ' + packageName);
        }
      } else {
        console.log('This project does not seem to import any NPM packages.');
      }
    } else {
      let wroteAnything: boolean = false;

      if (missingDependencies.length > 0) {
        this._terminal.writeWarning('Possible phantom dependencies');
        this._terminal.writeLine(" - these seem to be imported but aren't listed in package.json:");
        for (const packageName of missingDependencies) {
          this._terminal.writeLine('  ' + packageName);
        }
        wroteAnything = true;
      }

      if (unusedDependencies.length > 0) {
        if (wroteAnything) {
          this._terminal.writeLine();
        }
        this._terminal.writeWarning('Possible unused dependencies');
        this._terminal.writeLine(" - these are listed in package.json but don't seem to be imported:");
        for (const packageName of unusedDependencies) {
          console.log('  ' + packageName);
        }
        wroteAnything = true;
      }

      if (!wroteAnything) {
        this._terminal.write(Colors.green('Everything looks good.'));
        this._terminal.writeLine('  No missing or unused dependencies were found.');
      }
    }
  }
}
