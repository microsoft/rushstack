// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Classifies how sensitive a value is, and therefore which destinations may receive it.
 *
 * @remarks
 * - `public` values may be written to any destination, including telemetry.
 * - `local-sensitive` values may appear in local reporter output such as the
 *   full-detail log, but never in telemetry.
 * - `secret` values must never reach any local log or telemetry.
 *
 * Individual diagnostic fields carry their own classification. On an event
 * envelope this value is the minimum classification floor for every field in
 * that event.
 *
 * @beta
 */
export type ReporterPrivacyClassification = 'public' | 'local-sensitive' | 'secret';
