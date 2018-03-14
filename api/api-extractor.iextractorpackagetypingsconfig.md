[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IExtractorPackageTypingsConfig](./api-extractor.iextractorpackagetypingsconfig.md)

# IExtractorPackageTypingsConfig interface

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

Configures how the package typings (\*.d.ts) will be generated.

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [`dtsFilePathForInternal`](./api-extractor.iextractorpackagetypingsconfig.dtsfilepathforinternal.md) | `string` | Specifies the \*.d.ts file path used for an internal release. The default value is "index-internal.d.ts". |
|  [`dtsFilePathForPreview`](./api-extractor.iextractorpackagetypingsconfig.dtsfilepathforpreview.md) | `string` | Specifies the output filename for a preview release. The default value is "index-preview.d.ts". |
|  [`dtsFilePathForPublic`](./api-extractor.iextractorpackagetypingsconfig.dtsfilepathforpublic.md) | `string` | Specifies the output filename for a public release. The default value is "index-public.d.ts". |
|  [`enabled`](./api-extractor.iextractorpackagetypingsconfig.enabled.md) | `boolean` | Whether to generate package typings. The default is false. |
|  [`outputFolder`](./api-extractor.iextractorpackagetypingsconfig.outputfolder.md) | `string` | Specifies where the \*.d.ts files should be written.<p/><!-- -->The default value is "./dist" |

## Remarks

API Extractor can generate a single unified \*.d.ts file that contains all the exported typings for the package entry point. It can also remove @alpha \\@beta \\@internal definitions depending on the release type.
