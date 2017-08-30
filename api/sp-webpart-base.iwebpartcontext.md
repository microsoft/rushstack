<!-- docId=sp-webpart-base.iwebpartcontext -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md)

# IWebPartContext interface

The base context interface for client-side web parts.

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [`domElement`](./sp-webpart-base.iwebpartcontext.domelement.md) | `HTMLElement` | Reference to the DOM element that hosts this client side component. |
|  [`graphHttpClient`](./sp-webpart-base.iwebpartcontext.graphhttpclient.md) | `GraphHttpClient` | GraphHttpClient instance scoped to this web part. |
|  [`httpClient`](./sp-webpart-base.iwebpartcontext.httpclient.md) | `HttpClient` | HttpClient instance scoped to this web part. |
|  [`instanceId`](./sp-webpart-base.iwebpartcontext.instanceid.md) | `string` | Web part instance id. This is a globally unique value. |
|  [`manifest`](./sp-webpart-base.iwebpartcontext.manifest.md) | `IClientSideWebPartManifestInstance<any>` | Manifest for the client side web part. |
|  [`pageContext`](./sp-webpart-base.iwebpartcontext.pagecontext.md) | `PageContext` | SharePoint page context. |
|  [`propertyPane`](./sp-webpart-base.iwebpartcontext.propertypane.md) | `IPropertyPaneAccessor` | Accessor for common web part property pane operations. |
|  [`spHttpClient`](./sp-webpart-base.iwebpartcontext.sphttpclient.md) | `SPHttpClient` | SPHttpClient instance scoped to this web part. |
|  [`statusRenderer`](./sp-webpart-base.iwebpartcontext.statusrenderer.md) | `IClientSideWebPartStatusRenderer` | Web part status renderer. |
|  [`webPartTag`](./sp-webpart-base.iwebpartcontext.webparttag.md) | `string` | Web part tag to be used for logging and telemetry. |


## Remarks

A "context" object is a collection of well-known services and other objects that are likely to be needed by any business logic working with a component. Each component type has its own specialized extension of this interface, e.g. IWebPartContext for web parts, IExtensionContext for client-side extensions, etc.
