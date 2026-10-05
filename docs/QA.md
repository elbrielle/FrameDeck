# FrameDeck validation

## 1.1.0 baseline

The sections below retain the original release evidence. See the September 27 side-panel section for the current 1.2.0 update; lifecycle and page-effects results remain historical 1.1.0 checks.

Validated September 25, 2026 (America/Chicago), on macOS 27.0 with Chrome for Testing 153.0.8010.12 and Node 25.9.0. These results describe the local release candidate, not Chrome Web Store approval or an installation from the store.

## Runnable checks

```sh
node --test tests/*.test.cjs
python3 scripts/package.py
```

The 27 Node checks use only built-in modules. They cover worker hydration and deadline recovery; pause/resume; delayed and stale timers; serial execution; tab removal/movement/replacement; validation and sender restrictions; failed activation and persistence; legacy/duplicate-URL decks; optional injection; overlay cleanup and reduced motion; popup refresh races; typed-value preservation; and keyboard focus.

The optional browser checks use an existing Playwright installation and a Chrome/Chromium binary that supports loading unpacked extensions:

```sh
export PLAYWRIGHT_MODULE=/absolute/path/to/playwright
export CHROMIUM_PATH=/absolute/path/to/chrome
node tests/browser.cjs
node tests/lifecycle.cjs
node tests/native-effects.cjs
node tests/side-panel.cjs
```

`native-effects.cjs` is an interactive check: accept the permission prompt in its disposable test profile. None of these tests use the user's personal Chrome profile. Browser timing is best effort; waits allow small scheduling differences.

## Observed in the loaded extension

- The actual popup code renders in light and dark modes, respects reduced motion, and produces no page errors or external network requests from the popup. Mouse drag and keyboard reordering both pass; keyboard reordering preserves focus; selection, custom timing, and order survive reopening. A title update does not erase an unfinished duration edit.
- Saving and loading a deck retains its order and durations and reuses open matching tabs. A single click on Play after editing the default duration commits the edit and starts playback.
- Five-second rotation, per-tab timing, pause/resume with the remaining time, previous/next while paused, current-tab closure, stop, and explicit worker termination/recovery pass in the browser.
- With the popup closed and Playwright disconnected, a five-second rotation advanced successfully. During the 31-second test, Chrome naturally destroyed the worker at 30.008 seconds and recreated it at 30.985 seconds for the alarm. No extension messages or debugger attachments kept it awake during that interval.
- A complete browser restart with the same disposable profile retained the saved deck and cleared active rotation and runtime tab IDs.
- The native optional-permission prompt was accepted in a disposable headed browser. Countdown injection, webpage reload without changing the deadline, next-tab transition, cleanup of the old page, and revocation with overlay removal all passed.
- The native toolbar popup was also opened through `chrome.action.openPopup` and inspected independently of the tab preview. It uses a fixed 420-pixel width; Chrome may reduce its available height on a small display, leaving native scrolling available.

Machine-readable records and original captures are in `artifacts/browser-results.json`, `artifacts/lifecycle-results.json`, `artifacts/native-effects-results.json`, and the adjacent popup PNGs. Store screenshots use the captured extension UI with synthetic local demo tabs, presented within branded layouts; they do not show private browsing data.

## Design decisions and reference

The design uses HalllDay's `docs/sprint-bp/material-expressive/GUIDE.md` and `MOTION_MAP.md`: solid paired color roles; typography that emphasizes the default pace; a distinct play action; grouped tab rows; shape changes for pause and press; and a bounded reorder transition. CSS spatial motion uses a spring-like web easing approximation, not a physics simulation. Color and opacity use non-overshooting timing. All movement is disabled by reduced-motion preference.

The extension keeps native checkboxes, number fields, a select, disclosures, and dialogs. Reordering has visible button alternatives to dragging. It loads no remote fonts, favicon services, runtime libraries, analytics, or executable code.

