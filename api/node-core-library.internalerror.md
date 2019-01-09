[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [InternalError](./node-core-library.internalerror.md)

## InternalError class

An `Error` subclass that should be thrown to report an unexpected state that may indicate a software defect. An application may handle this error by instructing the end user to report an issue to the application maintainers.

<b>Signature:</b>

```typescript
export declare class InternalError extends Error 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[unformattedMessage](./node-core-library.internalerror.unformattedmessage.md)</p> |  | <p>`string`</p> | <p>The underlying error message, without the additional boilerplate for an `InternalError`<!-- -->.</p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[toString()](./node-core-library.internalerror.tostring.md)</p> |  | <p></p> |

## Remarks

Do not use this class unless you intend to solicit bug reports from end users.

