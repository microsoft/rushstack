<!-- docId=sp-webpart-base.ipropertypaneaccessor -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md)

# IPropertyPaneAccessor interface

Web part context property pane accessor interface. Provides some most commonly used utilities to access the property pane.

## Methods

|  Method | Returns | Description |
|  --- | --- | --- |
|  [`isPropertyPaneOpen()`](./sp-webpart-base.ipropertypaneaccessor.ispropertypaneopen.md) | `boolean` | Returns true if the PropertyPane is open. |
|  [`isRenderedByWebPart()`](./sp-webpart-base.ipropertypaneaccessor.isrenderedbywebpart.md) | `boolean` | Indicates whether the PropertyPane was initially opened by the web part. For example, if the web part calls this.context.propertyPane.open() then the property would be true, whereas if the property pane was opened by the host, then the value will be false. |
|  [`open()`](./sp-webpart-base.ipropertypaneaccessor.open.md) | `void` | This API should be used to open the PropertyPane to help configure the web part. |
|  [`refresh()`](./sp-webpart-base.ipropertypaneaccessor.refresh.md) | `void` | This API should be used to invoke the PropertyPane to help configure the web part. This operation only works when the PropertyPane is already open for the currently active web part. If the PropertyPane is opened for another web part, calling the refresh API will have no impact. |

