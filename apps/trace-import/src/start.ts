// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import colors from 'colors/safe';

import { PackageJsonLookup } from '@rushstack/node-core-library';
import { TraceImportCommandLineParser } from './TraceImportCommandLineParser';

const toolVersion: string = PackageJsonLookup.loadOwnPackageJson(__dirname).version;

console.log();
console.log(colors.bold(`trace-import ${toolVersion}`) + ' - ' + colors.cyan('https://rushstack.io'));
console.log();

const commandLine: TraceImportCommandLineParser = new TraceImportCommandLineParser();
commandLine.execute().catch((error) => {
  console.error(error);
});
