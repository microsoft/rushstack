<!--------------------------------------------------------------------------
👉 STEP 1: Before getting started, please read the contributor guidelines:
     https://rushstack.io/pages/contributing/get_started/
--------------------------------------------------------------------------->

<!--------------------------------------------------------------------------
👉 STEP 2: We thoughtfully review both implementation AND feature design.
     If you are making a nontrivial change, it's recommended to first create
     a GitHub issue and get feedback on your proposed design.
--------------------------------------------------------------------------->

<!--------------------------------------------------------------------------
👉 STEP 3: Write a concise but specific PR title in the box above.
     Prefix your PR with a relevant Rush Stack package name in brackets.
     For example, if your PR fixes the "@rushstack/ts-command-line" project,
     then your GitHub title might look like:

     "[ts-command-line] Add support for numeric command line parameters"
--------------------------------------------------------------------------->

## Summary

<!--------------------------------------------------------------------------
👉 STEP 4:  In a few sentences, write a summary explaining:

     From the perspective of an end user, what problem are you solving?
     What did you change?

     You can add the magic phrase "Fixes #1234" to automatically close
     issue #1234 when your PR is merged.
--------------------------------------------------------------------------->

## Details

<!--------------------------------------------------------------------------
👉 STEP 5: Provide additional details about your fix:

     How did you solve the problem?
     Mention any alternate approaches you considered.
     Did you completely solve the problem, or are some cases not handled yet?
     Does this change break backwards compatibility?
     Could any aspects of your change impact performance?
--------------------------------------------------------------------------->

## How it was tested

<!--------------------------------------------------------------------------
👉 STEP 6: What test cases did you use to validate your work?
     Given the complexities of how build tools interact with the OS, we only
     require unit tests for algorithmic code (e.g. parsing a string, sorting a list).
     Manual testing is fine; you might write something like:

     "Invoked 'rush install' with useWorkspaces=true and useWorkspaces=false
     and confirmed that peer dependencies were handled correctly."

     NOTE: Manual testing should be performed on the *final* commit.
     Pushing additional commits with "small" fixes often invalidates testing.
--------------------------------------------------------------------------->

## Impacted documentation

<!--------------------------------------------------------------------------
👉 STEP 7: Does your PR affect anything that is discussed in the website docs?
     If so, please paste the URL of each affected web page, so we will
     remember to update the documentation after your PR is merged.
     (Updating the website is appreciated but not required.)
     If no docs are impacted, delete the "Impacted documentation" section.

     If you modified a JSON schema, remember to update init templates such as:
     rush-lib/assets/rush-init/*.json
     api-extractor/src/schemas/api-extractor-template.json
--------------------------------------------------------------------------->

<!--------------------------------------------------------------------------
👉 STEP 8: Don't forget to run "rush change":

     https://rushjs.io/pages/best_practices/change_logs/
--------------------------------------------------------------------------->


<!-- Have a question?  Ask for help in the chat room: https://rushstack.zulipchat.com/ -->
