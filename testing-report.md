Testing scope

I completed testing and troubleshooting for Signal’s login, sign-up, and dashboard features. I used the project editor’s built-in Browser preview on Windows and inspected records in the CMS tab.

Test results

| Test | Expected result | Observed result | Status |

| --- | --- | --- | --- |

| Load the local app | The Signal dashboard opens. | The dashboard loaded successfully. | Passed |

| Log in | The app signs me in with valid credentials. | I logged in successfully. | Passed |

| Log out | The app ends my signed-in session. | I logged out successfully. | Passed |

- The dashboard loaded and displayed its predefined entries.
  
- I opened an existing task in the CMS and viewed details such as its status and priority score.

- The sign-up form appeared to save the information I entered. This was a total success
  


Troubleshooting summary

During my initial test in the Figma preview, the workspace stayed closed when I tried to sign in with both an existing account and a newly registered account. 
I recorded sign-in as the highest-priority issue because it blocked access to the workspace.
After pulling the latest changes from main, I retested Signal locally. The dashboard loaded, and I was able to sign in and sign out successfully. 
and I imported a schedule using Use URL under Calendar → Smart Import. All four checks passed on the local build
