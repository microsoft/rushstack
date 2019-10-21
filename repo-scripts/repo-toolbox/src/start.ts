// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See the @microsoft/rush package's LICENSE file for license information.

import { ToolboxCommandLine } from './ToolboxCommandLine';

console.log('repo-toolbox\n');

const commandLine: ToolboxCommandLine = new ToolboxCommandLine();
commandLine.execute();
