// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { PackageJsonLookup } from '@rushstack/node-core-library';
import { Colorize } from '@rushstack/terminal';

import { TraceImportCommandLineParser } from './TraceImportCommandLineParser.ts';

const toolVersion: string = PackageJsonLookup.loadOwnPackageJson(__dirname).version;

console.log();
console.log(Colorize.bold(`trace-import ${toolVersion}`) + ' - ' + Colorize.cyan('https://rushstack.io'));
console.log();

const commandLine: TraceImportCommandLineParser = new TraceImportCommandLineParser();
commandLine.executeAsync().catch((error) => {
  console.error(error);
});
