[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileDiffTest](./node-core-library.filedifftest.md) &gt; [assertEqual](./node-core-library.filedifftest.assertequal.md)

# FileDiffTest.assertEqual method

Compares the contents of two files, and returns true if they are equivalent. Note that these files are not normally edited by a human; the "equivalence" comparison here is intended to ignore spurious changes that might be introduced by a tool, e.g. Git newline normalization or an editor that strips whitespace when saving.

**Signature:**
```javascript
static assertEqual(actualFilePath: string, expectedFilePath: string): void;
```
**Returns:** `void`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `actualFilePath` | `string` |  |
|  `expectedFilePath` | `string` |  |