Reference: [Material Expressive](https://m3.material.io/blog/building-with-m3-expressive), [motion specifications](https://m3.material.io/styles/motion/overview/specs), [Chrome worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle), [alarm timing limits](https://developer.chrome.com/docs/extensions/reference/api/alarms).

## Limits and final release gate

Real browser results are from macOS and Chrome 153; they do not establish physical-device sleep/wake behavior, Windows/Linux shortcut compatibility, performance on every website, older-Chrome execution, or assistive-technology acceptance with a screen reader. Protected-page effects and permission-denial handling are guarded in source; the native grant/revoke route was the live permission test. Unit tests establish additional edge cases, including duplicate URLs and moved/replaced tabs; those are distinct from the listed live checks.

The local validation is separate from the store checkpoint below. The owner has submitted 1.1.0 for review. Chrome approval and extension publication remain outstanding. No account agreement was changed by this work.

## Copy revision

The popup and store copy now use Elisha's classroom explanation: rotating the Canvas module page, bell schedule countdown, and hall-pass app without embedding them. The revised public description, popup HTML, and asset-generator copy passed the voice profile's mechanical checks; wording was also reviewed for generic slogans and unnecessary sales language. Browser captures and the release ZIP were regenerated. The browser-test pages now send `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'`; rotation still passes because they load as tabs. These are synthetic test pages, not a live Canvas or hall-pass integration test.

## September 26 release staging

The 27 Node checks passed again, and the loaded-extension browser check was expanded to cover duplicate-URL decks with distinct durations, loading without duplicate tabs, reopening a missing tab, controls opened in another window, moving a selected tab to another window, and closing the rotation's window. All passed on Chrome for Testing 153.0.8010.12. The new offline privacy link opens the generated policy from the installed package.

The submission folder now separates the extension ZIP from images and paste-ready dashboard text. The package builder generates the offline policy from `docs/PRIVACY.md`, checks the listing description against the manifest, verifies store image dimensions, and writes checksums for the complete submission folder.

At the September 26 checkpoint, publisher sign-in remained outstanding. The privacy-policy source and a hostable HTML copy were prepared; no public policy URL was claimed.

## September 27 publisher checkpoint

The signed-in personal Google account and publisher `elishalucero` were verified through Chrome's native interface. The dashboard lists FrameDeck version 1.0.0 as a draft, item `jajfoopmcodlfhnecknjlhnodlmaiigj`; its existing editor was opened. A separate older iFrameDeck draft was left unchanged. The 1.1.0 ZIP checksum remains `7b7e4a4f9595ea88b4d91eb1e6657dacc00fb32fafb061a6993b10bd8a1c39d7`.

Later on September 27, version 1.1.0 was uploaded to that existing draft. The package page confirms the new version and `tabs`, `storage`, `alarms`, and `scripting` permissions. The revised listing, both screenshots, small tile, marquee, permission explanations, local browsing-data disclosure, and reviewer instructions were saved and read back. Distribution remains Free of charge, Public, all regions.

Chrome initially reported a missing privacy-policy URL as the only blocker. With owner approval, the exact policy was published to the public repository at commit `bf8770dda636b460b2c77246b98e71861a26a63f`; an unauthenticated GET matched the local source bytes. The URL was saved, and the store icon was replaced and visually verified. **Submit for review was enabled.** The owner then submitted 1.1.0, and the dashboard confirmed Pending review. No published version was shown.

## September 27 side-panel update: 1.2.0

Chrome dismisses a toolbar popup when it loses focus. Rotation changes the active tab, so keeping controls in that popup made short rotations difficult to manage. Version 1.2.0 uses Chrome's window-wide side panel and `openPanelOnActionClick`; the existing control page and rotation engine are reused. The new `sidePanel` permission supplies browser UI and does not grant additional website access. [Popup behavior](https://developer.chrome.com/docs/extensions/develop/ui/add-popup), [Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel).

The headed `tests/side-panel.cjs` check observed the same native SIDE_PANEL document through three automatic switches using 7- and 10-second durations. Native Pause froze the remaining time; Resume restarted it; Stop left the panel open. Evidence is in `artifacts/side-panel-results.json`. That focused test preceded the final timer restoration; the browser check below covers the revised controls.

The current `tests/browser.cjs` pass covers the full acceptance flow above plus 320/420/580-pixel layouts, no horizontal overflow, and Pause remaining near the top. It verifies that the timer keeps the same element when moving between playback states, reaches the round playing shape and paused rounded-square shape, and disables morph transitions for reduced motion. Reorder arrows remain visible during playback and are disabled until Stop; the existing mouse and keyboard reorder checks still pass. A test-harness race was also corrected: another-window controls are selected by their extension URL, because reopening a website can deliver a delayed page event.

The design correction preserves the original expressive timer and rounded typography. The repeated eyebrow and large setup/status headline are removed. The actual tab title, position, and timing value now provide the hierarchy. This follows the user's specific feedback and Impeccable's guidance to preserve the working design system when refining an interface. [Impeccable guidance](https://impeccable.style/docs/).

| Reference or feedback | Result |
| --- | --- |
| Material expressive type and shape | Large useful timing value in the original asymmetric setup shape; one container morphs to playing and paused states. |
| Material bounded motion | Existing spatial easing, short color transitions, stable row reordering, and reduced-motion support. |
| User's headline correction | No “Tab Rotation” eyebrow or “Choose your tabs” hero headline. |
| User's reorder controls | Arrows stay visible in the tab rows, with disabled states while the deck is active. |
| Native pane continuity | Chrome hosts the controls beside the page; the same document survives automatic tab activation. |

Current captures are `artifacts/popup-light.png`, `popup-dark.png`, `popup-paused.png`, `popup-playing.png`, `panel-playing-320.png`, and `panel-playing-580.png`. These show real extension UI using synthetic pages; PNGs demonstrate layout, while the browser checks cover state and motion behavior. The 1.2.0 package and artwork are local only. The submitted 1.1.0 package is unchanged.

The existing unpacked installation was then reloaded in the owner's personal Chrome profile. Chrome's extension details showed version 1.2.0, enabled, loaded from this repository's `extension` folder. The toolbar action opened the native side panel with the restored timer and arrows, and switching to another existing tab kept the panel visible. Rotation was left stopped. The personal-browser screenshot remains local and is excluded from release artifacts.


### Header balance revision

After another review with the owner, the setup header uses a tonal stack of pages with a large tab count and loop duration. The Ready pill, dotted metadata sentence, and repeated count in the Play label are removed. The timer on the right keeps its original shape and state morphs. A visually hidden status remains available to assistive technology. The HalllDay packet's typography examples (`media/posters/7bf9836860.jpg` and `a3609ee9e5.jpg`) informed the emphasis on actual values; its paired color roles and containment guidance informed the deck shape.

The browser acceptance check passed again, including no overflow in setup at 320/420/580 pixels, light/dark captures, zero/one/multiple selections, calculated loop time, timer morphs, reduced motion, visible arrows, and the existing rotation/saved-deck checks. New setup captures are `artifacts/panel-setup-320.png` and `panel-setup-580.png`. The existing personal Chrome panel was closed and reopened to load the UI revision, preserving the owner's selection and timings; the refreshed header was verified through native Chrome. No store draft or submitted package was changed.

The stack's rear sheets were subsequently inset on the right to stay inside the front card's 24px rounded corner, removing the small protruding green lip. The CSS-only correction was rendered at 320/420/580 pixels and in dark mode, then visually verified in the refreshed personal Chrome panel. `artifacts/header-corner-fixed.png` captures the corrected header. Playback logic is unchanged.
