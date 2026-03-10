// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// eslint-disable-next-line @rushstack/packlets/mechanics
import {
  type LfxGraph,
  lfxGraphSerializer,
  type IJsonLfxGraph,
  type LfxGraphEntry
} from '../packlets/lfx-shared/index.ts';

const serviceUrl: string = window.appContext.serviceUrl;

export async function readLockfileAsync(): Promise<LfxGraphEntry[]> {
  // eslint-disable-next-line no-console
  console.log('Loading graph');

  const response = await fetch(`${serviceUrl}/api/graph`);
  const jsonGraph: IJsonLfxGraph = await response.json();
  const graph: LfxGraph = lfxGraphSerializer.deserializeFromJson(jsonGraph);
  return graph.entries;
}
