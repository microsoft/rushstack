// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ReporterJsonValue } from '../events/ReporterJsonValue';
import type { ReporterPrivacyClassification } from '../events/ReporterPrivacyClassification';

/**
 * A diagnostic parameter value paired with its own privacy classification.
 *
 * @remarks
 * Field-level classification is authoritative. Reporters and telemetry decide,
 * per destination, whether an individual value may be rendered based on its
 * `privacy`, independent of the enclosing event's envelope classification.
 *
 * @beta
 */
export interface IClassifiedDiagnosticValue {
  /**
   * The JSON-serializable value.
   */
  readonly value: ReporterJsonValue;

  /**
   * The privacy classification of this value.
   */
  readonly privacy: ReporterPrivacyClassification;
}
