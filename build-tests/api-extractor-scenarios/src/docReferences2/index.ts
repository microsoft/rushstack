// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** @public */
export class CyclicA {
  /** {@inheritDoc CyclicB.methodB2} */
  public methodA1(): void {
  }
  /** {@inheritDoc CyclicB.methodB4} */
  public methodA3(): void {
  }
}

/** @public */
export class CyclicB {
  /** {@inheritDoc CyclicA.methodA3} */
  public methodB2(): void {
  }
  /** THE COMMENT */
  public methodB4(): void {
  }
}

/** @public */
export class FailWithSelfReference {
  /** {@inheritDoc FailWithSelfReference.method2} */
  public method1(): void {
  }
  /** {@inheritDoc FailWithSelfReference.method1} */
  public method2(): void {
  }
}
