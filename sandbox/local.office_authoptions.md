[Home](./index) &gt; [local](local.md) &gt; [Office\_AuthOptions](local.office_authoptions.md)

# Office\_AuthOptions interface

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [`asyncContext`](local.office_authoptions.asynccontext.md) | `any` | Optional. A user-defined item of any type that is returned in the AsyncResult object without being altered. |
|  [`authChallenge`](local.office_authoptions.authchallenge.md) | `string` | Optional. Causes Office to prompt the user to provide the additional factor when the tenancy being targeted by Microsoft Graph requires multifactor authentication. The string value identifies the type of additional factor that is required. In most cases, you won't know at development time whether the user's tenant requires an additional factor or what the string should be. So this option would be used in a "second try" call of getAccessTokenAsync after Microsoft Graph has sent an error requesting the additional factor and containing the string that should be used with the authChallenge option. |
|  [`forceAddAccount`](local.office_authoptions.forceaddaccount.md) | `boolean` | Optional. Prompts the user to add (or to switch if already added) his or her Office account. |
|  [`forceConsent`](local.office_authoptions.forceconsent.md) | `boolean` | Optional. Causes Office to display the add-in consent experience. Useful if the add-in's Azure permissions have changed or if the user's consent has been revoked. |

