// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as crypto from 'crypto';
import { RushConstants } from '../RushConstants';
import { Operation } from './Operation';

/**
 * @alpha
 */
export interface IOperationHashes {
  /**
   * Hash of tracked input files
   */
  localHash: string;

  /**
   * Sorted `fullHash` values of dependencies.
   */
  dependencyHashes: string[];

  /**
   * Hash of operation configuration options
   */
  configHash: string;

  /**
   * The final state hash used for change detection and caching.
   * Computed from all other properties.
   */
  fullHash: string;
}

/**
 * Computes an operation's state hashes, for use by the caching layer.
 * @param operation - The operation to compute hashes for
 * @param localHash - The hash of the local file inputs for the operation
 * @param dependencyHashes - The full state hashes of the operation's dependencies
 * @alpha
 */
export function getOperationHashes(
  operation: Operation,
  localHash: string,
  dependencyHashes: string[]
): IOperationHashes {
  const configHash: string = getConfigHash(operation);
  const fullHash: string = getFullOperationHash(configHash, localHash, dependencyHashes);

  return {
    configHash,
    localHash,
    dependencyHashes,
    fullHash
  };
}

function getConfigHash(operation: Operation): string {
  const configHasher: crypto.Hash = crypto.createHash('sha1');
  configHasher.update(`${RushConstants.buildCacheVersion}`);
  configHasher.update(RushConstants.hashDelimiter);

  // Output folder names are part of the configuration, so include in hash
  for (const outputFolder of operation.outputFolderNames) {
    configHasher.update(outputFolder);
    configHasher.update(RushConstants.hashDelimiter);
  }

  // CLI parameters that apply to the phase affect the result
  const params: string[] = [];
  for (const tsCommandLineParameter of operation.associatedPhase.associatedParameters) {
    tsCommandLineParameter.appendToArgList(params);
  }
  configHasher.update(params.join(' '));
  const configHash: string = configHasher.digest('base64');

  return configHash;
}

function getFullOperationHash(configHash: string, localHash: string, dependencyHashes: string[]): string {
  if (!localHash) {
    return '';
  }

  for (const dependencyHash of dependencyHashes) {
    if (!dependencyHash) {
      return '';
    }
  }

  const hash: crypto.Hash = crypto.createHash('sha1');
  hash.update(configHash);
  hash.update(localHash);

  const sortedHashes: string[] = dependencyHashes.sort();
  for (const dependencyHash of sortedHashes) {
    hash.update(dependencyHash);
    hash.update(RushConstants.hashDelimiter);
  }
  return hash.digest('hex');
}
