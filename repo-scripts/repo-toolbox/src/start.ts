// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ToolboxCommandLine } from './cli/ToolboxCommandLine.ts';

// eslint-disable-next-line no-console
console.log('repo-toolbox\n');

const commandLine: ToolboxCommandLine = new ToolboxCommandLine();
// eslint-disable-next-line no-console
commandLine.executeAsync().catch(console.error); // CommandLineParser.executeAsync() should never reject the promise
