// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ExplorerCommandLineParser } from './cli/explorer/ExplorerCommandLineParser.ts';

const parser: ExplorerCommandLineParser = new ExplorerCommandLineParser();

parser.executeAsync().catch(console.error); // CommandLineParser.executeAsync() should never reject the promise
