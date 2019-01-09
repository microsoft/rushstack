[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IExtractorApiReviewFileConfig](./api-extractor.iextractorapireviewfileconfig.md) &gt; [apiReviewFolder](./api-extractor.iextractorapireviewfileconfig.apireviewfolder.md)

## IExtractorApiReviewFileConfig.apiReviewFolder property

The file path of the folder containing API review file, relative to the project folder. This is part of an API review workflow: During a build, the API Extractor will output an API file, e.g. "my-project/temp/my-project.api.ts". It will then compare this file against the last reviewed file, e.g. "../api-review/my-project.api.ts" (assuming that apiReviewFolder is "../api-review"). If the files are different, the build will fail with an error message that instructs the developer to update the approved file, and then commit it to Git. When they create a Pull Request, a branch policy will look for changes under "api-review/\*" and require signoff from the appropriate reviewers.

The default value is "./etc".

Example: "config" (for a standalone project) Example: "../../common/api-review" (for a Git repository with Rush)

<b>Signature:</b>

```typescript
apiReviewFolder?: string;
```
