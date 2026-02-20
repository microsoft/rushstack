# Change Log - @rushstack/debug-certificate-manager

This log was last generated on Fri, 20 Feb 2026 00:15:04 GMT and should not be manually modified.

## 1.7.1
Fri, 20 Feb 2026 00:15:04 GMT

### Patches

- Add `"node"` condition before `"import"` in the `"exports"` map so that Node.js uses the CJS output (which handles extensionless imports), while bundlers still use ESM via `"import"`. Fixes https://github.com/microsoft/rushstack/issues/5644.

## 1.7.0
Thu, 19 Feb 2026 00:04:52 GMT

### Minor changes

- Normalize package layout. CommonJS is now under `lib-commonjs`, DTS is now under `lib-dts`, and ESM is now under `lib-esm`. Imports to `lib` still work as before, handled by the `"exports"` field in `package.json`.

## 1.6.14
Sat, 07 Feb 2026 01:13:26 GMT

_Version update only_

## 1.6.13
Wed, 04 Feb 2026 20:42:47 GMT

_Version update only_

## 1.6.12
Wed, 04 Feb 2026 16:13:27 GMT

_Version update only_

## 1.6.11
Fri, 30 Jan 2026 01:16:13 GMT

_Version update only_

## 1.6.10
Thu, 08 Jan 2026 01:12:30 GMT

_Version update only_

## 1.6.9
Wed, 07 Jan 2026 01:12:24 GMT

_Version update only_

## 1.6.8
Mon, 05 Jan 2026 16:12:49 GMT

_Version update only_

## 1.6.7
Sat, 06 Dec 2025 01:12:28 GMT

_Version update only_

## 1.6.6
Fri, 21 Nov 2025 16:13:56 GMT

_Version update only_

## 1.6.5
Wed, 12 Nov 2025 01:12:56 GMT

_Version update only_

## 1.6.4
Tue, 04 Nov 2025 08:15:14 GMT

_Version update only_

## 1.6.3
Fri, 24 Oct 2025 00:13:38 GMT

_Version update only_

## 1.6.2
Wed, 22 Oct 2025 00:57:54 GMT

_Version update only_

## 1.6.1
Wed, 08 Oct 2025 00:13:28 GMT

### Patches

- Add support for the IPv6 localhost address (`::1`).

## 1.6.0
Fri, 03 Oct 2025 20:09:59 GMT

### Minor changes

- Normalize import of builtin modules to use the `node:` protocol.

## 1.5.9
Tue, 30 Sep 2025 23:57:45 GMT

_Version update only_

## 1.5.8
Tue, 30 Sep 2025 20:33:50 GMT

### Patches

- Add message to use VS Code extension to errors.

## 1.5.7
Fri, 12 Sep 2025 15:13:07 GMT

_Version update only_

## 1.5.6
Thu, 11 Sep 2025 00:22:31 GMT

_Version update only_

## 1.5.5
Fri, 29 Aug 2025 00:08:01 GMT

### Patches

- Fix homedir resolution in CertificateStore

## 1.5.4
Tue, 26 Aug 2025 00:12:57 GMT

### Patches

- Fix handling of home directory paths when reading debug-certificate-manager.json config file.

## 1.5.3
Tue, 19 Aug 2025 20:45:02 GMT

_Version update only_

## 1.5.2
Fri, 01 Aug 2025 00:12:48 GMT

_Version update only_

## 1.5.1
Sat, 26 Jul 2025 00:12:22 GMT

### Patches

- Read CertificateStore configuration from .vscode/debug-certificate-manager.json

## 1.5.0
Wed, 23 Jul 2025 20:55:57 GMT

### Minor changes

- CertificateStore - Add params to support custom paths and filenames
- CertificateManager - Update `untrustCertificateAsync` to clear `caCertificateData`
- CertificateManager - Use osascript (applescript) to run elevated command on macOS instead of sudo package.
- CertificateManager - Expose `getCertificateExpirationAsync` method to retrieve certificate expiration date

## 1.4.37
Sat, 21 Jun 2025 00:13:15 GMT

_Version update only_

## 1.4.36
Tue, 13 May 2025 02:09:20 GMT

_Version update only_

## 1.4.35
Thu, 01 May 2025 15:11:33 GMT

_Version update only_

## 1.4.34
Thu, 01 May 2025 00:11:12 GMT

_Version update only_

## 1.4.33
Fri, 25 Apr 2025 00:11:32 GMT

_Version update only_

## 1.4.32
Mon, 21 Apr 2025 22:24:25 GMT

_Version update only_

## 1.4.31
Thu, 17 Apr 2025 00:11:21 GMT

_Version update only_

## 1.4.30
Tue, 15 Apr 2025 15:11:57 GMT

_Version update only_

## 1.4.29
Wed, 09 Apr 2025 00:11:03 GMT

_Version update only_

## 1.4.28
Fri, 04 Apr 2025 18:34:35 GMT

_Version update only_

## 1.4.27
Tue, 25 Mar 2025 15:11:15 GMT

_Version update only_

## 1.4.26
Wed, 12 Mar 2025 22:41:36 GMT

_Version update only_

## 1.4.25
Wed, 12 Mar 2025 00:11:31 GMT

_Version update only_

## 1.4.24
Tue, 11 Mar 2025 02:12:33 GMT

_Version update only_

## 1.4.23
Tue, 11 Mar 2025 00:11:25 GMT

_Version update only_

## 1.4.22
Sat, 01 Mar 2025 05:00:09 GMT

_Version update only_

## 1.4.21
Thu, 27 Feb 2025 01:10:39 GMT

_Version update only_

## 1.4.20
Wed, 26 Feb 2025 16:11:11 GMT

_Version update only_

## 1.4.19
Sat, 22 Feb 2025 01:11:12 GMT

_Version update only_

## 1.4.18
Wed, 19 Feb 2025 18:53:48 GMT

_Version update only_

## 1.4.17
Wed, 12 Feb 2025 01:10:52 GMT

_Version update only_

