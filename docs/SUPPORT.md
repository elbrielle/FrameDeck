# FrameDeck help

FrameDeck is free to use. It runs in Chrome on your computer and does not require a FrameDeck account.

## Start a deck

Open the pages you want to show in one Chrome window. Open FrameDeck from the toolbar, select at least two tabs, and set the seconds per tab. Drag the tabs or use the arrow buttons to change their order, then press Play. The side panel stays open as tabs switch. You can also close it while rotation continues.

A saved deck keeps the page URLs and timing. Loading it reuses matching tabs and opens missing ones. You may need to sign in to the websites themselves. FrameDeck does not save passwords or keep expired website sessions signed in.

## Common questions

| Problem | What to check |
| --- | --- |
| A tab is missing from the list | Use an HTTP or HTTPS webpage in the same window. Chrome settings, the new-tab page, extension pages, and local files are excluded. |
| Play is disabled | Select at least two website tabs. |
| The wrong window's tabs appear | Only one deck can run at a time. The panel shows the running deck and labels it as another window when applicable. Stop it to set up a new deck in this window. |
| The controls close when tabs switch | Version 1.2.0 uses a persistent side panel. Earlier versions used a toolbar popup, which Chrome closes when focus changes. |
| I cannot change the selected tabs or their order | Stop playback first. You can change an individual tab's duration during playback. |
| The countdown or fade is missing | Enable the effect and allow website access when Chrome asks. Protected pages, including the Chrome Web Store, may block effects. Tab rotation can still work. |
| A keyboard shortcut does nothing | Open `chrome://extensions/shortcuts` and assign a key combination that is not reserved by your operating system or another extension. |
| Rotation stopped after restarting Chrome | This is expected. Load a saved deck and press Play again. |
| Switching was late after the computer slept | Keep Chrome and the computer awake during a display. Browser scheduling is not a precision clock. |
| A page is showing old information | FrameDeck switches tabs; it does not periodically reload pages. Refresh the page or use that website's own update controls. |
| Browser controls are visible | Use Chrome's fullscreen command. FrameDeck does not change fullscreen automatically. |

## Privacy and deletion

Use the Privacy link at the bottom of the panel to read the policy offline. You can remove website access from Page effects & shortcuts. Delete a saved deck to remove its stored URLs; uninstalling the extension removes its storage. See [PRIVACY.md](PRIVACY.md) for details.

## Report a problem

Open an issue at https://github.com/elbrielle/FrameDeck/issues. Include the FrameDeck version, Chrome version, operating system, and steps that reproduce the problem. Describe what happened and what you expected.

Do not post private tab URLs, login details, student information, or screenshots containing sensitive data. Use a public example page when possible. Privacy questions can also go to the developer contact on the Chrome Web Store listing once it is published.
