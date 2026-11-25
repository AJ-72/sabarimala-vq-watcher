# Sabarimala Virtual-Q Watcher

A Chrome extension for pilgrims trying to get a
[Sabarimala Virtual-Q](https://sabarimalaonline.org) darshan slot. Slots sell out within
seconds, and cancelled ones come back at random times during the day. This extension
watches the portal's **public** availability data for you and alerts you as soon as a date
you want has a slot with enough tickets for your group. Clicking the alert opens the booking
page with as much as possible already filled in.

**You still book it yourself.** The extension never enters your password, OTP or CAPTCHA,
never presses Add to Wishlist or Submit, and never touches payment.

> Not affiliated with or endorsed by the Travancore Devaswom Board (TDB). It reads only what
> the portal shows any visitor, and it may stop working if the portal changes.

## What it does

- **Watches availability.** Every few minutes (minimum 2) it checks which dates are open and,
  for the dates you care about, how many tickets each hour slot on each route has left.
- **Alerts only when it's useful.** An alert needs at least one slot with **Tickets needed**
  (e.g. 2 for two people) or more left. A date that shows as "open" with a single ticket
  doesn't wake you up when you need two.
- **Tells you where and when.** Each alert names the date, the route and the slot times, e.g.
  `Thu, 17 Dec · Pamba · 10:00–11:00 (2 left), 21:00–22:00 (4 left)`.
- **Desktop and phone.** You get a Chrome notification, plus an optional phone push through the
  free [ntfy](https://ntfy.sh) app.
- **One click to the booking page.** From the alert, the extension:
  1. selects the date and route,
  2. clicks **Select Pilgrim**, ticks your saved pilgrims and adds them,
  3. fills each pilgrim's **nominee** name, age and relationship,
  4. switches the optional **Pilgrim Relief fund** and **Clean Sabarimala** contributions to
     No (you can turn this off).

  If the date sold out before the page opened, it still does steps 2–4 and tells you which
  dates are open now, so you only need to pick another date.
- **You finish:** pick the slot, check everything, and press **Add to Wishlist** yourself.

## Install

The extension isn't on the Chrome Web Store. Load it from this repository:

1. Download or clone this repository.
2. Open `chrome://extensions` and switch on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `extension` folder.
4. Pin the extension so its icon is visible.

To update, pull the latest code and click the reload icon on the extension's card.

## Set up

Click the extension icon.

**Watching**
- **Dates to watch:** for example `2026-12-24, 2027-01-10..2027-01-14`. Leave empty to watch
  every date.
- **Tickets needed:** the number of people in your group (1–10).
- **Check every:** 3 minutes is a sensible default; 2 is the minimum, to keep load on the
  portal low.
- **Phone alerts (optional):** install the ntfy app, subscribe to a hard-to-guess topic name,
  and enter the same name here.
- Click **Save**, then **Send test alert** to check that notifications arrive.

**Pilgrims & nominees** (optional, but saves the most time)
- Add one line per pilgrim in the booking (at most 5):
  - their name **exactly as shown in the portal's Pilgrim List** (capitals, dots and extra
    spaces don't matter),
  - their nominee's name (letters and spaces, up to 32 characters),
  - the nominee's age (1–120),
  - the relationship (Father, Mother, Son, Daughter, Brother, Sister or Spouse).
- Click **Save nominees**.

Your pilgrims must already be saved in your account on the portal. The extension picks them
from your list; it doesn't create them.

## When an alert arrives

1. Make sure you're **logged in** to the portal in the same Chrome. If you're not, log in and
   the extension continues once you reach the booking page (within 15 minutes).
2. Click the notification, or one of its **Book …** buttons.
3. Watch the banner at the top of the page. Green means everything was filled in; red tells
   you what to do by hand, for example "booked out — pick another date".
4. Pick a slot, check everything, and press **Add to Wishlist**.

Ticket counts change within a minute, so an opening can go before you get there.

## Privacy

- Your pilgrim names and nominee details stay in this browser (`chrome.storage.local`). They
  are never sent anywhere.
- Phone alerts send only dates, routes, slot times and ticket counts to ntfy.sh, under the
  topic name you chose. Anyone who knows the topic can read them, so pick one that's hard to
  guess.
- The extension never stores your portal password, OTP or payment details.

## Responsible use

- Keep the check interval at 2 minutes or more. The extension enforces this minimum.
- Use it for your own group's booking. TDB states it has not authorised any agents or
  middlemen to book on behalf of pilgrims.
- The portal blocks scripted access from outside a browser. This extension works inside your
  own Chrome as a normal visitor would; please don't try to get around those protections.

## How it works

Every check makes the same requests the portal's public Virtual-Q page makes for a
logged-out visitor:

1. `POST /api/eDarshan/darshansummary/100001`: dates that are open (`availableDatesList`),
   fully booked (`bookedDates`) or not yet released (`blockedDates`).
2. For each watched date that's open (at most 5 per check), and each route from
   `GET /api/tofcommon/getReportingMaster` (cached for 6 hours):
   `POST /api/eDarshan/darshanRoutewiseAvailability/{y-m-d}/100001/{routeId}`, which returns
   the hour slots with `noOfTicketsAvailable`.

| routeId | Route |
|---|---|
| 1 | Pamba - Marakkoottam - 4 Kms |
| 2 | Erumely - Kalaketti Traditional Path - 46 Kms |
| 3 | Vandiperiyar - Sathram - Pulmedu - 16 Kms |

An **opening** is a date + route where at least one slot has your "Tickets needed" or more.
You're alerted when an opening appears that wasn't there at the previous check. One that
drops below your count and later comes back alerts again.

On the booking page, `content.js` works through the portal's own controls the way you would:
the date picker, the route dropdown, the Select Pilgrim list, the nominee table and the
contribution options. A few portal quirks it handles:
- The calendar only knows which dates are open a moment after the page loads.
- Pages change without a `hashchange` event, so the extension watches the address itself.
- The two buttons at the bottom of the Pilgrim List have no labels (grey = Reset, orange = add).

## Project layout

| Path | What it is |
|---|---|
| `extension/manifest.json` | Chrome extension manifest (MV3) |
| `extension/background.js` | Scheduled checks and notifications |
| `extension/logic.js` | Pure logic: feed parsing, ticket rule, change detection, alert text |
| `extension/nominee.js` | Nominee rules and pilgrim-name matching |
| `extension/content.js` | Runs on the portal: date, route, pilgrims, nominees, contributions |
| `extension/popup.html`, `popup.js` | Settings and status popup |
| `test/` | Unit tests (Node's built-in test runner) |

## Develop

Requires Node.js 22 or later (the test script uses `node --test` with a file glob). There are
no dependencies to install.

```sh
npm test
```

The tests use response shapes captured from the live portal. If the portal changes its
responses, the parsers fail with a clear message rather than alerting wrongly.

## License

[MIT](LICENSE)
