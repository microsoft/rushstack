[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [rank\_Avg](local.excel_functions.rank_avg.md)

# Excel\_Functions.rank\_Avg method

Returns the rank of a number in a list of numbers: its size relative to other values in the list; if more than one value has the same rank, the average rank is returned. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
rank_Avg(number: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, ref: Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, order?: boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<number>;
```
**Returns:** `FunctionResult<number>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `number` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `ref` | `Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `order` | `boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |

