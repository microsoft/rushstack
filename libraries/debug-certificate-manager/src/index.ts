// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This package is used to manage debug certificates for development servers.
 * It is used by
 * [\@microsoft/gulp-core-build-serve](https://www.npmjs.com/package/\@microsoft/gulp-core-build-serve)
 * to generate and trust a certificate when HTTPS is turned on.
 *
 * This package provides the following utilities:
 * - `CertificateStore` to handle retrieving and saving a debug certificate.
 * - `CertificateManager` is a utility class containing the following public methods:
 * | - `ensureCertificate` will find or optionally create a debug certificate and trust it.
 * | - `untrustCertificate` will untrust a debug certificate.
 *
 * @packageDocumentation
 */

export { ICertificate, CertificateManager } from './CertificateManager';
export { CertificateStore } from './CertificateStore';
