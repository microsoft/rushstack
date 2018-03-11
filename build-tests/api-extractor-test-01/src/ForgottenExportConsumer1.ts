// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The ForgottenExportConsumer1 class relies on this IForgottenExport.
 *
 * This should end up as a non-exported "IForgottenExport" in the index.d.ts.
 */
export interface IForgottenExport {
  instance1: string;
}

/** @public */
export class ForgottenExportConsumer1 {
  public test1(): IForgottenExport | undefined {
    return undefined;
  }
}
