# FrameDeck

> Turn your browser tabs into an auto-rotating slide deck.

FrameDeck is a Chrome extension that automatically cycles through your open browser tabs on a timer. Perfect for classroom displays, dashboards, kiosks, digital signage, or any scenario where you want hands-free tab rotation.

## Features

- **Auto-rotate tabs** — Set a timer and FrameDeck switches between your selected tabs automatically
- **Per-tab custom durations** — Override the default interval for individual tabs (show announcements for 60s, schedule for 15s)
- **Drag-to-reorder** — Arrange your tab rotation order with drag and drop
- **Saved profiles** — Save named presets of tab configurations (e.g. "Period 1", "Morning Announcements") and load them instantly
- **Visual countdown overlay** — A subtle progress bar and timer injected into the active page so viewers know when the next switch is coming
- **Smooth fade transitions** — Clean fade effect between tab switches (toggleable)
- **Keyboard shortcuts** — Control rotation without touching the mouse
- **Fullscreen ready** — Press F11 and let FrameDeck handle the rest
- **No iframe limitations** — Works with any website since it uses real browser tabs, not iframes

## Installation

1. Clone or download this repository
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (toggle in the top-right)
4. Click **Load unpacked**
5. Select the `extension` folder inside this repo

## Usage

1. Open the tabs you want in your rotation
2. Click the FrameDeck icon in the Chrome toolbar
3. Check/uncheck tabs to include in rotation
4. Drag tabs to set your preferred order
5. Set the default interval (seconds per tab)
6. Optionally set custom durations for individual tabs
7. Click **Start Rotation**
8. Press **F11** for fullscreen

### Profiles

Save your current tab setup as a named profile:

1. Configure your tabs, intervals, and settings
2. Click the **save icon** in the Profile section
3. Enter a name (e.g. "Period 1")
4. To reload later, select the profile from the dropdown and click the **load icon**

### Settings

| Setting | Description |
|---------|-------------|
| Default interval | Time in seconds before switching to the next tab (5-600) |
| Countdown overlay | Shows a progress bar and countdown timer on the active page |
| Fade transitions | Smooth fade effect when switching between tabs |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt + Space` | Toggle play/pause |
| `Alt + Left` | Previous tab |
| `Alt + Right` | Next tab |
| `F11` | Toggle fullscreen (Chrome built-in) |

## Architecture

```
extension/
  manifest.json       Manifest V3 config
  background.js       Service worker — rotation logic, tab switching, profiles
  offscreen.html/js   Reliable timer (service workers get killed by Chrome)
  content.js          Countdown overlay + fade transitions injected into pages
  popup.html/css/js   Extension popup UI
  icons/              Extension icons
```

**Key design decisions:**
- **Offscreen document** for timers — Chrome kills service workers after 30s of inactivity and `chrome.alarms` has a 30s minimum interval. The offscreen document runs a reliable `setInterval`.
- **Content script** for overlays — Injects a minimal countdown bar and fade transition into pages, communicating with the background via `chrome.runtime.onMessage`.
- **Per-tab timers** — After each tab switch, the timer restarts with that tab's specific duration, enabling different display times per tab.
- **Real tabs, not iframes** — Most useful sites (Google Slides, Canvas LMS, etc.) block iframe embedding via `X-Frame-Options`. Using real browser tabs bypasses this entirely.

## License

MIT
