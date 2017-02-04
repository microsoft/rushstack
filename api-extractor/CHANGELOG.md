# Change Log - @microsoft/api-extractor

This log was last generated on Sat, 04 Feb 2017 02:32:05 GMT and should not be manually modified.

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

