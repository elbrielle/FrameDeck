# Chrome Web Store listing draft for 1.2.0

Use this with the matching release ZIP. Recheck the shipped manifest and behavior before copying the privacy fields into the dashboard.

## Name

FrameDeck

## Short description

Use webpages as a slide deck, even when they block embedding. Rotate through tabs with separate timing for each page.

## Detailed description

I wanted a slide deck of the pages I use while teaching: today's Canvas module, the bell schedule countdown, the hall-pass app. Many websites block iframe embedding. FrameDeck uses browser tabs as the slides, which solved the issue for me.

Choose which tabs to include and how long each one should be shown. If the Canvas page needs a minute and the bell schedule only needs fifteen seconds, you can set that for each tab. The controls stay open in Chrome's side panel as the pages change.

Save a deck when you want to reuse the same tabs. Loading it opens any missing pages and uses matching tabs that are already open. It won't start rotating until you press Play.

You can pause the rotation or use the arrows to move between tabs. Countdown and fade effects are optional; Chrome asks for website access if you turn them on. Some pages, including the Chrome Web Store, block those effects.

FrameDeck is free to use and doesn't require an account. Your saved decks and settings stay in your Chrome profile, and the extension doesn't send your browsing data to the developer or an analytics service. The websites you open still handle their own traffic normally.

Keep Chrome and your device awake while a deck is running. Sleep or an interrupted extension process can delay a switch; restarting Chrome stops the rotation but keeps your saved decks.

## Pricing and distribution

Free to install and use. All features in this release are included; there are no subscriptions or in-app purchases.

Prepare a public listing for all regions, in English. Keep it as a draft until the owner completes the publisher details and final review. Do not enable automatic publication as part of staging.

## Suggested category and language

Tools, under Productivity; English. Verified in the dashboard on September 27, 2026.

## Single purpose

FrameDeck automatically cycles through a user-selected, ordered set of browser tabs for a timed display. Per-tab timing, saved decks, and optional page effects support that single purpose.

## Permission justifications

| Permission | Justification |
| --- | --- |
| `tabs` | Read open-tab titles and URLs so the user can choose, arrange, and save a deck; match saved entries to open tabs when loading it. |
| `storage` | Keep saved decks and preferences in local extension storage and current rotation state in session storage. |
| `alarms` | Schedule tab switching and recover rotation when Chrome suspends the background worker. |
| `scripting` | Inject the bundled countdown and transition script into supported deck pages after the user grants website access. |
| `sidePanel` | Keep the deck controls available in Chrome's side panel while rotation changes the active tab. |
| Optional `http://*/*`, `https://*/*` website access | The user may display arbitrary websites. Access enables the optional countdown and fade on those pages. Rotation does not require this access. No page contents are collected or transmitted. |

## Remote code

No remotely hosted code. All executable JavaScript is bundled with the extension. The popup uses system fonts and local artwork.

## Data-use disclosure facts

Use these facts to answer the current dashboard labels accurately; do not declare that no data is handled simply because it stays on the device.

| Information | Handling |
| --- | --- |
| Web history / browsing information | Current-tab URLs are read to build and restore decks; saved-deck URLs stay locally. No historical browsing log is read or created. |
| Website information | Tab titles are read through Chrome's tabs API to identify open tabs in the popup; they are not saved in decks. No page text, form data, cookies, screenshots, or page resources are extracted. |
| User-provided settings | Deck names, selected tabs and order, timing, and effects preferences stay locally. |
| Sharing and sale | No data is sent to the developer, sold, shared with advertisers, or transferred for unrelated purposes. |
| External website behavior | Reopening a deck visits its saved websites normally; each website handles its own traffic and sessions. |

The dashboard's Web history category explicitly covers visited-page URLs and associated titles. That category is selected in the draft. Website content is unselected: FrameDeck reads tab metadata through Chrome's tabs API and does not extract page content. All three limited-use declarations are selected, consistent with the shipped code and policy. These fields and the public policy must describe the same behavior. Chrome explicitly requires disclosure of local-only handling. [Official privacy guidance](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy) and [local-data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).

## Reviewer test instructions

No account is needed. Open two HTTP/HTTPS pages in one window. Open FrameDeck from the toolbar, select both, set 7 seconds and press Play. Leave the side panel open through several switches; Pause, Resume, Previous, Next and Stop should remain usable. Change timings and order, save a deck, close a page and load the deck to reopen it. Optional page effects request website access; rotation works without it. Restarting Chrome stops rotation and keeps saved decks.

## Links to supply before submission

- Privacy policy: https://github.com/elbrielle/FrameDeck/blob/main/docs/PRIVACY.md. Published with owner approval and verified without authentication on September 27, 2026; saved in the draft.
- Review the developer contact shown by the publisher account. No contact or registration blocker is currently reported by the dashboard.
- Homepage: `https://github.com/elbrielle/FrameDeck`.
- Support: `https://github.com/elbrielle/FrameDeck/issues`. The repository is public and issues are enabled.

The publisher dashboard confirms that item `jajfoopmcodlfhnecknjlhnodlmaiigj`, version 1.1.0, is published. The 1.2.0 screenshots, sidePanel justification, and reviewer instructions were saved and the update was submitted for review on October 5, 2026. The listing description was left at its 1.1.0 text; the side-panel sentence above can be added in a later listing update. The data handling and public policy are unchanged. See `SUBMISSION.md` for the current checkpoint.
