[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileDiffTest](./node-core-library.filedifftest.md) &gt; [assertEqual](./node-core-library.filedifftest.assertequal.md)

## FileDiffTest.assertEqual() method

Compares the contents of two files, and returns true if they are equivalent. Note that these files are not normally edited by a human; the "equivalence" comparison here is intended to ignore spurious changes that might be introduced by a tool, e.g. Git newline normalization or an editor that strips whitespace when saving.

<b>Signature:</b>

```typescript
static assertEqual(actualFilePath: string, expectedFilePath: string): void;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>actualFilePath</p> | <p>`string`</p> |  |
|  <p>expectedFilePath</p> | <p>`string`</p> |  |

<b>Returns:</b>

`void`

