[Home](./index) &gt; [local](local.md) &gt; [Office\_Mailbox](local.office_mailbox.md)

# Office\_Mailbox interface

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [`diagnostics`](local.office_mailbox.diagnostics.md) | `Diagnostics` |  |
|  [`ewsUrl`](local.office_mailbox.ewsurl.md) | `string` |  |
|  [`item`](local.office_mailbox.item.md) | `Item` |  |
|  [`userProfile`](local.office_mailbox.userprofile.md) | `UserProfile` |  |

## Methods

|  Method | Returns | Description |
|  --- | --- | --- |
|  [`addHandlerAsync(eventType, handler, options, callback)`](local.office_mailbox.addhandlerasync.md) | `void` | Adds an event handler for a supported event |
|  [`convertToEwsId(itemId, restVersion)`](local.office_mailbox.converttoewsid.md) | `string` | Converts an item ID formatted for REST into EWS format. |
|  [`convertToLocalClientTime(timeValue)`](local.office_mailbox.converttolocalclienttime.md) | `LocalClientTime` | Gets a Date object from a dictionary containing time information |
|  [`convertToRestId(itemId, restVersion)`](local.office_mailbox.converttorestid.md) | `string` | Converts an item ID formatted for EWS into REST format. |
|  [`convertToUtcClientTime(input)`](local.office_mailbox.converttoutcclienttime.md) | `Date` | Gets a dictionary containing time information in local client time |
|  [`displayAppointmentForm(itemId)`](local.office_mailbox.displayappointmentform.md) | `void` | Displays an existing calendar appointment |
|  [`displayMessageForm(itemId)`](local.office_mailbox.displaymessageform.md) | `void` | Displays an existing message |
|  [`displayNewAppointmentForm(parameters)`](local.office_mailbox.displaynewappointmentform.md) | `void` | Displays a form for creating a new calendar appointment |
|  [`displayNewMessageForm(options)`](local.office_mailbox.displaynewmessageform.md) | `void` | Displays a new message form WARNING: This api is not officially released, and may not work on all platforms |
|  [`getCallbackTokenAsync(callback, userContext)`](local.office_mailbox.getcallbacktokenasync.md) | `void` | Gets a string that contains a token used to get an attachment or item from an Exchange Server |
|  [`getUserIdentityTokenAsync(callback, userContext)`](local.office_mailbox.getuseridentitytokenasync.md) | `void` | Gets a token identifying the user and the app for Office |
|  [`makeEwsRequestAsync(data, callback, userContext)`](local.office_mailbox.makeewsrequestasync.md) | `void` | Makes an asynchronous request to an Exchange Web Services (EWS) service on the Exchange server that hosts the user’s mailbox |

