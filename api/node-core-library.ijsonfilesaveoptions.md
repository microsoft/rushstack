[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [IJsonFileSaveOptions](./node-core-library.ijsonfilesaveoptions.md)

## IJsonFileSaveOptions interface

Options for JsonFile.saveJsonFile()

<b>Signature:</b>

```typescript
export interface IJsonFileSaveOptions extends IJsonFileStringifyOptions 
```

## Properties

|  <p>Property</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[ensureFolderExists](./node-core-library.ijsonfilesaveoptions.ensurefolderexists.md)</p> | <p>`boolean`</p> | <p>Creates the folder recursively using FileSystem.ensureFolder() Defaults to false.</p> |
|  <p>[onlyIfChanged](./node-core-library.ijsonfilesaveoptions.onlyifchanged.md)</p> | <p>`boolean`</p> | <p>If there is an existing file, and the contents have not changed, then don't write anything; this preserves the old timestamp.</p> |
|  <p>[updateExistingFile](./node-core-library.ijsonfilesaveoptions.updateexistingfile.md)</p> | <p>`boolean`</p> | <p>If true, use the "jju" library to preserve the existing JSON formatting: The file will be loaded from the target filename, the new content will be merged in (preserving whitespace and comments), and then the file will be overwritten with the merged contents. If the target file does not exist, then the file is saved normally.</p> |

