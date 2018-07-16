[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [copyFile](./node-core-library.filesystem.copyfile.md)

# FileSystem.copyFile method

Copies a file from one location to another. By default, destinationPath is overwritten if it already exists. Behind the scenes it uses \`fs.copyFileSync()\`.

**Signature:**
```javascript
static copyFile(sourcePath: string, destinationPath: string): void;
```
**Returns:** `void`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `sourcePath` | `string` | The absolute or relative path to the source file to be copied. |
|  `destinationPath` | `string` | The absolute or relative path to the new copy that will be created. |

