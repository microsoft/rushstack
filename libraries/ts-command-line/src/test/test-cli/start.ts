// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { WidgetCommandLine } from './WidgetCommandLine.ts';

const commandLine: WidgetCommandLine = new WidgetCommandLine();
commandLine.executeAsync().catch((error: Error) => {
  // eslint-disable-next-line no-console
  console.error(error.message);
  process.exitCode = 1;
});
