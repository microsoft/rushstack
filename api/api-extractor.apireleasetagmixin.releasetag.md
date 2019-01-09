[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiReleaseTagMixin](./api-extractor.apireleasetagmixin.md) &gt; [releaseTag](./api-extractor.apireleasetagmixin.releasetag.md)

## ApiReleaseTagMixin.releaseTag property

The effective release tag for this declaration. If it is not explicitly specified, the value may be inherited from a containing declaration.

<b>Signature:</b>

```typescript
readonly releaseTag: ReleaseTag;
```

## Remarks

For example, an `ApiEnumMember` may inherit its release tag from the containing `ApiEnum`<!-- -->.