## 1.4.16
Thu, 30 Jan 2025 16:10:36 GMT

_Version update only_

## 1.4.15
Thu, 30 Jan 2025 01:11:42 GMT

_Version update only_

## 1.4.14
Thu, 09 Jan 2025 01:10:10 GMT

_Version update only_

## 1.4.13
Tue, 07 Jan 2025 22:17:32 GMT

_Version update only_

## 1.4.12
Sat, 14 Dec 2024 01:11:07 GMT

_Version update only_

## 1.4.11
Mon, 09 Dec 2024 20:31:43 GMT

_Version update only_

## 1.4.10
Tue, 03 Dec 2024 16:11:07 GMT

_Version update only_

## 1.4.9
Sat, 23 Nov 2024 01:18:55 GMT

_Version update only_

## 1.4.8
Fri, 22 Nov 2024 01:10:43 GMT

_Version update only_

## 1.4.7
Thu, 24 Oct 2024 00:15:47 GMT

_Version update only_

## 1.4.6
Mon, 21 Oct 2024 18:50:10 GMT

_Version update only_

## 1.4.5
Thu, 17 Oct 2024 08:35:06 GMT

_Version update only_

## 1.4.4
Tue, 15 Oct 2024 00:12:31 GMT

_Version update only_

## 1.4.3
Wed, 02 Oct 2024 00:11:19 GMT

_Version update only_

## 1.4.2
Tue, 01 Oct 2024 00:11:28 GMT

_Version update only_

## 1.4.1
Mon, 30 Sep 2024 15:12:19 GMT

_Version update only_

## 1.4.0
Sat, 21 Sep 2024 00:10:27 GMT

### Minor changes

- Add a `skipCertificateTrust` option to `CertificateManager.ensureCertificateAsync` that skips automatically trusting the generated certificate and untrusting an existing certificate with issues.

## 1.3.66
Fri, 13 Sep 2024 00:11:42 GMT

_Version update only_

## 1.3.65
Tue, 10 Sep 2024 20:08:11 GMT

_Version update only_

## 1.3.64
Wed, 21 Aug 2024 05:43:04 GMT

_Version update only_

## 1.3.63
Mon, 12 Aug 2024 22:16:04 GMT

_Version update only_

## 1.3.62
Fri, 02 Aug 2024 17:26:42 GMT

_Version update only_

## 1.3.61
Sat, 27 Jul 2024 00:10:27 GMT

### Patches

- Include CHANGELOG.md in published releases again

## 1.3.60
Wed, 24 Jul 2024 00:12:14 GMT

_Version update only_

## 1.3.59
Wed, 17 Jul 2024 06:55:09 GMT

_Version update only_

## 1.3.58
Wed, 17 Jul 2024 00:11:19 GMT

_Version update only_

## 1.3.57
Tue, 16 Jul 2024 00:36:21 GMT

_Version update only_

## 1.3.56
Thu, 27 Jun 2024 21:01:36 GMT

_Version update only_

## 1.3.55
Mon, 03 Jun 2024 23:43:15 GMT

_Version update only_

## 1.3.54
Thu, 30 May 2024 00:13:05 GMT

### Patches

- Include missing `type` modifiers on type-only exports.

## 1.3.53
Wed, 29 May 2024 02:03:50 GMT

_Version update only_

## 1.3.52
Wed, 29 May 2024 00:10:52 GMT

_Version update only_

## 1.3.51
Tue, 28 May 2024 15:10:09 GMT

_Version update only_

## 1.3.50
Tue, 28 May 2024 00:09:47 GMT

_Version update only_

## 1.3.49
Sat, 25 May 2024 04:54:07 GMT

_Version update only_

## 1.3.48
Fri, 24 May 2024 00:15:08 GMT

_Version update only_

## 1.3.47
Thu, 23 May 2024 02:26:56 GMT

### Patches

- Fix an issue where the task could report success if the subprocess was terminated by a signal

## 1.3.46
Thu, 16 May 2024 15:10:22 GMT

_Version update only_

## 1.3.45
Wed, 15 May 2024 23:42:58 GMT

_Version update only_

## 1.3.44
Wed, 15 May 2024 06:04:17 GMT

_Version update only_

## 1.3.43
Fri, 10 May 2024 05:33:33 GMT

_Version update only_

## 1.3.42
Wed, 08 May 2024 22:23:50 GMT

_Version update only_

## 1.3.41
Mon, 06 May 2024 15:11:04 GMT

_Version update only_

## 1.3.40
Wed, 10 Apr 2024 15:10:09 GMT

_Version update only_

## 1.3.39
Tue, 19 Mar 2024 15:10:18 GMT

_Version update only_

## 1.3.38
Fri, 15 Mar 2024 00:12:40 GMT

_Version update only_

## 1.3.37
Tue, 05 Mar 2024 01:19:24 GMT

_Version update only_

## 1.3.36
Sun, 03 Mar 2024 20:58:13 GMT

_Version update only_

## 1.3.35
Sat, 02 Mar 2024 02:22:24 GMT

_Version update only_

## 1.3.34
Fri, 01 Mar 2024 01:10:08 GMT

_Version update only_

## 1.3.33
Thu, 29 Feb 2024 07:11:45 GMT

_Version update only_

## 1.3.32
Wed, 28 Feb 2024 16:09:27 GMT

_Version update only_

## 1.3.31
Sat, 24 Feb 2024 23:02:51 GMT

_Version update only_

## 1.3.30
Thu, 22 Feb 2024 01:36:09 GMT

_Version update only_

## 1.3.29
Wed, 21 Feb 2024 21:45:28 GMT

_Version update only_

## 1.3.28
Wed, 21 Feb 2024 08:55:47 GMT

_Version update only_

## 1.3.27
Tue, 20 Feb 2024 21:45:10 GMT

_Version update only_

## 1.3.26
Tue, 20 Feb 2024 16:10:52 GMT

_Version update only_

## 1.3.25
Mon, 19 Feb 2024 21:54:26 GMT

_Version update only_

