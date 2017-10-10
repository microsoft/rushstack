[Home](./index) &gt; [local](local.md) &gt; [Excel\_FunctionResult](local.excel_functionresult.md)

# Excel\_FunctionResult class

An object containing the result of a function-evaluation operation 

 \[Api set: ExcelApi 1.2\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`error`](local.excel_functionresult.error.md) |  | `string` | Error value (such as "\#DIV/0") representing the error. If the error string is not set, then the function succeeded, and its result is written to the Value field. The error is always in the English locale. <p/> \[Api set: ExcelApi 1.2\] |
|  [`value`](local.excel_functionresult.value.md) |  | `T` | The value of function evaluation. The value field will be populated only if no error has occurred (i.e., the Error property is not set). <p/> \[Api set: ExcelApi 1.2\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_functionresult.load.md) |  | `FunctionResult<T>` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`toJSON()`](local.excel_functionresult.tojson.md) |  | `{
            "error": string;
            "value": T;
        }` |  |

