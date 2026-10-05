# Changelog

## 1.2.0 - submitted for review October 5, 2026

- Moved the controls into Chrome's side panel so automatic tab switches do not dismiss them.
- Removed the repeated setup/status headlines and Ready pill. A visual deck summary shows the tab count and loop time beside the preserved expressive timer.
- Kept reorder arrows visible during playback; they become available again when rotation stops.
- Kept playback controls above the tab list and available while scrolling; made the layout fit the panel's width.
- Added the `sidePanel` permission for the persistent controls. Website access remains optional.

## 1.1.0 - published

- Reworked the popup with light and dark themes, keyboard-accessible controls, and reduced-motion support.
- Added persistent draft selections and keyboard alternatives to dragging tabs.
- Fixed rotation recovery when Chrome suspends the background worker, pause/resume timing, and overlapping actions.
- Fixed handling of closed, moved, replaced, and reloaded tabs.
- Saved decks reuse matching open tabs and preserve repeated URLs with different durations.
- Website access is optional. Rotation works without page countdowns or fades.
- Isolated page effects from website styles and fixed fade and overlay cleanup.
- Removed the offscreen timer and remote font requests. The extension uses Chrome alarms with short timers and stores the active deck for the current browser session.
- Added an offline privacy page, submission documentation, store artwork, and a reproducible release package.

The extension remains free to use. Version 1.1.0 was submitted on September 27, 2026 and is published. Version 1.2.0 was submitted on October 5, 2026 and is pending review, set to publish automatically once approved.