## 1.3.24
Sat, 17 Feb 2024 06:24:34 GMT

### Patches

- Fix broken link to API documentation

## 1.3.23
Thu, 08 Feb 2024 01:09:21 GMT

_Version update only_

## 1.3.22
Wed, 07 Feb 2024 01:11:18 GMT

_Version update only_

## 1.3.21
Mon, 05 Feb 2024 23:46:52 GMT

_Version update only_

## 1.3.20
Thu, 25 Jan 2024 01:09:30 GMT

_Version update only_

## 1.3.19
Tue, 23 Jan 2024 20:12:57 GMT

_Version update only_

## 1.3.18
Tue, 23 Jan 2024 16:15:05 GMT

_Version update only_

## 1.3.17
Tue, 16 Jan 2024 18:30:11 GMT

_Version update only_

## 1.3.16
Wed, 03 Jan 2024 00:31:18 GMT

_Version update only_

## 1.3.15
Wed, 20 Dec 2023 01:09:45 GMT

_Version update only_

## 1.3.14
Thu, 07 Dec 2023 03:44:13 GMT

_Version update only_

## 1.3.13
Tue, 05 Dec 2023 01:10:16 GMT

_Version update only_

## 1.3.12
Fri, 10 Nov 2023 18:02:04 GMT

_Version update only_

## 1.3.11
Wed, 01 Nov 2023 23:11:35 GMT

### Patches

- Fix line endings in published package.

## 1.3.10
Mon, 30 Oct 2023 23:36:37 GMT

_Version update only_

## 1.3.9
Sun, 01 Oct 2023 02:56:29 GMT

_Version update only_

## 1.3.8
Sat, 30 Sep 2023 00:20:51 GMT

_Version update only_

## 1.3.7
Thu, 28 Sep 2023 20:53:17 GMT

_Version update only_

## 1.3.6
Wed, 27 Sep 2023 00:21:38 GMT

_Version update only_

## 1.3.5
Tue, 26 Sep 2023 21:02:30 GMT

_Version update only_

## 1.3.4
Tue, 26 Sep 2023 09:30:33 GMT

### Patches

- Update type-only imports to include the type modifier.

## 1.3.3
Mon, 25 Sep 2023 23:38:28 GMT

_Version update only_

## 1.3.2
Fri, 22 Sep 2023 00:05:50 GMT

_Version update only_

## 1.3.1
Tue, 19 Sep 2023 15:21:52 GMT

_Version update only_

## 1.3.0
Fri, 15 Sep 2023 00:36:58 GMT

### Minor changes

- Update @types/node from 14 to 18

## 1.2.56
Wed, 13 Sep 2023 00:32:29 GMT

### Patches

- Fixes issues with CertificateManager when setting the certificate friendly name fails.

## 1.2.55
Tue, 08 Aug 2023 07:10:39 GMT

_Version update only_

## 1.2.54
Mon, 31 Jul 2023 15:19:05 GMT

_Version update only_

## 1.2.53
Sat, 29 Jul 2023 00:22:50 GMT

_Version update only_

## 1.2.52
Thu, 20 Jul 2023 20:47:28 GMT

_Version update only_

## 1.2.51
Wed, 19 Jul 2023 00:20:31 GMT

_Version update only_

## 1.2.50
Fri, 14 Jul 2023 15:20:45 GMT

_Version update only_

## 1.2.49
Thu, 13 Jul 2023 00:22:37 GMT

_Version update only_

## 1.2.48
Wed, 12 Jul 2023 15:20:39 GMT

_Version update only_

## 1.2.47
Wed, 12 Jul 2023 00:23:29 GMT

_Version update only_

## 1.2.46
Fri, 07 Jul 2023 00:19:32 GMT

_Version update only_

## 1.2.45
Thu, 06 Jul 2023 00:16:19 GMT

_Version update only_

## 1.2.44
Tue, 04 Jul 2023 00:18:47 GMT

_Version update only_

## 1.2.43
Mon, 19 Jun 2023 22:40:21 GMT

_Version update only_

## 1.2.42
Thu, 15 Jun 2023 00:21:01 GMT

_Version update only_

## 1.2.41
Wed, 14 Jun 2023 00:19:42 GMT

_Version update only_

## 1.2.40
Tue, 13 Jun 2023 15:17:20 GMT

_Version update only_

## 1.2.39
Tue, 13 Jun 2023 01:49:02 GMT

_Version update only_

## 1.2.38
Fri, 09 Jun 2023 18:05:35 GMT

_Version update only_

## 1.2.37
Fri, 09 Jun 2023 15:23:15 GMT

_Version update only_

## 1.2.36
Fri, 09 Jun 2023 00:19:49 GMT

_Version update only_

## 1.2.35
Thu, 08 Jun 2023 15:21:17 GMT

_Version update only_

## 1.2.34
Thu, 08 Jun 2023 00:20:02 GMT

_Version update only_

## 1.2.33
Wed, 07 Jun 2023 22:45:17 GMT

_Version update only_

## 1.2.32
Tue, 06 Jun 2023 02:52:51 GMT

_Version update only_

## 1.2.31
Mon, 05 Jun 2023 21:45:21 GMT

_Version update only_

## 1.2.30
Fri, 02 Jun 2023 02:01:12 GMT

_Version update only_

## 1.2.29
Mon, 29 May 2023 15:21:15 GMT

_Version update only_

## 1.2.28
Wed, 24 May 2023 00:19:12 GMT

### Patches

- Add environment variable to force disable certificate generation. Correctly encode 127.0.0.1 as an IP Address in subjectAltNames field during certificate generation.

## 1.2.27
Mon, 22 May 2023 06:34:33 GMT

_Version update only_

## 1.2.26
Fri, 12 May 2023 00:23:05 GMT

_Version update only_

## 1.2.25
Thu, 04 May 2023 00:20:28 GMT

_Version update only_

## 1.2.24
Mon, 01 May 2023 15:23:19 GMT

_Version update only_

## 1.2.23
Sat, 29 Apr 2023 00:23:02 GMT

