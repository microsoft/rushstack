# gulp-core-build-serve [![npm version](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-serve.svg)](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-serve)

[![Build Status](https://travis-ci.org/Microsoft/gulp-core-build-serve.svg?branch=master)](https://travis-ci.org/Microsoft/gulp-core-build-serve) [![Dependencies](https://david-dm.org/Microsoft/gulp-core-build-serve.svg)](https://david-dm.org/Microsoft/gulp-core-build-serve)

`gulp-core-build-serve` is a plugin for `gulp-core-build` which introduces the ability to serve files from a directory using `gulp-connect` and `express`.

# Tasks
## ServeTask

### Description

### Config
```typescript
interface IServeTaskConfig {
  api?: {
    port: number,
    entryPath: string
  };
  https: boolean;
  initialPage: string;
  port: number;
  keyPath: string;
  certPath: string;
  pfxPath: string;
  tryCreateDevCertificate: boolean;
}
```
* **

Usage (and defaults):
```typescript
let build = require('gulp-core-build');
let serve = require('gulp-core-build-serve');

build.task('serve', serve);

serve.setConfig({
    api: null,
    initialPage: '/index.html',
    port: 4321,
    https: false,
    tryCreateDevCertificate: false,
    keyPath: undefined,
    certPath: undefined,
    pfxPath: undefined
  }
);
```

## TrustCertTask

### Description
This task gnerates and trusts a development certificate. The certificate is self-signed
and stored, along with its private key, in the user's home directory. On Windows, it's
trusted as a root certification authority in the user certificate store. On macOS, it's
trusted as a root cert in the keychain. On other platforms, the certificate is generated
and signed, but the user must trust it manually. See ***Development Certificate*** below for
more information.

### Config

*This task doesn't have any configuration options.*

## UntrustCertTask

### Description
On Windows, this task removes the certificate with the expected serial number from the user's
root certification authorities list. On macOS, it finds the SHA signature of the certificate
with the expected serial number and then removes that certificate from the keychain. On
other platforms, the user must untrust the certificate manually. On all platforms,
the certificate and private key are deleted from the user's home directory. See
***Development Certificate*** below for more information.

### Config

*This task doesn't have any configuration options.*

# Development Certificate

`gulp-core-build-serve` provides functionality to run a development server in HTTPS. Because
HTTPS-hosted server responses are signed, hosting a server using HTTPS requires a trusted certificate
signed by a root certification authority or modern browsers will show security warnings and block
unsigned responses unless they are explicitly excepted.

Because of this issue `gulp-core-build-serve` also provides functionality to generate and trust
(and un-trust) a development certificate. There are two ways to generate the development certificate:

1. By setting the `ServeTask`'s `tryCreateDevCertificate` configuration option to `true`. This option
will make the serve task attempt to generate and trust a development certificate before starting the
server if a certificate wasn't specified using the `keyPath` and `certPath` paramters or the `pfxPath`
parameter.

2. By invoking the `TrustCertTask` build task.

The certificate is generated and self-signed with a unique private key and an attempt is made to trust
it (Windows and macOS only). If the user does not agree to trust the certificate, provides invalid root
credentials, or something else goes wrong, the `TrustCertTask` will fail and the `ServeTask` will serve
with the default, non-trusted certificate. If trust succeeds, the certificate and the private key are
dropped in the `.gcb-serve-data` directory in the user's home folder in `PEM` format. On platforms
other than Windows and macOS, the certificate and key are always dropped in that directory, and the user
must trust the certificate manually.

After the certificate has been generated, trusted, and dropped in the home folder, any instance of
`gulp-core-build-serve` running in any project will use it when running in HTTPS mode.

To untrust the certificate, invoke the `UntrustCertTask`. On Windows, this task deletes the certificate
by its serial number from the user root certification authorities store, and on macOS the certificate's
signature is found by its serial number and then the certificate is deleted from the keychain by its
signature. Regardless of whether the untrust succeeds or not, the certificate and key are deleted
from the user's home directory.

To manually untrust the certificate, delete the files in the `.gcb-serve-data` directory under your
home directory and untrust the certificate with the
`73 1c 32 17 44 e3 46 50 a2 02 e3 ef 91 c3 c1 b9` serial number.
