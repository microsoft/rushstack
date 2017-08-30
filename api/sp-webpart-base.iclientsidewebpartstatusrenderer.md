<!-- docId=sp-webpart-base.iclientsidewebpartstatusrenderer -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md)

# IClientSideWebPartStatusRenderer interface

Interface to be implemented by a component that should display the loading indicator and error messages for a webpart.

## Methods

|  Method | Returns | Description |
|  --- | --- | --- |
|  [`clearError(domElement)`](./sp-webpart-base.iclientsidewebpartstatusrenderer.clearerror.md) | `void` | Clear the webpart error message. |
|  [`clearLoadingIndicator(domElement)`](./sp-webpart-base.iclientsidewebpartstatusrenderer.clearloadingindicator.md) | `void` | Clear the loading indicator. |
|  [`displayLoadingIndicator(domElement, loadingMessage, timeout)`](./sp-webpart-base.iclientsidewebpartstatusrenderer.displayloadingindicator.md) | `void` | Display a loading spinner. |
|  [`renderError(domElement, error)`](./sp-webpart-base.iclientsidewebpartstatusrenderer.rendererror.md) | `void` | Render the provided error message in the webpart container div. |

