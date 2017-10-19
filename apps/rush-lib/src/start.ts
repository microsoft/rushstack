// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { EOL } from 'os';
import * as colors from 'colors';

import rushVersion from './rushVersion';
import RushCommandLineParser from './cli/actions/RushCommandLineParser';

// tslint:disable-next-line:export-name
export function executeCli(wrapperVersion: string, isManaged: boolean = false): void {
  console.log(
    EOL +
    colors.bold(`Rush Multi-Package Build Tool ${rushVersion}` + colors.yellow(isManaged ? '' : '(unmanaged)')) +
    colors.cyan(' - http://aka.ms/rush') +
    EOL
  );

  const parser: RushCommandLineParser = new RushCommandLineParser();

  parser.execute();
}
