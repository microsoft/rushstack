// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export const logDiagnosticInfo = (...args: string[]): void => {
  console.log('Diagnostic: ', ...args);
};
