// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** @public */
export namespace Camera {
  export enum TransitionType {
    FLY = 'fly',
    INSTANT = 'instant'
  }
}

/** @public */
export namespace Sweep {
  /** Alias kept for backward compatibility. */
  export import Transition = Camera.TransitionType;

  export namespace Nested {
    export import Transition = Camera.TransitionType;
  }
}
