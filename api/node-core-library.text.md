[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [Text](./node-core-library.text.md)

# Text class

Operations for working with strings that contain text.

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`convertToCrLf(input)`](./node-core-library.text.converttocrlf.md) |  | `string` | Converts all newlines in the provided string to use Windows-style CRLF end of line characters. |
|  [`convertToLf(input)`](./node-core-library.text.converttolf.md) |  | `string` | Converts all newlines in the provided string to use POSIX-style LF end of line characters.<p/>POSIX is a registered trademark of the Institute of Electrical and Electronic Engineers, Inc. |
|  [`ensureTrailingNewline(s, newlineKind)`](./node-core-library.text.ensuretrailingnewline.md) |  | `string` | Returns the input string with a trailing `\n` character appended, if not already present. |
|  [`padEnd(s, minimumLength)`](./node-core-library.text.padend.md) |  | `string` | Append spaces to the end of a string to ensure the result has a minimum length. |
|  [`replaceAll(input, searchValue, replaceValue)`](./node-core-library.text.replaceall.md) |  | `string` | Returns the same thing as targetString.replace(searchValue, replaceValue), except that all matches are replaced, rather than just the first match. |
|  [`truncateWithEllipsis(s, maximumLength)`](./node-core-library.text.truncatewithellipsis.md) |  | `string` | If the string is longer than maximumLength characters, truncate it to that length using "..." to indicate the truncation. |

## Remarks

The utilities provided by this class are intended to be simple, small, and very broadly applicable.