_Version update only_

## 1.2.22
Thu, 27 Apr 2023 17:18:42 GMT

_Version update only_

## 1.2.21
Mon, 17 Apr 2023 15:21:31 GMT

### Patches

- Include "rushstack.localhost" and "127.0.0.1" in the default certificate subjects.

## 1.2.20
Tue, 04 Apr 2023 22:36:28 GMT

_Version update only_

## 1.2.19
Mon, 20 Mar 2023 20:14:20 GMT

### Patches

- Force certificates with a validity period longer than the expected validity period to be refreshed.

## 1.2.18
Sat, 18 Mar 2023 00:20:56 GMT

_Version update only_

## 1.2.17
Fri, 03 Mar 2023 04:11:20 GMT

### Patches

- Fix an issue where certificate expiration was calculated incorrectly and certificates were set to expire too late.

## 1.2.16
Fri, 10 Feb 2023 01:18:50 GMT

_Version update only_

## 1.2.15
Sun, 05 Feb 2023 03:02:02 GMT

_Version update only_

## 1.2.14
Wed, 01 Feb 2023 02:16:34 GMT

_Version update only_

## 1.2.13
Mon, 30 Jan 2023 16:22:31 GMT

_Version update only_

## 1.2.12
Mon, 30 Jan 2023 00:55:44 GMT

_Version update only_

## 1.2.11
Thu, 26 Jan 2023 02:55:10 GMT

_Version update only_

## 1.2.10
Wed, 25 Jan 2023 07:26:55 GMT

_Version update only_

## 1.2.9
Wed, 18 Jan 2023 22:44:12 GMT

_Version update only_

## 1.2.8
Tue, 20 Dec 2022 01:18:22 GMT

_Version update only_

## 1.2.7
Fri, 09 Dec 2022 16:18:28 GMT

_Version update only_

## 1.2.6
Tue, 29 Nov 2022 01:16:49 GMT

_Version update only_

## 1.2.5
Fri, 18 Nov 2022 00:55:17 GMT

### Patches

- Reduce default certificate validity period to 365 days. Check certificate validity period as part of validating the existing certificate.

## 1.2.4
Sat, 12 Nov 2022 00:16:31 GMT

### Patches

- Mark X.509 issuerAltName extension non-critical, since Firefox doesn't understand it.

## 1.2.3
Tue, 08 Nov 2022 01:20:55 GMT

_Version update only_

## 1.2.2
Fri, 04 Nov 2022 00:15:59 GMT

### Patches

- Remove usage of Import.lazy so that the tool can be bundled.

## 1.2.1
Wed, 26 Oct 2022 00:16:16 GMT

_Version update only_

## 1.2.0
Tue, 25 Oct 2022 00:20:44 GMT

### Minor changes

- Support custom certificate subjects and validity period.
- Generate and trust a separate CA certificate, use that to generate the TLS certificate, then destroy the private key for the CA certificate.

## 1.1.84
Mon, 17 Oct 2022 22:14:21 GMT

_Version update only_

## 1.1.83
Mon, 17 Oct 2022 15:16:00 GMT

_Version update only_

## 1.1.82
Fri, 14 Oct 2022 15:26:32 GMT

_Version update only_

## 1.1.81
Thu, 13 Oct 2022 00:20:15 GMT

_Version update only_

## 1.1.80
Tue, 11 Oct 2022 23:49:12 GMT

_Version update only_

## 1.1.79
Mon, 10 Oct 2022 15:23:44 GMT

_Version update only_

## 1.1.78
Thu, 29 Sep 2022 07:13:06 GMT

_Version update only_

## 1.1.77
Tue, 27 Sep 2022 22:17:20 GMT

_Version update only_

## 1.1.76
Wed, 21 Sep 2022 20:21:10 GMT

_Version update only_

## 1.1.75
Thu, 15 Sep 2022 00:18:51 GMT

_Version update only_

## 1.1.74
Tue, 13 Sep 2022 00:16:55 GMT

_Version update only_

## 1.1.73
Mon, 12 Sep 2022 22:27:48 GMT

_Version update only_

## 1.1.72
Fri, 02 Sep 2022 17:48:43 GMT

_Version update only_

## 1.1.71
Wed, 31 Aug 2022 01:45:06 GMT

_Version update only_

## 1.1.70
Wed, 31 Aug 2022 00:42:46 GMT

_Version update only_

## 1.1.69
Wed, 24 Aug 2022 03:01:22 GMT

_Version update only_

## 1.1.68
Wed, 24 Aug 2022 00:14:38 GMT

_Version update only_

## 1.1.67
Fri, 19 Aug 2022 00:17:19 GMT

_Version update only_

## 1.1.66
Wed, 10 Aug 2022 09:52:12 GMT

_Version update only_

## 1.1.65
Wed, 10 Aug 2022 08:12:16 GMT

_Version update only_

## 1.1.64
Wed, 03 Aug 2022 18:40:35 GMT

_Version update only_

## 1.1.63
Mon, 01 Aug 2022 02:45:32 GMT

_Version update only_

## 1.1.62
Thu, 21 Jul 2022 23:30:27 GMT

_Version update only_

## 1.1.61
Thu, 21 Jul 2022 00:16:14 GMT

_Version update only_

## 1.1.60
Wed, 13 Jul 2022 21:31:13 GMT

### Patches

- Upgrade node-forge to 1.3.1

## 1.1.59
Fri, 08 Jul 2022 15:17:46 GMT

_Version update only_

## 1.1.58
Mon, 04 Jul 2022 15:15:13 GMT

_Version update only_

## 1.1.57
Thu, 30 Jun 2022 04:48:53 GMT

_Version update only_

## 1.1.56
Tue, 28 Jun 2022 22:47:13 GMT

_Version update only_

## 1.1.55
Tue, 28 Jun 2022 00:23:32 GMT

_Version update only_

## 1.1.54
Mon, 27 Jun 2022 18:43:09 GMT

_Version update only_

