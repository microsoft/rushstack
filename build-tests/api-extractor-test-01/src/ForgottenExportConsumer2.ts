// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The ForgottenExportConsumer2 class relies on this IForgottenExport.
 *
 * This should end up as a non-exported "IForgottenExport_2" in the index.d.ts.
 * It is renamed to avoid a conflict with the IForgottenExport from ForgottenExportConsumer1.
 */
export interface IForgottenExport {
  instance2: string;
}

/** @public */
export class ForgottenExportConsumer2 {
  public test2(): IForgottenExport | undefined {
    return undefined;
  }
}
