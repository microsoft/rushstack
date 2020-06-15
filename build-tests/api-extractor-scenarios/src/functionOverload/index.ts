// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * @alpha
 */
export function combine(x: boolean, y: boolean): boolean;

/**
 * @beta
 */
export function combine(x: string, y: string): string;

/**
 * @public
 */
export function combine(x: number, y: number): number;

// implementation
export function combine(
  x: string | number | boolean,
  y: string | number | boolean
): string | number | boolean {
  return 42;
}

/**
 * @beta
 */
export function _combine(x: string, y: string): string;

/**
 * @internal
 */
export function _combine(x: number, y: number): number;

// implementation
export function _combine(x: string | number, y: string | number): string | number {
  return 42;
}

/**
 * @public
 */
export class Combiner {
  /**
   * @alpha
   */
  public combine(x: boolean, y: boolean): boolean;

  /**
   * @beta
   */
  public combine(x: string, y: string): string;

  /**
   * @public
   */
  public combine(x: number, y: number): number;

  // implementation
  public combine(x: string | number | boolean, y: string | number | boolean): string | number | boolean {
    return 42;
  }
}
