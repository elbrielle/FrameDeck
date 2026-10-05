# Release checklist

FrameDeck is free to install and use, with no paid features or in-app purchases. This repository prepares a Chrome Web Store submission; package validation does not establish store approval or publication. Start with [SUBMISSION.md](SUBMISSION.md) for the exact upload files and remaining account steps.

October 5 checkpoint: 1.1.0 is published. The 1.2.0 side-panel update was uploaded and submitted for review with automatic publishing; the dashboard shows Pending review.

## Build the candidate

1. Complete the code checks and browser checks below.
2. Confirm the manifest name, description, version, minimum Chrome version, and permission list. The description must fit within 132 characters. Increase the version if that version was already uploaded.
3. Run `python3 scripts/package.py` from the repository root.
4. Use the generated `dist/FrameDeck-<version>-submission/` folder. Upload only its `FrameDeck-<version>.zip` as the extension package; `manifest.json` is at its root. The folder also contains the listing text, images, privacy policy, reviewer instructions, and checksum inventory.

The packager checks referenced manifest files, PNG icon sizes, version format, and exact ZIP contents. It excludes repository metadata, tests, docs, and store art. It is not a full Chrome policy checker. [Chrome's packaging requirements](https://developer.chrome.com/docs/webstore/prepare).

## Browser acceptance

See [QA.md](QA.md) for the completed local checks and their exact evidence. The remaining boxes below distinguish the full manual release matrix from those automated and focused live checks.

Run these on the exact candidate. Record browser/OS versions and observed results; leave an unchecked item open until it is actually observed.

- [x] Load unpacked from `extension` without manifest or service-worker errors.
- [x] Keep the same native side-panel document open through three automatic switches at 7/10-second durations; use Pause, Resume and Stop from that panel.
- [x] Preserve the timer’s setup/playing/paused shapes and visible reorder arrows at narrow and wide panel widths; respect reduced motion.
- [x] Start a two-tab deck; verify rotation with the popup closed at both a short interval and an interval longer than 30 seconds.
- [x] Pause partway through a duration; wait; resume and verify the remaining time is used.
- [ ] Step next and previous while running and while paused. Stop during a transition; verify no later tab switch or obscuring fade remains.
- [x] Reorder by mouse and keyboard. Change a per-tab duration; verify the correct tab uses it.
- [x] Save and load a deck, including duplicate URLs with different durations. Reuse existing matching tabs and reopen only the missing entries.
- [x] Close the current tab and the deck's window; move a selected tab to another window. Verify orderly removal or stop.
- [ ] Close a non-current selected tab during rotation (covered by the Node regression check; live pass still optional).
- [x] Open FrameDeck from another window during rotation; confirm that controls clearly refer to the active deck.
- [ ] Grant, deny, and revoke optional website access. Verify rotation works without effects. Test a normal webpage and a protected page.
- [x] Reload a selected webpage during rotation and verify the countdown remains consistent where page access is granted.
- [ ] Check keyboard-only operation, visible focus, screen-reader labels, reduced motion, and both light and dark appearance.
- [x] Restart the extension worker during a long interval. Confirm state and scheduling recover without a duplicate switch.
- [x] Restart Chrome: rotation stops while saved decks remain.
- [ ] Physical computer sleep/wake: verify no burst of catch-up switches. Overdue-deadline recovery is covered by a deterministic test; physical sleep has not been tested.
- [x] Review the popup's network activity. Confirm no remote fonts, analytics, or icon requests originate from FrameDeck. Loaded websites have their own normal traffic.

## Listing assets

Use current product screenshots without private tab names, accounts, or identifying classroom data. Keep the user's existing top-level `store_assets` images; refreshed release art goes in its versioned subfolder.

| Asset | Required size | Store requirement |
| --- | --- | --- |
| Extension icon | 128 × 128 PNG | Required in the ZIP; should work on light and dark surfaces. |
| Small promotional tile | 440 × 280 | Required; communicates the brand. |
| Product screenshot | 1280 × 800 preferred, or 640 × 400 | At least one, up to five; show the actual experience with square corners and no padding. |
| Marquee | 1400 × 560 | Optional. |

The refreshed promotional files are in `store_assets/v1.2.0/`. `scripts/render-assets.cjs` renders the checked-in SVG mark into PNG icons and promotional art using an existing Playwright installation; it adds no runtime dependency to the extension. Set `PLAYWRIGHT_MODULE` to that installation's module path and, if needed, `CHROME_EXECUTABLE` to your installed Chrome binary, then run `node scripts/render-assets.cjs`. PNG dimensions are verified during rendering. When `artifacts/popup-light.png` and `artifacts/popup-playing.png` are present, the script also produces `screenshot-setup.png` and `screenshot-playing.png` at 1280 × 800. These are branded presentations of real loaded-extension captures, preserved without UI edits and captured at a 420 × 600 CSS viewport (2× pixel density) and scaled proportionally to 504 × 720. The caption identifies the example tabs. The source captures remain in `artifacts/` for inspection.

Google distinguishes brand artwork from product screenshots. Use the generated preview only when it accurately represents the final UI; a real extension screenshot is the final source of truth. [Official image requirements](https://developer.chrome.com/docs/webstore/images).

## Owner actions before submission

- [x] Verify the personal publisher account and existing FrameDeck item. The September 27 dashboard shows no registration or contact blocker. Review any public contact details before submission. [Account setup](https://developer.chrome.com/docs/webstore/set-up-account).
- [x] Publish the owner-approved [PRIVACY.md](PRIVACY.md), verify its public HTTPS URL without authentication, and save the URL in the draft. The extension handles URLs locally, so a public privacy policy is required. [Chrome's local-data policy explanation](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).
- [x] Save the revised listing and Free of charge / Public / all-regions draft preferences.
- [x] Upload the verified 1.1.0 ZIP, screenshots, small tile, and marquee. Read back the parsed version and permissions against the shipped manifest.
- [x] Replace the old store icon after owner confirmation and visually verify the current icon and artwork.
- [x] Save permission explanations, no-remote-code declaration, Web history disclosure, limited-use declarations, and reviewer instructions. Keep claims consistent with the policy and shipped code; owner reviews the complete draft before submission. [Privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy).
- [x] Owner submitted 1.1.0; the dashboard confirms Pending review. 1.1.0 is now published. Version 1.2.0 was submitted on October 5 with automatic publishing after review. Approval and live availability are different states. [Submission and deferred publishing](https://developer.chrome.com/docs/webstore/publish).

After publication, record the store URL, extension ID, published version, and a successful installation from the store. Do not infer a live release from an uploaded ZIP or a submitted review.
