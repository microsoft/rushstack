[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [dget](local.excel_functions.dget.md)

# Excel\_Functions.dget method

Extracts from a database a single record that matches the conditions you specify. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
dget(database: Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, field: number | string | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, criteria: string | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<number | boolean | string>;
```
**Returns:** `FunctionResult<number | boolean | string>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `database` | `Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `field` | `number | string | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `criteria` | `string | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |

