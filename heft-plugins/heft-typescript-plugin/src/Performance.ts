// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export type PerformanceMeasurer = <TResult extends object | void>(
  measurementName: string,
  fn: () => TResult
) => TResult & { duration: number };

export type PerformanceMeasurerAsync = <TResult extends object | void>(
  measurementName: string,
  fn: () => Promise<TResult>
) => Promise<TResult & { duration: number }>;