## 1.1.53
Sat, 25 Jun 2022 21:00:40 GMT

_Version update only_

## 1.1.52
Sat, 25 Jun 2022 01:54:29 GMT

_Version update only_

## 1.1.51
Fri, 24 Jun 2022 07:16:47 GMT

_Version update only_

## 1.1.50
Thu, 23 Jun 2022 22:14:24 GMT

_Version update only_

## 1.1.49
Fri, 17 Jun 2022 09:17:54 GMT

_Version update only_

## 1.1.48
Fri, 17 Jun 2022 00:16:18 GMT

_Version update only_

## 1.1.47
Tue, 07 Jun 2022 09:37:04 GMT

_Version update only_

## 1.1.46
Wed, 25 May 2022 22:25:07 GMT

_Version update only_

## 1.1.45
Thu, 19 May 2022 15:13:20 GMT

_Version update only_

## 1.1.44
Sat, 14 May 2022 03:01:27 GMT

_Version update only_

## 1.1.43
Tue, 10 May 2022 01:20:43 GMT

_Version update only_

## 1.1.42
Wed, 04 May 2022 23:29:13 GMT

_Version update only_

## 1.1.41
Tue, 26 Apr 2022 00:10:15 GMT

_Version update only_

## 1.1.40
Sat, 23 Apr 2022 02:13:06 GMT

_Version update only_

## 1.1.39
Fri, 15 Apr 2022 00:12:36 GMT

_Version update only_

## 1.1.38
Wed, 13 Apr 2022 15:12:40 GMT

_Version update only_

## 1.1.37
Tue, 12 Apr 2022 23:29:34 GMT

_Version update only_

## 1.1.36
Tue, 12 Apr 2022 02:58:32 GMT

_Version update only_

## 1.1.35
Sat, 09 Apr 2022 19:07:48 GMT

_Version update only_

## 1.1.34
Sat, 09 Apr 2022 02:24:26 GMT

### Patches

- Rename the "master" branch to "main".

## 1.1.33
Fri, 08 Apr 2022 20:05:59 GMT

_Version update only_

## 1.1.32
Wed, 06 Apr 2022 22:35:23 GMT

_Version update only_

## 1.1.31
Thu, 31 Mar 2022 02:06:05 GMT

_Version update only_

## 1.1.30
Sat, 19 Mar 2022 08:05:37 GMT

_Version update only_

## 1.1.29
Tue, 15 Mar 2022 19:15:53 GMT

_Version update only_

## 1.1.28
Fri, 11 Feb 2022 10:30:25 GMT

_Version update only_

## 1.1.27
Tue, 25 Jan 2022 01:11:07 GMT

_Version update only_

## 1.1.26
Fri, 21 Jan 2022 01:10:41 GMT

_Version update only_

## 1.1.25
Thu, 20 Jan 2022 02:43:46 GMT

_Version update only_

## 1.1.24
Thu, 06 Jan 2022 08:49:34 GMT

### Patches

- Fix an incorrect argument passed to the command to repair the certificate store on Windows.

## 1.1.23
Wed, 05 Jan 2022 16:07:47 GMT

_Version update only_

## 1.1.22
Mon, 27 Dec 2021 16:10:40 GMT

_Version update only_

## 1.1.21
Tue, 14 Dec 2021 19:27:51 GMT

_Version update only_

## 1.1.20
Thu, 09 Dec 2021 20:34:41 GMT

_Version update only_

## 1.1.19
Thu, 09 Dec 2021 00:21:54 GMT

_Version update only_

## 1.1.18
Wed, 08 Dec 2021 19:05:08 GMT

_Version update only_

## 1.1.17
Wed, 08 Dec 2021 16:14:05 GMT

_Version update only_

## 1.1.16
Mon, 06 Dec 2021 16:08:33 GMT

_Version update only_

## 1.1.15
Fri, 03 Dec 2021 03:05:22 GMT

_Version update only_

## 1.1.14
Tue, 30 Nov 2021 20:18:41 GMT

_Version update only_

## 1.1.13
Mon, 29 Nov 2021 07:26:16 GMT

_Version update only_

## 1.1.12
Tue, 09 Nov 2021 16:08:07 GMT

### Patches

- Fix a bug where ensureCertificateAsync would assume a previously generated certificate was trusted.

## 1.1.11
Sat, 06 Nov 2021 00:09:13 GMT

_Version update only_

## 1.1.10
Fri, 05 Nov 2021 15:09:18 GMT

_Version update only_

## 1.1.9
Thu, 28 Oct 2021 00:08:22 GMT

_Version update only_

## 1.1.8
Wed, 27 Oct 2021 00:08:15 GMT

### Patches

- Update the package.json repository field to include the directory property.

## 1.1.7
Wed, 13 Oct 2021 15:09:54 GMT

_Version update only_

## 1.1.6
Fri, 08 Oct 2021 09:35:07 GMT

_Version update only_

## 1.1.5
Fri, 08 Oct 2021 08:08:34 GMT

_Version update only_

## 1.1.4
Thu, 07 Oct 2021 23:43:12 GMT

_Version update only_

## 1.1.3
Thu, 07 Oct 2021 07:13:35 GMT

_Version update only_

## 1.1.2
Wed, 06 Oct 2021 15:08:26 GMT

_Version update only_

## 1.1.1
Wed, 06 Oct 2021 02:41:48 GMT

_Version update only_

## 1.1.0
Tue, 05 Oct 2021 15:08:37 GMT

### Minor changes

- Use ITerminal instead of Terminal to allow for compatibility with other versions of @rushstack/node-core-library.

## 1.0.71
Mon, 04 Oct 2021 15:10:18 GMT

_Version update only_

## 1.0.70
Fri, 24 Sep 2021 00:09:29 GMT

_Version update only_

## 1.0.69
Thu, 23 Sep 2021 00:10:40 GMT

_Version update only_

## 1.0.68
Wed, 22 Sep 2021 03:27:12 GMT

_Version update only_

## 1.0.67
Wed, 22 Sep 2021 00:09:32 GMT

