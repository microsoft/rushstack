// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IOperationGraph, Operation } from '@microsoft/rush-lib';
import type { IDaemonRequestEnvelope } from '@rushstack/rush-daemon-protocol';

import { DaemonRequestDispatchError } from './DaemonRequestDispatcher';

export type DaemonGraphVerb =
  | 'show' | 'status' | 'scope-in' | 'scope-out' | 'invalidate' | 'watch' | 'pause' | 'resume';

export interface IDaemonGraphRequest {
  readonly verb: DaemonGraphVerb;
  readonly selectors: ReadonlyArray<{ readonly kind: '--operation' | '--project'; readonly value: string }>;
}

export function parseDaemonGraphRequest(envelope: IDaemonRequestEnvelope): IDaemonGraphRequest {
  if (envelope.environment.RUSH_DAEMON_EXPERIMENTAL !== '1') {
    throw new DaemonRequestDispatchError('unsupported', 'Graph commands require RUSH_DAEMON_EXPERIMENTAL=1.');
  }
  if (
    envelope.commandOrigin !== 'built-in' || envelope.commandName !== 'daemon' ||
    envelope.argv[0] !== 'daemon' || envelope.argv[1] !== 'graph' || envelope.terminal.acceptsStdin
  ) {
    throw new DaemonRequestDispatchError('invalidRequest', 'Expected a built-in, noninteractive daemon graph request.');
  }
  const [, , verb, ...args] = envelope.argv;
  switch (verb) {
    case 'show': case 'status': case 'watch': case 'pause': case 'resume':
      if (args.length) throw new DaemonRequestDispatchError('invalidRequest', `${verb} takes no selectors.`);
      return { verb, selectors: [] };
    case 'scope-in': case 'scope-out': case 'invalidate': {
      const selectors: IDaemonGraphRequest['selectors'][number][] = [];
      for (let i: number = 0; i < args.length; i += 2) {
        const kind: string = args[i];
        const value: string | undefined = args[i + 1];
        if ((kind !== '--operation' && kind !== '--project') || !value || value.startsWith('--')) {
          throw new DaemonRequestDispatchError('invalidRequest', 'Selectors must be --operation ID or --project NAME pairs.');
        }
        selectors.push({ kind, value });
      }
      if (!selectors.length) {
        throw new DaemonRequestDispatchError('invalidRequest', `${verb} requires at least one selector.`);
      }
      return { verb, selectors };
    }
    default:
      throw new DaemonRequestDispatchError(
        'invalidRequest', 'Usage: daemon graph show|status|scope-in|scope-out|invalidate|watch|pause|resume'
      );
  }
}

/** Resolve every selector before applying any change; project names and operation IDs are exact. */
export function selectDaemonGraphOperations(
  request: IDaemonGraphRequest,
  graph: IOperationGraph
): ReadonlySet<Operation> {
  const selected: Set<Operation> = new Set();
  for (const { kind, value } of request.selectors) {
    let found: boolean = false;
    for (const operation of graph.operations) {
      const candidate: string = kind === '--operation' ? operation.name : operation.associatedProject.packageName;
      if (candidate === value) {
        selected.add(operation);
        found = true;
      }
    }
    if (!found) throw new DaemonRequestDispatchError('invalidRequest', `Unknown graph selector ${kind} ${value}.`);
  }
  if (request.verb === 'scope-out') {
    // Native safe-disable prunes unused dependencies but retains dependencies of enabled consumers.
    // Include the consumers being scoped out so they cannot keep the requested operation enabled.
    for (const operation of selected) {
      for (const consumer of operation.consumers) selected.add(consumer);
    }
  }
  return selected;
}
