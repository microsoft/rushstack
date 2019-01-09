[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [InternalError](./node-core-library.internalerror.md)

## InternalError class

An `Error` subclass that should be thrown to report an unexpected state that may indicate a software defect. An application may handle this error by instructing the end user to report an issue to the application maintainers.

<b>Signature:</b>

```typescript
export declare class InternalError extends Error 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [unformattedMessage](./node-core-library.internalerror.unformattedmessage.md) |  | `string` | The underlying error message, without the additional boilerplate for an `InternalError`<!-- -->. |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [toString()](./node-core-library.internalerror.tostring.md) |  |  |

## Remarks

Do not use this class unless you intend to solicit bug reports from end users.