_Version update only_

## 1.0.66
Sat, 18 Sep 2021 03:05:57 GMT

_Version update only_

## 1.0.65
Tue, 14 Sep 2021 01:17:04 GMT

_Version update only_

## 1.0.64
Mon, 13 Sep 2021 15:07:05 GMT

_Version update only_

## 1.0.63
Fri, 10 Sep 2021 15:08:28 GMT

_Version update only_

## 1.0.62
Wed, 08 Sep 2021 19:06:22 GMT

_Version update only_

## 1.0.61
Wed, 08 Sep 2021 00:08:03 GMT

_Version update only_

## 1.0.60
Fri, 03 Sep 2021 00:09:10 GMT

_Version update only_

## 1.0.59
Tue, 31 Aug 2021 00:07:11 GMT

_Version update only_

## 1.0.58
Fri, 27 Aug 2021 00:07:25 GMT

_Version update only_

## 1.0.57
Fri, 20 Aug 2021 15:08:10 GMT

_Version update only_

## 1.0.56
Fri, 13 Aug 2021 00:09:14 GMT

_Version update only_

## 1.0.55
Thu, 12 Aug 2021 18:11:18 GMT

_Version update only_

## 1.0.54
Thu, 12 Aug 2021 01:28:38 GMT

_Version update only_

## 1.0.53
Wed, 11 Aug 2021 23:14:17 GMT

_Version update only_

## 1.0.52
Wed, 11 Aug 2021 00:07:21 GMT

_Version update only_

## 1.0.51
Sat, 31 Jul 2021 00:52:11 GMT

_Version update only_

## 1.0.50
Tue, 27 Jul 2021 22:31:02 GMT

### Patches

- Update node-forge to version ~0.10.0.

## 1.0.49
Wed, 14 Jul 2021 15:06:29 GMT

_Version update only_

## 1.0.48
Tue, 13 Jul 2021 23:00:33 GMT

_Version update only_

## 1.0.47
Mon, 12 Jul 2021 23:08:26 GMT

_Version update only_

## 1.0.46
Thu, 08 Jul 2021 23:41:17 GMT

_Version update only_

## 1.0.45
Thu, 08 Jul 2021 06:00:48 GMT

_Version update only_

## 1.0.44
Thu, 01 Jul 2021 15:08:27 GMT

_Version update only_

## 1.0.43
Wed, 30 Jun 2021 19:16:19 GMT

_Version update only_

## 1.0.42
Wed, 30 Jun 2021 15:06:54 GMT

_Version update only_

## 1.0.41
Wed, 30 Jun 2021 01:37:17 GMT

_Version update only_

## 1.0.40
Fri, 25 Jun 2021 00:08:28 GMT

_Version update only_

## 1.0.39
Fri, 18 Jun 2021 06:23:05 GMT

_Version update only_

## 1.0.38
Wed, 16 Jun 2021 18:53:52 GMT

_Version update only_

## 1.0.37
Wed, 16 Jun 2021 15:07:24 GMT

_Version update only_

## 1.0.36
Tue, 15 Jun 2021 20:38:35 GMT

_Version update only_

## 1.0.35
Fri, 11 Jun 2021 23:26:16 GMT

_Version update only_

## 1.0.34
Fri, 11 Jun 2021 00:34:02 GMT

_Version update only_

## 1.0.33
Thu, 10 Jun 2021 15:08:16 GMT

_Version update only_

## 1.0.32
Fri, 04 Jun 2021 19:59:53 GMT

_Version update only_

## 1.0.31
Fri, 04 Jun 2021 15:08:20 GMT

_Version update only_

## 1.0.30
Fri, 04 Jun 2021 00:08:34 GMT

_Version update only_

## 1.0.29
Tue, 01 Jun 2021 18:29:26 GMT

_Version update only_

## 1.0.28
Sat, 29 May 2021 01:05:06 GMT

_Version update only_

## 1.0.27
Fri, 28 May 2021 06:19:58 GMT

_Version update only_

## 1.0.26
Tue, 25 May 2021 00:12:21 GMT

_Version update only_

## 1.0.25
Wed, 19 May 2021 00:11:39 GMT

_Version update only_

## 1.0.24
Thu, 13 May 2021 01:52:46 GMT

_Version update only_

## 1.0.23
Tue, 11 May 2021 22:19:17 GMT

_Version update only_

## 1.0.22
Mon, 03 May 2021 15:10:28 GMT

_Version update only_

## 1.0.21
Fri, 30 Apr 2021 00:30:52 GMT

### Patches

- Fix an issue where certmgr.exe sometimes could not be found on Windows.

## 1.0.20
Thu, 29 Apr 2021 23:26:50 GMT

_Version update only_

## 1.0.19
Thu, 29 Apr 2021 01:07:29 GMT

_Version update only_

## 1.0.18
Fri, 23 Apr 2021 22:00:07 GMT

_Version update only_

## 1.0.17
Fri, 23 Apr 2021 15:11:21 GMT

_Version update only_

## 1.0.16
Wed, 21 Apr 2021 15:12:28 GMT

_Version update only_

## 1.0.15
Tue, 20 Apr 2021 04:59:51 GMT

_Version update only_

## 1.0.14
Thu, 15 Apr 2021 02:59:25 GMT

_Version update only_

## 1.0.13
Mon, 12 Apr 2021 15:10:29 GMT

_Version update only_

## 1.0.12
Thu, 08 Apr 2021 20:41:54 GMT

_Version update only_

## 1.0.11
Thu, 08 Apr 2021 06:05:32 GMT

_Version update only_

## 1.0.10
Thu, 08 Apr 2021 00:10:18 GMT

_Version update only_

## 1.0.9
Tue, 06 Apr 2021 15:14:22 GMT

_Version update only_

## 1.0.8
Wed, 31 Mar 2021 15:10:36 GMT

_Version update only_

## 1.0.7
Mon, 29 Mar 2021 05:02:06 GMT

_Version update only_

