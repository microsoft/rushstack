[Home](./index) &gt; [local](local.md) &gt; [Office\_AuthOptions](local.office_authoptions.md) &gt; [authChallenge](local.office_authoptions.authchallenge.md)

# Office\_AuthOptions.authChallenge property

Optional. Causes Office to prompt the user to provide the additional factor when the tenancy being targeted by Microsoft Graph requires multifactor authentication. The string value identifies the type of additional factor that is required. In most cases, you won't know at development time whether the user's tenant requires an additional factor or what the string should be. So this option would be used in a "second try" call of getAccessTokenAsync after Microsoft Graph has sent an error requesting the additional factor and containing the string that should be used with the authChallenge option.

**Signature:**
```javascript
authChallenge: string
```
