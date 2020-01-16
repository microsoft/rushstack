# @microsoft/debug-certificate-manager

## Installation

`npm install @microsoft/debug-certificate-manager --save-dev`

## Overview

This library contains utilities for managing debug certificates in a development server environment. It provides functions to generate, self-sign, trust, and untrust .pem certificates for both Windows and Mac OS. It will also generate self-signed certificates on other OS's, but the user must manually trust and untrust them.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fdebug-certificate-manager.svg)](https://badge.fury.io/js/%40microsoft%2Fdebug-certificate-manager)
[![Build Status](https://travis-ci.org/Microsoft/debug-certificate-manager.svg?branch=master)](https://travis-ci.org/Microsoft/debug-certificate-manager) [![Dependencies](https://david-dm.org/Microsoft/debug-certificate-manager.svg)](https://david-dm.org/Microsoft/debug-certificate-manager)


## CertificateStore

The CertificateStore class follows a singleton pattern and provides accessors and mutators for the certificate data stored in `.rushstack-serve-data`.

Retrieve an instance with `CertificateStore.instance`.

## ensureCertificate

Get the dev certificate from the store, or optionally, generate a new one and trust it if one does not exist in the store. Returns a certificate object following the `ICertificate` interface.

```typescript
export interface ICertificate {
  pemCertificate: string | undefined;
  pemKey: string | undefined;
}
```

## untrustCertificate

Attempts to locate a previously generated debug certificate and untrust it. Returns a `boolean` value to denote success.

## API Documentation

Complete API documentation for this package: https://rushstack.io/pages/api/debug-certificate-manager/

# License

MIT (http://www.opensource.org/licenses/mit-license.php)
