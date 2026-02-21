// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { LintCommandLineParser } from './cli/lint/LintCommandLineParser.ts';

const parser: LintCommandLineParser = new LintCommandLineParser();

parser.executeAsync().catch(console.error); // CommandLineParser.executeAsync() should never reject the promise
