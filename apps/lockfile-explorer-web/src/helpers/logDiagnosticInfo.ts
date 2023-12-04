// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Used to log diagnostics that may be useful when troubleshooting
// problems with the algorithm.
export const logDiagnosticInfo = (...args: string[]): void => {
  if (window.appContext.debugMode) {
    // eslint-disable-next-line no-console
    console.log('Diagnostic: ', ...args);
  }
};
