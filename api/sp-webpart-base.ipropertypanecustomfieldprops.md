<!-- docId=sp-webpart-base.ipropertypanecustomfieldprops -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md)

# IPropertyPaneCustomFieldProps interface

PropertyPane CustomPropertyField props.

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [`context`](./sp-webpart-base.ipropertypanecustomfieldprops.context.md) | `any` | Instance specific context. This context is passed back to the web part in the onRender and onDispose APIs. The web part can use this context to manage state information. |
|  [`key`](./sp-webpart-base.ipropertypanecustomfieldprops.key.md) | `string` | An UNIQUE key indicates the identity of this contorl. The PropertyPane uses ReactJS to render its components. ReactJS uses keys to identify a component and if it should be re-rendered or not. This is a performance feature in ReactJS. Please read the following link to understand how to pick the value of the key.see https://facebook.github.io/react/docs/lists-and-keys.html\#keys |
|  [`onDispose`](./sp-webpart-base.ipropertypanecustomfieldprops.ondispose.md) | `(domElement: HTMLElement, context?: any) => void` | This API is called when the component is unmounted from the host element. |
|  [`onRender`](./sp-webpart-base.ipropertypanecustomfieldprops.onrender.md) | `(
    domElement: HTMLElement,
    context?: any,
    changeCallback?: (targetProperty?: string, newValue?: any) => void) => void` | This API will be called once the custom field is mounted on the host element. |

