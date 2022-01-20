// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Colorize, ConsoleTerminalProvider, Terminal } from '@rushstack/terminal';

const terminal: Terminal = new Terminal(new ConsoleTerminalProvider());

terminal.writeLine('For instructions on debugging Rush, please see this documentation:');
terminal.writeLine(Colorize.bold('https://rushjs.io/pages/contributing/debugging/'));
