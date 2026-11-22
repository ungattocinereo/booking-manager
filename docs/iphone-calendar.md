# iPhone calendar and arrival list

Atrani 1.2 replaces the month-picker/detail-card calendar with a horizontally
scrolling occupancy timeline. The property column stays fixed. Every inventory
property gets a row even without bookings; identities and colors match the web
calendar. Airbnb and Booking.com badges identify each booking. Tapping a bar
opens the existing booking details; tapping a property opens its schedule.

The calendar starts at today, supports a rolling calendar year ahead, and retains
90 days of history for existing links. The month menu follows scrolling and can
jump directly to any month. Today returns to the current Rome date. Half-day
endpoints distinguish checkout and arrival on the same date. Overlapping stays
use separate lanes instead of hiding one another. Existing data warnings and
pull-to-refresh remain available.

The Arrivals tab lists future arrival dates in order, with all apartments arriving
on each date. It omits daily zero counts, guest metadata and repeated empty cards.
Details are still available by tapping a booking. This app change does not alter
the Today/Tomorrow behavior of the Home Screen widget.

Approved typography:
- Screen headings and prominent dates: system rounded Bold/Heavy.
- Calendar property names: standard system Bold, primary black/white.
- Apartment names in arrival summaries: standard system Regular, dark gray in
  light appearance and readable light gray in dark appearance.
- Secondary labels, controls and weekdays: standard system text.

All assets are bundled locally; no fonts or icon network requests are needed.
Property icons come from Lucide 0.468.0 (license in `ios/ThirdParty/`); platform
badges are reused from the existing web app. No API, database or credential
changes are required. The native calendar uses the existing full-property mobile
payload; it does not depend on membership in Hostex.

Validation covers Rome DST, leap years, range boundaries, clipped stays,
same-day turnovers, overlapping stays and untruncated arrival groups.
