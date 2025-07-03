// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This package is used to manage debug certificates for development servers.
 *
 * This package provides the following utilities:
 *
 * - `CertificateStore` to handle retrieving and saving a debug certificate.
 *
 * - `CertificateManager` is a utility class containing the following public methods:
 *
 * - `ensureCertificate` will find or optionally create a debug certificate and trust it.
 *
 * - `untrustCertificate` will untrust a debug certificate.
 *
 * @packageDocumentation
 */

export {
  type ICertificate,
  CertificateManager,
  type ICertificateGenerationOptions,
  type ICertificateManagerOptions,
  type ICertificateValidationResult,
  DEFAULT_CERTIFICATE_SUBJECT_NAMES
} from './CertificateManager';
export { CertificateStore, type ICertificateStoreOptions } from './CertificateStore';
