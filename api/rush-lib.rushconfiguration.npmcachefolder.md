[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [RushConfiguration](./rush-lib.rushconfiguration.md) &gt; [npmCacheFolder](./rush-lib.rushconfiguration.npmcachefolder.md)

## RushConfiguration.npmCacheFolder property

The local folder that will store the NPM package cache. Rush does not rely on the npm's default global cache folder, because npm's caching implementation does not reliably handle multiple processes. (For example, if a build box is running "rush install" simultaneously for two different working folders, it may fail randomly.)

Example: `C:\MyRepo\common\temp\npm-cache`

<b>Signature:</b>

```typescript
readonly npmCacheFolder: string;
```
