[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [Text](./node-core-library.text.md)

# Text class

Operations for working with strings that contain text.

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`convertToCrLf(input)`](./node-core-library.text.converttocrlf.md) |  | `string` | Converts all newlines in the provided string to use Windows-style CRLF end of line characters. |
|  [`convertToLf(input)`](./node-core-library.text.converttolf.md) |  | `string` | Converts all newlines in the provided string to use Unix-style LF end of line characters. |
|  [`replaceAll(input, searchValue, replaceValue)`](./node-core-library.text.replaceall.md) |  | `string` | Returns the same thing as targetString.replace(searchValue, replaceValue), except that all matches are replaced, rather than just the first match. |

## Remarks

The utilities provided by this class are intended to be simple, small, and very broadly applicable.
