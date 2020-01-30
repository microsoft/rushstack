# Change Log - @microsoft/api-extractor-model

This log was last generated on Tue, 28 Jan 2020 02:23:44 GMT and should not be manually modified.

## 7.7.7
Tue, 28 Jan 2020 02:23:44 GMT

*Version update only*

## 7.7.6
Thu, 23 Jan 2020 01:07:56 GMT

*Version update only*

## 7.7.5
Tue, 21 Jan 2020 21:56:14 GMT

*Version update only*

## 7.7.4
Sun, 19 Jan 2020 02:26:52 GMT

### Patches

- Upgrade Node typings to Node 10

## 7.7.3
Fri, 17 Jan 2020 01:08:23 GMT

*Version update only*

## 7.7.2
Thu, 09 Jan 2020 06:44:13 GMT

*Version update only*

## 7.7.1
Wed, 08 Jan 2020 00:11:31 GMT

*Version update only*

## 7.7.0
Tue, 03 Dec 2019 03:17:43 GMT

### Minor changes

- Improve declaration reference syntax to allow linking to overloaded functions/methods

## 7.6.0
Sun, 24 Nov 2019 00:54:04 GMT

### Minor changes

- Added support for `@throws`

## 7.5.6
Fri, 15 Nov 2019 04:50:50 GMT

*Version update only*

## 7.5.5
Mon, 11 Nov 2019 16:07:56 GMT

*Version update only*

## 7.5.4
Tue, 05 Nov 2019 06:49:28 GMT

### Patches

- Fix an issue where API reports sometimes were ordered differently depending on the version of NodeJS (GitHub #1552)

## 7.5.3
Tue, 05 Nov 2019 01:08:39 GMT

### Patches

- Clarified an error message

## 7.5.2
Tue, 22 Oct 2019 06:24:44 GMT

### Patches

- Refactor some code as part of migration from TSLint to ESLint

## 7.5.1
Sun, 29 Sep 2019 23:56:29 GMT

### Patches

- Update repository URL

## 7.5.0
Wed, 25 Sep 2019 15:15:31 GMT

### Minor changes

- Add ApiItem.getMergedSiblings() API

## 7.4.2
Mon, 23 Sep 2019 15:14:55 GMT

### Patches

- Remove unnecessary dependency on @types/node

## 7.4.1
Tue, 10 Sep 2019 22:32:23 GMT

### Patches

- Update documentation

## 7.4.0
Tue, 10 Sep 2019 20:38:33 GMT

### Minor changes

- Add 'canonicalReference' to ExcerptToken

## 7.3.4
Wed, 04 Sep 2019 18:28:06 GMT

*Version update only*

## 7.3.3
Wed, 04 Sep 2019 15:15:37 GMT

### Patches

- Update TSDoc dependency to 0.12.14

## 7.3.2
Thu, 08 Aug 2019 15:14:17 GMT

*Version update only*

## 7.3.1
Thu, 08 Aug 2019 00:49:05 GMT

### Patches

- (Experimental) Add ApiExtractor.canonicalReference which is a beta implementation of the revised TSDoc declaration reference notation

## 7.3.0
Mon, 22 Jul 2019 19:13:10 GMT

### Minor changes

- Rename `ApiItem.canonicalReference` to `.containerKey`; rename `ApiItemContainerMixin.tryGetMember()` to `.tryGetMemberByKey()`; rename `Api___.getCanonicalReference()` to `.getContainerKey()`

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

