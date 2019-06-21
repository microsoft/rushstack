# Change Log - @microsoft/api-extractor-model

This log was last generated on Tue, 11 Jun 2019 00:48:06 GMT and should not be manually modified.

## 7.2.0
Tue, 11 Jun 2019 00:48:06 GMT

### Minor changes

- Add API support for type parameters and type alias types

### Patches

- Improve the .api.json deserializer to validate the schema version and support backwards compatibility

## 7.1.3
Wed, 05 Jun 2019 19:12:34 GMT

### Patches

- Fix an issue where TSDoc index selectors (ApiParameterListMixin.overloadIndex) started from 0, whereas TSDoc requires a nonzero number

## 7.1.2
Tue, 04 Jun 2019 05:51:53 GMT

### Patches

- Fix an issue where ApiConstructor inherited from ApiStaticMixin, but TypeScript constructors cannot be static

## 7.1.1
Mon, 27 May 2019 04:13:44 GMT

### Patches

- Make the strings returned by ApiItem.displayName less verbose
- Improve formatting of the strings returned by ApiItem.getScopedNameWithinPackage()

## 7.1.0
Tue, 16 Apr 2019 11:01:37 GMT

### Minor changes

- Initial stable release of API Extractor 7

## 7.0.28
Wed, 20 Mar 2019 19:14:49 GMT

*Version update only*

## 7.0.27
Mon, 18 Mar 2019 04:28:43 GMT

### Patches

- Add helper functions for ReleaseTag
- Export IApiItemConstructor to eliminate the ae-forgotten-export warning

## 7.0.26
Wed, 13 Mar 2019 19:13:14 GMT

### Patches

- Refactor code to move the IndentedWriter API from api-extractor-model to api-documenter

## 7.0.25
Wed, 13 Mar 2019 01:14:05 GMT

### Patches

- Upgrade TSDoc

## 7.0.24
Mon, 11 Mar 2019 16:13:36 GMT

### Patches

- Initial setup of new package @microsoft/api-extractor-model

