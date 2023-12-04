# @rushstack/debug-certificate-manager

## Installation

`npm install @rushstack/debug-certificate-manager --save-dev`

## Overview

This library contains utilities for managing debug certificates in a development server environment. It provides functions to generate, self-sign, trust, and untrust .pem certificates for both Windows and Mac OS. It will also generate self-signed certificates on other OS's, but the user must manually trust and untrust them.

[![npm version](https://badge.fury.io/js/%40rushstack%2Fdebug-certificate-manager.svg)](https://badge.fury.io/js/%40rushstack%2Fdebug-certificate-manager)


## `CertificateStore`

The `CertificateStore` class provides accessors and mutators for the debug certificate data stored in `.rushstack`.

Retrive certificate data from the store:
```typescript
const certificateStore: CertificateStore = new CertificateStore();
return {
  pemCertificate: certificateStore.certificateData,
  pemKey: certificateStore.keyData
};
```
Set data using the same property names `certificateData: string | undefined` and `keyData: string | undefined`.

## `ensureCertificate`

Get a development certificate from the store, or optionally, generate a new one and trust it if one does not exist in the store. Returns a certificate object following the `ICertificate` interface.

```typescript
export interface ICertificate {
  pemCertificate: string | undefined;
  pemKey: string | undefined;
}
```

## `untrustCertificate`

Attempts to locate a previously generated debug certificate and untrust it. Returns a `boolean` value to denote success.

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/libraries/debug-certificate-manager/CHANGELOG.md) - Find
  out what's new in the latest version
- [API Reference](https://rushstack.io/pages/api/debug-certificate-manager/)

**@rushstack/debug-certificate-manager** is part of the [Rush Stack](https://rushstack.io/) family of projects.
