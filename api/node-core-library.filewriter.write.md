[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileWriter](./node-core-library.filewriter.md) &gt; [write](./node-core-library.filewriter.write.md)

## FileWriter.write() method

Writes some text to the given file handle. Throws if the file handle has been closed. Behind the scenes it uses `fs.writeSync()`<!-- -->.

<b>Signature:</b>

```typescript
write(text: string): void;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>text</p> | <p>`string`</p> | <p>The text to write to the file.</p> |

<b>Returns:</b>

`void`

