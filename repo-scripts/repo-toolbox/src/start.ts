// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ToolboxCommandLine } from './ToolboxCommandLine';

console.log('repo-toolbox\n');

const commandLine: ToolboxCommandLine = new ToolboxCommandLine();
commandLine.execute().catch(console.error); // CommandLineParser.execute() should never reject the promise
