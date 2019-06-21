// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This class is indirectly consumed by ForgottenExportConsumer3.
 */
export interface IForgottenIndirectDependency {

}


/**
 * This class is directly consumed by ForgottenExportConsumer3.
 */
export interface IForgottenDirectDependency {
  member: IForgottenIndirectDependency;
}

/**
 * This class directly consumes IForgottenDirectDependency
 * and indirectly consumes IForgottenIndirectDependency.
 * @beta
 */
export class ForgottenExportConsumer3 {
  public test2(): IForgottenDirectDependency | undefined {
    return undefined;
  }
}
