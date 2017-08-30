<!-- docId=sp-webpart-base.iclientsidewebpartstatusrenderer.displayloadingindicator -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md) &gt; [IClientSideWebPartStatusRenderer](./sp-webpart-base.iclientsidewebpartstatusrenderer.md)

# IClientSideWebPartStatusRenderer.displayLoadingIndicator method

Display a loading spinner.

**Signature:**
```javascript
displayLoadingIndicator(domElement: Element, loadingMessage: string, timeout?: number): void;
```
**Returns:** `void`


## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `domElement` | `Element` | the webpart container div. |
|  `loadingMessage` | `string` | the message to be displayed when the loading spinner id displayed. |
|  `timeout` | `number` | timeout to render the loading indicator. Default is 900ms. |