## 1.0.6
Thu, 25 Mar 2021 04:57:54 GMT

### Patches

- Fix bug resolving the path of certutil.exe on Windows.

## 1.0.5
Fri, 19 Mar 2021 22:31:38 GMT

_Version update only_

## 1.0.4
Wed, 17 Mar 2021 05:04:38 GMT

_Version update only_

## 1.0.3
Fri, 12 Mar 2021 01:13:27 GMT

_Version update only_

## 1.0.2
Wed, 10 Mar 2021 06:23:29 GMT

_Version update only_

## 1.0.1
Wed, 10 Mar 2021 05:10:06 GMT

_Version update only_

## 1.0.0
Tue, 09 Mar 2021 23:31:46 GMT

### Breaking changes

- Make the trust/untrust APIs async.

## 0.2.113
Thu, 04 Mar 2021 01:11:31 GMT

_Version update only_

## 0.2.112
Tue, 02 Mar 2021 23:25:05 GMT

_Version update only_

## 0.2.111
Fri, 05 Feb 2021 16:10:42 GMT

_Version update only_

## 0.2.110
Fri, 22 Jan 2021 05:39:22 GMT

_Version update only_

## 0.2.109
Thu, 21 Jan 2021 04:19:00 GMT

_Version update only_

## 0.2.108
Wed, 13 Jan 2021 01:11:06 GMT

_Version update only_

## 0.2.107
Fri, 08 Jan 2021 07:28:50 GMT

_Version update only_

## 0.2.106
Wed, 06 Jan 2021 16:10:43 GMT

_Version update only_

## 0.2.105
Mon, 14 Dec 2020 16:12:21 GMT

_Version update only_

## 0.2.104
Thu, 10 Dec 2020 23:25:50 GMT

_Version update only_

## 0.2.103
Sat, 05 Dec 2020 01:11:23 GMT

_Version update only_

## 0.2.102
Tue, 01 Dec 2020 01:10:38 GMT

_Version update only_

## 0.2.101
Mon, 30 Nov 2020 16:11:50 GMT

_Version update only_

## 0.2.100
Wed, 18 Nov 2020 08:19:54 GMT

_Version update only_

## 0.2.99
Wed, 18 Nov 2020 06:21:58 GMT

_Version update only_

## 0.2.98
Tue, 17 Nov 2020 01:17:38 GMT

_Version update only_

## 0.2.97
Mon, 16 Nov 2020 01:57:58 GMT

_Version update only_

## 0.2.96
Fri, 13 Nov 2020 01:11:01 GMT

_Version update only_

## 0.2.95
Thu, 12 Nov 2020 01:11:10 GMT

_Version update only_

## 0.2.94
Wed, 11 Nov 2020 01:08:58 GMT

_Version update only_

## 0.2.93
Tue, 10 Nov 2020 23:13:11 GMT

_Version update only_

## 0.2.92
Tue, 10 Nov 2020 16:11:42 GMT

_Version update only_

## 0.2.91
Sun, 08 Nov 2020 22:52:49 GMT

_Version update only_

## 0.2.90
Fri, 06 Nov 2020 16:09:30 GMT

_Version update only_

## 0.2.89
Tue, 03 Nov 2020 01:11:18 GMT

_Version update only_

## 0.2.88
Mon, 02 Nov 2020 16:12:05 GMT

_Version update only_

## 0.2.87
Fri, 30 Oct 2020 06:38:39 GMT

_Version update only_

## 0.2.86
Fri, 30 Oct 2020 00:10:14 GMT

_Version update only_

## 0.2.85
Thu, 29 Oct 2020 06:14:19 GMT

_Version update only_

## 0.2.84
Thu, 29 Oct 2020 00:11:33 GMT

_Version update only_

## 0.2.83
Wed, 28 Oct 2020 01:18:03 GMT

_Version update only_

## 0.2.82
Tue, 27 Oct 2020 15:10:13 GMT

_Version update only_

## 0.2.81
Sat, 24 Oct 2020 00:11:19 GMT

_Version update only_

## 0.2.80
Wed, 21 Oct 2020 05:09:44 GMT

_Version update only_

## 0.2.79
Wed, 21 Oct 2020 02:28:17 GMT

_Version update only_

## 0.2.78
Fri, 16 Oct 2020 23:32:58 GMT

_Version update only_

## 0.2.77
Thu, 15 Oct 2020 00:59:08 GMT

_Version update only_

## 0.2.76
Wed, 14 Oct 2020 23:30:14 GMT

_Version update only_

## 0.2.75
Tue, 13 Oct 2020 15:11:28 GMT

_Version update only_

## 0.2.74
Mon, 12 Oct 2020 15:11:16 GMT

_Version update only_

## 0.2.73
Fri, 09 Oct 2020 15:11:09 GMT

_Version update only_

## 0.2.72
Tue, 06 Oct 2020 00:24:06 GMT

_Version update only_

## 0.2.71
Mon, 05 Oct 2020 22:36:57 GMT

_Version update only_

## 0.2.70
Mon, 05 Oct 2020 15:10:42 GMT

_Version update only_

## 0.2.69
Fri, 02 Oct 2020 00:10:59 GMT

_Version update only_

## 0.2.68
Thu, 01 Oct 2020 20:27:16 GMT

_Version update only_

## 0.2.67
Thu, 01 Oct 2020 18:51:21 GMT

_Version update only_

## 0.2.66
Wed, 30 Sep 2020 18:39:17 GMT

_Version update only_

## 0.2.65
Wed, 30 Sep 2020 06:53:53 GMT

### Patches

- Update README.md

## 0.2.64
Tue, 22 Sep 2020 05:45:57 GMT

_Version update only_

## 0.2.63
Tue, 22 Sep 2020 01:45:31 GMT

_Version update only_

## 0.2.62
Tue, 22 Sep 2020 00:08:53 GMT

_Version update only_

## 0.2.61
Sat, 19 Sep 2020 04:37:27 GMT

_Version update only_

## 0.2.60
Sat, 19 Sep 2020 03:33:07 GMT

