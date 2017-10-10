[Home](./index) &gt; [local](local.md) &gt; [Office\_Binding](local.office_binding.md)

# Office\_Binding interface

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [`document`](local.office_binding.document.md) | `Document` |  |
|  [`id`](local.office_binding.id.md) | `string` | Id of the Binding |
|  [`type`](local.office_binding.type.md) | `BindingType` |  |

## Methods

|  Method | Returns | Description |
|  --- | --- | --- |
|  [`addHandlerAsync(eventType, handler, options, callback)`](local.office_binding.addhandlerasync.md) | `void` | Adds an event handler to the object using the specified event type. |
|  [`getDataAsync(options, callback)`](local.office_binding.getdataasync.md) | `void` | Returns the current selection. |
|  [`removeHandlerAsync(eventType, options, callback)`](local.office_binding.removehandlerasync.md) | `void` | Removes an event handler from the object using the specified event type. |
|  [`setDataAsync(data, options, callback)`](local.office_binding.setdataasync.md) | `void` | Writes the specified data into the current selection. |

