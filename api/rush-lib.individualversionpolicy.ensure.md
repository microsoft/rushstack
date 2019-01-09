[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [IndividualVersionPolicy](./rush-lib.individualversionpolicy.md) &gt; [ensure](./rush-lib.individualversionpolicy.ensure.md)

## IndividualVersionPolicy.ensure() method

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

Returns an updated package json that satisfies the version policy.

<b>Signature:</b>

```typescript
ensure(project: IPackageJson, force?: boolean): IPackageJson | undefined;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>project</p> | <p>`IPackageJson`</p> | <p>input package json</p> |
|  <p>force</p> | <p>`boolean`</p> | <p>force update even when the project version is higher than the policy version.</p> |

<b>Returns:</b>

`IPackageJson | undefined`

