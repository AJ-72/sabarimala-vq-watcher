# Privacy Policy

**Sabarimala Virtual-Q Watcher** (Chrome extension)
Last updated: 25 November 2026

This extension helps you notice when Sabarimala Virtual-Q slots open and fills in parts of the
booking page on sabarimalaonline.org. It has no server, no account and no analytics. This page
explains what data it handles and where that data goes.

## What the extension stores

Everything below is kept in your own browser using Chrome's extension storage
(`chrome.storage.local`). It never leaves your computer unless a section further down says so.

| Data | Why |
|---|---|
| Dates to watch, tickets needed, check interval, on/off switches | Your settings |
| ntfy topic name (optional) | To send phone alerts to you |
| Pilgrim names, and each pilgrim's nominee name, age and relationship (optional) | To tick your pilgrims and fill the nominee table on the booking page |
| The result of the last availability check, and the route list | To show status in the popup and alert only when something changes |
| Short-lived markers, e.g. "date and route to pick" (cleared within minutes) | To continue the booking-page steps after you log in or change pages |

The extension does **not** store or read your portal password, OTP, CAPTCHA, ID numbers,
phone number, email address or payment details.

To delete pilgrim and nominee details, remove their lines in the popup and click
**Save nominees**. To delete everything, remove the extension from `chrome://extensions`.

## What is sent, and to whom

1. **sabarimalaonline.org (the official portal).** To check availability, the extension sends
   the same public requests the portal's own Virtual-Q availability page sends for a
   logged-out visitor. These requests are sent **without your login cookies** and contain no
   personal data: only a date and a route number.
2. **ntfy.sh (only if you enter an ntfy topic).** When slots open, the extension sends a
   message to `https://ntfy.sh/<your topic>` so it reaches your phone. The message contains
   only dates, route names, slot times, ticket counts and a link to the booking page. It never
   includes pilgrim or nominee details. ntfy.sh is a third-party service with its
   [own privacy policy](https://docs.ntfy.sh/privacy/). Anyone who knows your topic name can
   read these messages, so choose one that is hard to guess.

Nothing else is sent anywhere. The extension has no analytics, tracking, advertising or
remote code.

## On the booking page

When you are on sabarimalaonline.org, the extension reads and fills fields on the page in
your browser, the same way you would by hand: the date, the route, the pilgrim checkboxes,
the nominee table and the optional contribution choices. It reads the pilgrim names shown on
the page only to match them against your saved list. It does not send them anywhere. It never
presses Add to Wishlist, Submit or any payment button.

## Permissions

| Permission | Used for |
|---|---|
| `storage` | Keeping your settings and pilgrim/nominee details in your browser |
| `alarms` | Running the availability check every few minutes |
| `notifications` | Showing desktop alerts |
| Access to `sabarimalaonline.org` | Checking availability and filling the booking page |
| Access to `ntfy.sh` | Sending optional phone alerts |

## Children

The extension does not knowingly collect data from anyone. Any pilgrim details you enter
(including those of children in your group) stay in your browser as described above.

## Changes

If this policy changes, the new version will be published in this repository with a new
"Last updated" date.

## Contact

Open an issue at <https://github.com/AJ-72/sabarimala-vq-watcher/issues>.

This extension is not affiliated with the Travancore Devaswom Board.
