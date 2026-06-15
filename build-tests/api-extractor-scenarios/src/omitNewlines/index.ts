// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * @public
 */
export class Combiner {
  /**
   * @alpha
   */
  public alphaMember(x: boolean, y: boolean): boolean {
    return false;
  }

  /**
   * @beta
   */
  public betaMember(x: string, y: string): string {
    return '';
  }

  /**
   * @public
   */
  public publicMember(x: number, y: number): number {
    return 42;
  }
}
