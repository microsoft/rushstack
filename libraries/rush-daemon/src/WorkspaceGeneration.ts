// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { randomUUID } from 'node:crypto';

import type { IWorkspaceSession } from './WorkspaceSession';

const TOKENS: WeakMap<IWorkspaceSession, string> = new WeakMap();

/** An opaque token that changes with both in-process generations and process restarts. @beta */
export function getWorkspaceGenerationToken(session: IWorkspaceSession): string {
  let token: string | undefined = TOKENS.get(session);
  if (!token) {
    token = randomUUID();
    TOKENS.set(session, token);
  }
  return token;
}
