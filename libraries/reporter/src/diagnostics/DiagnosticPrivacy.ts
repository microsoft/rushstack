// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ReporterPrivacyClassification } from '../events/ReporterPrivacyClassification';

const PRIVACY_RANK: { readonly [classification in ReporterPrivacyClassification]: number } = {
  public: 0,
  'local-sensitive': 1,
  secret: 2
};

const RANK_TO_CLASSIFICATION: readonly ReporterPrivacyClassification[] = [
  'public',
  'local-sensitive',
  'secret'
];

/**
 * Returns the sensitivity rank of a privacy classification, where a larger
 * number is more sensitive.
 *
 * @remarks
 * `public` is `0`, `local-sensitive` is `1`, and `secret` is `2`.
 *
 * @beta
 */
export function getPrivacyClassificationRank(classification: ReporterPrivacyClassification): number {
  return PRIVACY_RANK[classification];
}

/**
 * Computes the envelope privacy floor for a set of field classifications.
 *
 * @remarks
 * The envelope classification is the minimum classification floor for every
 * field in the event: every field is at least as sensitive as the returned
 * value. It is therefore the least sensitive classification present, or
 * `public` when no fields are provided. Field-level classification remains
 * authoritative for redaction; the floor is only a coarse lower bound.
 *
 * @param classifications - the privacy classifications of the event's fields
 *
 * @beta
 */
export function computeEnvelopePrivacyFloor(
  classifications: Iterable<ReporterPrivacyClassification>
): ReporterPrivacyClassification {
  let minRank: number = PRIVACY_RANK.secret;
  let sawAny: boolean = false;
  for (const classification of classifications) {
    sawAny = true;
    const rank: number = PRIVACY_RANK[classification];
    if (rank < minRank) {
      minRank = rank;
    }
  }
  if (!sawAny) {
    return 'public';
  }
  return RANK_TO_CLASSIFICATION[minRank];
}
