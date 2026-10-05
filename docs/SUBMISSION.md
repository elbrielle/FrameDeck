# FrameDeck release handoff

Updated October 5, 2026. FrameDeck is free to install and use. The release has no subscriptions, paid features, advertising, or in-app purchases.

## Current update: 1.2.0

Version 1.2.0 moves the controls into Chrome's persistent side panel and removes the repeated headlines. The expressive timer, state morphs, and visible reorder arrows are retained. On October 5 the 1.2.0 ZIP (SHA-256 `ff3b03f9…5090`) was uploaded from `dist/FrameDeck-1.2.0-submission/`, the two screenshots were replaced, the `sidePanel` justification and 1.2.0 reviewer instructions were saved, and the draft was submitted for review with automatic publishing. The dashboard shows **Pending review**; 1.1.0 stays live until approval. The separate 1.1.0 ZIP and submission folder are preserved.

## Published version: 1.1.0

The personal Google account was verified in the developer dashboard on September 27. Publisher `elishalucero` has the existing [FrameDeck draft](https://chrome.google.com/webstore/devconsole/1eb22e57-60ac-4810-be6a-815cb12ef659/jajfoopmcodlfhnecknjlhnodlmaiigj/edit), item ID `jajfoopmcodlfhnecknjlhnodlmaiigj`. **Version 1.1.0 is uploaded.** The package page confirms `tabs`, `storage`, `alarms`, and `scripting`, and says the item is not published. The separate older `iFrameDeck` draft is unchanged.

Saved and verified in the dashboard:

- Revised description, English, Tools under Productivity, and the repository homepage/support links.
- Current store icon, setup and rotation screenshots, small promotional tile, and marquee.
- Single purpose and four permission explanations, including optional website access in the scripting explanation; no remote code.
- Web history disclosure, whose current definition explicitly includes page URLs and associated titles, and the three limited-use declarations. Other data categories remain unselected.
- Free of charge, Public, all regions. These are draft distribution preferences, not a published listing.
- Reviewer instructions, shortened to 449 characters for the dashboard's 500-character limit; no login credentials are needed.

The owner approved public policy hosting and the icon replacement. The [privacy policy](https://github.com/elbrielle/FrameDeck/blob/main/docs/PRIVACY.md) is public at repository commit `bf8770dda636b460b2c77246b98e71861a26a63f`; an unauthenticated GET returned the exact approved source bytes. The owner submitted 1.1.0 on September 27, and the dashboard confirms **Pending review**. No published version is shown. This update does not withdraw or change that submission.

The release source and documentation are committed on `main`.

## Files to upload

Run `python3 scripts/package.py` to build `dist/FrameDeck-1.2.0-submission/`.

| Dashboard field | File or value |
| --- | --- |
| Extension package | `FrameDeck-1.2.0.zip` only |
| Name | FrameDeck |
| Version | 1.2.0 |
| Description | `listing-description.txt` |
| Language | English |
| Category | Tools, under Productivity |
| Price | Free; no in-app purchases |
| Visibility and regions | Public, all regions; keep the item in draft while staging |
| Icon | `store-assets/icon_128x128.png` |
| Small promotional image | `store-assets/promo_tile_440x280.png` |
| Screenshots | `store-assets/screenshot-setup.png`, then `screenshot-playing.png` |
| Marquee | `store-assets/marquee_1400x560.png` (optional) |
| Single purpose | `single-purpose.txt` |
| Permission explanations | `permissions.md` |
| Remote code | No; all JavaScript is in the extension package |
| Reviewer instructions | `reviewer-instructions.txt` |
| Homepage | https://github.com/elbrielle/FrameDeck |
| Support | https://github.com/elbrielle/FrameDeck/issues |
| Privacy policy | https://github.com/elbrielle/FrameDeck/blob/main/docs/PRIVACY.md |

The public repository and enabled issue tracker were verified. The package includes an offline privacy page accessible from the panel. `SHA256SUMS.txt` covers the staged files; the extension ZIP is the only ZIP to upload as the package.

## Before submitting

1. Use the personal publisher account and existing FrameDeck draft identified above. Do not use the school account.
2. Check for any outstanding publisher requirements. If Google requests registration, developer terms, or payment, the owner must handle those steps. A registration fee is separate from FrameDeck being free to users. [Google's registration instructions](https://developer.chrome.com/docs/webstore/register).
3. The public privacy URL above is verified and saved. Keep that policy consistent with any later code changes. `privacy.html` remains included as an offline copy and alternate hosting source.
4. Version 1.1.0 is published. Version 1.2.0 is pending review; do not withdraw it without an owner decision.
5. Review any public publisher contact details. Complete any new verification or trader-status requests based on the owner's actual circumstances; the current dashboard reports none as submission blockers.
6. Review the saved data-use fields against `STORE_LISTING.md`. The current Web history category covers both URLs and associated tab titles. The extension stores chosen URLs locally and does not extract page content. [Privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy).
7. Review the complete saved draft. Submit for review only after that final review; use deferred publishing if approval should not immediately make the extension public. [Publishing and staging](https://developer.chrome.com/docs/webstore/publish).

Version 1.1.0 is published. Version 1.2.0 is submitted and pending review; it is not yet approved.

## Validation

See `QA.md` for observed behavior and limits. The code checks use Node's built-in test runner; browser checks use disposable profiles and synthetic pages. The package builder verifies every ZIP entry against the source and checks image dimensions.

Manual checks that need a particular operating system, physical sleep/wake, or assistive technology remain identified in `RELEASE.md`. They are not marked complete by a source review.
