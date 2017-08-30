<!-- docId=sp-webpart-base.baseclientsidewebpart.rendererror -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md) &gt; [BaseClientSideWebPart](./sp-webpart-base.baseclientsidewebpart.md)

# BaseClientSideWebPart.renderError method

This API should be used to render an error message in the web part display area. Also logs the error message using the trace logger.

**Signature:**
```javascript
protected renderError(error: Error): void;
```
**Returns:** `void`


## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `error` | `Error` | An error object containing the error message to render. |

