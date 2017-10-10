[Home](./index) &gt; [local](local.md) &gt; [Office\_Bindings](local.office_bindings.md)

# Office\_Bindings interface

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [`document`](local.office_bindings.document.md) | `Document` |  |

## Methods

|  Method | Returns | Description |
|  --- | --- | --- |
|  [`addFromNamedItemAsync(itemName, bindingType, options, callback)`](local.office_bindings.addfromnameditemasync.md) | `void` | Creates a binding against a named object in the document |
|  [`addFromPromptAsync(bindingType, options, callback)`](local.office_bindings.addfrompromptasync.md) | `void` | Create a binding by prompting the user to make a selection on the document. |
|  [`addFromSelectionAsync(bindingType, options, callback)`](local.office_bindings.addfromselectionasync.md) | `void` | Create a binding based on what the user's current selection. |
|  [`getAllAsync(options, callback)`](local.office_bindings.getallasync.md) | `void` | Gets an array with all the binding objects in the document. |
|  [`getByIdAsync(id, options, callback)`](local.office_bindings.getbyidasync.md) | `void` | Retrieves a binding based on its Name |
|  [`releaseByIdAsync(id, options, callback)`](local.office_bindings.releasebyidasync.md) | `void` | Removes the binding from the document |

