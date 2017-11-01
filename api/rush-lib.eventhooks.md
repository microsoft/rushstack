[Home](./index) &gt; [@microsoft/rush-lib](rush-lib.md) &gt; [EventHooks](rush-lib.eventhooks.md)

# EventHooks class

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

This class represents Rush event hooks configured for this repo. Hooks are customized script actions that Rush executes when specific events occur. The actions are expressed as a command-line that is executed using the operating system shell.

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`get(event)`](rush-lib.eventhooks.get.md) | `public` | `string[]` | Return all the scripts associated with the specified event. |

## Remarks

The constructor for this class is marked as internal. Third-party code should not call the constructor directly or create subclasses that extend the EventHooks class.

