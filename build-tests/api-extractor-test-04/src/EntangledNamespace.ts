// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This is a "beta" namespace.
 * @beta
 */
export namespace EntangledNamespace {

  /**
   * This is a nested namespace.
   * The "beta" release tag is inherited from the parent.
   */
  export namespace N2 {

    /**
     * This class is in a nested namespace.
     * @alpha
     */
    export class ClassX {
      /**
       * The "alpha" release tag is inherited from the parent.
       */
      public static a: string;
    }
  }

  /**
   * This is a nested namespace.
   * The "beta" release tag is inherited from the parent.
   */
  export namespace N3 {
    /**
     * This class is in a nested namespace.
     * @internal
     */
    export class _ClassY {
      /**
       * This definition refers to a "alpha" namespaced class.
       */
      public b: EntangledNamespace.N2.ClassX;

      /**
       * This definition refers to the type of a "alpha" namespaced member.
       */
      public c(): typeof N2.ClassX.a {
        return undefined as any;
      }
    }
  }
}
