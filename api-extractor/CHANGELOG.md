# Change Log - @microsoft/api-extractor

This log was last generated on Mon, 20 Mar 2017 04:20:13 GMT and should not be manually modified.

## 1.1.19
Mon, 20 Mar 2017 04:20:13 GMT

### Patches

- Reverting change.

## 1.1.18
Mon, 20 Mar 2017 03:50:55 GMT

### Patches

- Reverting previous change, which causes a regression in SPFx yeoman sc enario.

## 1.1.17
Mon, 20 Mar 2017 00:54:03 GMT

### Patches

- Fixing lint whitespace issues.

## 1.1.16
Sun, 19 Mar 2017 19:10:30 GMT

### Patches

- Fixing variable that was shadowing another variable.

## 1.1.15
Wed, 15 Mar 2017 01:32:09 GMT

### Patches

- Locking `@types` packages. Synchronizing version specifiers for dependencies with other `web-build-tools` projects.

## 1.1.14
Sat, 18 Feb 2017 02:32:06 GMT

### Patches

- Seperated the ApiItem initialization into 3 stages: create documentation that doesn't require resolution, then complete initialization by resolving links and inheritdocs. This allows us to ignore harmless cycles like type references"

## 1.1.13
Thu, 16 Feb 2017 22:10:39 GMT

### Patches

- Fixed Api-Extractor error message, changed apostrophe to backtick.

## 1.1.12
Thu, 16 Feb 2017 18:56:57 GMT

### Patches

- Added support for local API definition resolution"

## 1.1.11
Sat, 11 Feb 2017 02:32:35 GMT

### Patches

- Changed dependency for ApiDocumentation to abstract the resolving of API definition references.

## 1.1.10
Fri, 10 Feb 2017 20:01:30 GMT

### Patches

-  Added support to not throw error, instead report error if no type is declared on properties and parameters

## 1.1.9
Tue, 07 Feb 2017 20:37:06 GMT

### Patches

- Fixing issue where undocumented comment was not being emitted.

## 1.1.8
Sat, 04 Feb 2017 02:32:05 GMT

### Patches

- Moved ApiItem references within ApiDocumentation, to ApiItem caller.

## 1.1.7
Thu, 02 Feb 2017 14:05:53 GMT

### Patches

- Refactored ApiDocumentation creation to resolve references method.

## 1.1.6
Wed, 01 Feb 2017 20:09:30 GMT

### Patches

- Added ApiItemKind enum and refactored child classes.

## 1.1.5
Fri, 27 Jan 2017 20:04:15 GMT

### Patches

- Changed name of Analyzer to Extractor, added support for external api json doc loading.

## 1.1.4
Fri, 27 Jan 2017 02:35:10 GMT

### Patches

- Added ExternalApiHelper class to be used in generating api documentation json files for external types.
- Added description for packages implementation.
- Added config folder with file to enable api-extractor on itself. rebuild project on previous build.

## 1.1.3
Tue, 24 Jan 2017 01:36:35 GMT

### Patches

- Json schema was updated to reflect feature additions to linkDocElement. The linkDocElement can now be of type 'code' which refers to an API definition reference.

## 1.1.2
Fri, 20 Jan 2017 01:46:41 GMT

*Changes not tracked*

## 1.1.1
Thu, 19 Jan 2017 20:04:40 GMT

### Patches

- Check for missing JsDoc sequences changed.
- Improved error messages

## 1.1.0
Wed, 18 Jan 2017 20:04:29 GMT

### Minor changes

- Updating API Extractor to work with TypeScript 2.1

## 1.0.2
Mon, 16 Jan 2017 20:04:15 GMT

### Patches

- @link capability for href and API definition references

## 1.0.1
Fri, 13 Jan 2017 06:46:05 GMT

*Changes not tracked*

## 1.0.0
Wed, 11 Jan 2017 14:11:26 GMT

### Breaking changes

- Introducing API Extractor

