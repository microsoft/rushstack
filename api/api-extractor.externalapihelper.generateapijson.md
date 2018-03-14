[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ExternalApiHelper](./api-extractor.externalapihelper.md) &gt; [generateApiJson](./api-extractor.externalapihelper.generateapijson.md)

# ExternalApiHelper.generateApiJson method

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.


**Signature:**
```javascript
static generateApiJson(rootDir: string, libFolder: string, externalPackageFilePath: string): void;
```
**Returns:** `void`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `rootDir` | `string` | the absolute path containing a 'package.json' file and is also a parent of the external package file. Ex: build.absolute\_build\_path. |
|  `libFolder` | `string` | the path to the lib folder relative to the rootDir, this is where 'external-api-json/external\_package.api.json' file will be written. Ex: 'lib'. |
|  `externalPackageFilePath` | `string` | the path to the '\*.d.ts' file of the external package relative to the rootDir. Ex: 'resources/external-api-json/es6-collection/index.t.ds' |