_Version update only_

## 0.2.59
Fri, 18 Sep 2020 22:57:24 GMT

_Version update only_

## 0.2.58
Fri, 18 Sep 2020 21:49:53 GMT

_Version update only_

## 0.2.57
Wed, 16 Sep 2020 05:30:26 GMT

_Version update only_

## 0.2.56
Tue, 15 Sep 2020 01:51:37 GMT

_Version update only_

## 0.2.55
Mon, 14 Sep 2020 15:09:48 GMT

_Version update only_

## 0.2.54
Sun, 13 Sep 2020 01:53:20 GMT

_Version update only_

## 0.2.53
Fri, 11 Sep 2020 02:13:35 GMT

_Version update only_

## 0.2.52
Wed, 09 Sep 2020 03:29:01 GMT

_Version update only_

## 0.2.51
Wed, 09 Sep 2020 00:38:48 GMT

_Version update only_

## 0.2.50
Mon, 07 Sep 2020 07:37:37 GMT

_Version update only_

## 0.2.49
Sat, 05 Sep 2020 18:56:35 GMT

_Version update only_

## 0.2.48
Fri, 04 Sep 2020 15:06:28 GMT

_Version update only_

## 0.2.47
Thu, 03 Sep 2020 15:09:59 GMT

_Version update only_

## 0.2.46
Wed, 02 Sep 2020 23:01:13 GMT

_Version update only_

## 0.2.45
Wed, 02 Sep 2020 15:10:17 GMT

_Version update only_

## 0.2.44
Thu, 27 Aug 2020 11:27:06 GMT

_Version update only_

## 0.2.43
Tue, 25 Aug 2020 00:10:12 GMT

_Version update only_

## 0.2.42
Mon, 24 Aug 2020 07:35:21 GMT

_Version update only_

## 0.2.41
Sat, 22 Aug 2020 05:55:43 GMT

_Version update only_

## 0.2.40
Fri, 21 Aug 2020 01:21:18 GMT

_Version update only_

## 0.2.39
Thu, 20 Aug 2020 18:41:47 GMT

_Version update only_

## 0.2.38
Thu, 20 Aug 2020 15:13:52 GMT

_Version update only_

## 0.2.37
Tue, 18 Aug 2020 23:59:42 GMT

_Version update only_

## 0.2.36
Tue, 18 Aug 2020 03:03:24 GMT

_Version update only_

## 0.2.35
Mon, 17 Aug 2020 05:31:53 GMT

_Version update only_

## 0.2.34
Mon, 17 Aug 2020 04:53:23 GMT

_Version update only_

## 0.2.33
Thu, 13 Aug 2020 09:26:40 GMT

_Version update only_

## 0.2.32
Thu, 13 Aug 2020 04:57:38 GMT

_Version update only_

## 0.2.31
Wed, 12 Aug 2020 00:10:05 GMT

### Patches

- Updated project to build with Heft

## 0.2.30
Wed, 05 Aug 2020 18:27:32 GMT

_Version update only_

## 0.2.29
Fri, 03 Jul 2020 15:09:04 GMT

_Version update only_

## 0.2.28
Fri, 03 Jul 2020 05:46:42 GMT

_Version update only_

## 0.2.27
Sat, 27 Jun 2020 00:09:38 GMT

_Version update only_

## 0.2.26
Fri, 26 Jun 2020 22:16:39 GMT

_Version update only_

## 0.2.25
Thu, 25 Jun 2020 06:43:35 GMT

_Version update only_

## 0.2.24
Wed, 24 Jun 2020 09:50:48 GMT

_Version update only_

## 0.2.23
Wed, 24 Jun 2020 09:04:28 GMT

_Version update only_

## 0.2.22
Mon, 15 Jun 2020 22:17:18 GMT

_Version update only_

## 0.2.21
Fri, 12 Jun 2020 09:19:21 GMT

_Version update only_

## 0.2.20
Wed, 10 Jun 2020 20:48:30 GMT

_Version update only_

## 0.2.19
Mon, 01 Jun 2020 08:34:17 GMT

_Version update only_

## 0.2.18
Sat, 30 May 2020 02:59:54 GMT

_Version update only_

## 0.2.17
Thu, 28 May 2020 05:59:02 GMT

_Version update only_

## 0.2.16
Wed, 27 May 2020 05:15:11 GMT

_Version update only_

## 0.2.15
Tue, 26 May 2020 23:00:25 GMT

_Version update only_

## 0.2.14
Fri, 22 May 2020 15:08:42 GMT

_Version update only_

## 0.2.13
Thu, 21 May 2020 23:09:44 GMT

_Version update only_

## 0.2.12
Thu, 21 May 2020 15:42:00 GMT

_Version update only_

## 0.2.11
Tue, 19 May 2020 15:08:20 GMT

_Version update only_

## 0.2.10
Fri, 15 May 2020 08:10:59 GMT

_Version update only_

## 0.2.9
Wed, 06 May 2020 08:23:45 GMT

_Version update only_

## 0.2.8
Sat, 02 May 2020 00:08:16 GMT

_Version update only_

## 0.2.7
Wed, 08 Apr 2020 04:07:33 GMT

_Version update only_

## 0.2.6
Fri, 03 Apr 2020 15:10:15 GMT

_Version update only_

## 0.2.5
Sun, 29 Mar 2020 00:04:12 GMT

_Version update only_

## 0.2.4
Sat, 28 Mar 2020 00:37:16 GMT

_Version update only_

## 0.2.3
Wed, 18 Mar 2020 15:07:47 GMT

_Version update only_

## 0.2.2
Tue, 17 Mar 2020 23:55:58 GMT

### Patches

- Replace dependencies whose NPM scope was renamed from `@microsoft` to `@rushstack`

## 0.2.1
Tue, 28 Jan 2020 02:23:44 GMT

_Version update only_

## 0.2.0
Fri, 24 Jan 2020 00:27:39 GMT

### Minor changes

- Extract debug certificate logic into separate package.

