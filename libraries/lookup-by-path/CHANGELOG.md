# Change Log - @rushstack/lookup-by-path

This log was last generated on Wed, 18 Dec 2024 01:11:33 GMT and should not be manually modified.

## 0.5.0
Wed, 18 Dec 2024 01:11:33 GMT

### Minor changes

- Update all methods to accept optional override delimiters. Add `size`, `entries(), `get()`, `has()`, `removeItem()`. Make class iterable.
Explicitly exclude `undefined` and `null` from the allowed types for the type parameter `TItem`.

## 0.4.7
Sat, 14 Dec 2024 01:11:07 GMT

_Version update only_

## 0.4.6
Mon, 09 Dec 2024 20:31:43 GMT

_Version update only_

## 0.4.5
Tue, 03 Dec 2024 16:11:08 GMT

_Version update only_

## 0.4.4
Sat, 23 Nov 2024 01:18:55 GMT

_Version update only_

## 0.4.3
Fri, 22 Nov 2024 01:10:43 GMT

_Version update only_

## 0.4.2
Thu, 24 Oct 2024 00:15:48 GMT

_Version update only_

## 0.4.1
Mon, 21 Oct 2024 18:50:10 GMT

_Version update only_

## 0.4.0
Thu, 17 Oct 2024 20:25:42 GMT

### Minor changes

- Add `IReadonlyLookupByPath` interface to help unit tests for functions that consume `LookupByPath`.

## 0.3.2
Thu, 17 Oct 2024 08:35:06 GMT

_Version update only_

## 0.3.1
Tue, 15 Oct 2024 00:12:31 GMT

_Version update only_

## 0.3.0
Thu, 03 Oct 2024 15:11:00 GMT

### Minor changes

- Allow for a map of file paths to arbitrary info to be grouped by the nearest entry in the LookupByPath trie

## 0.2.5
Wed, 02 Oct 2024 00:11:19 GMT

_Version update only_

## 0.2.4
Tue, 01 Oct 2024 00:11:28 GMT

_Version update only_

## 0.2.3
Mon, 30 Sep 2024 15:12:19 GMT

_Version update only_

## 0.2.2
Fri, 13 Sep 2024 00:11:43 GMT

_Version update only_

## 0.2.1
Tue, 10 Sep 2024 20:08:11 GMT

_Version update only_

## 0.2.0
Tue, 27 Aug 2024 15:12:33 GMT

### Minor changes

- Return a linked list of matches in `findLongestPrefixMatch` in the event that multiple prefixes match. The head of the list is the most specific match.

## 0.1.2
Wed, 21 Aug 2024 05:43:04 GMT

_Version update only_

## 0.1.1
Mon, 12 Aug 2024 22:16:04 GMT

_Version update only_

## 0.1.0
Thu, 08 Aug 2024 22:08:25 GMT

### Minor changes

- Extract LookupByPath from @rushstack/rush-lib.

