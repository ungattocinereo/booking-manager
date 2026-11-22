# iPhone calendar and arrival list

Atrani 1.3 refines the calendar introduced in 1.2, which replaces the month-picker/detail-card calendar with a horizontally
scrolling occupancy timeline. The property icon column stays fixed. Swiping toward future dates smoothly hides
room names; swiping back restores them. Reduce Motion disables the transition. Every inventory
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
on each date. A solid violet title panel precedes compact cards with a smaller
date heading, regular dark-gray property name, source badge, guest name, nights,
guest count (or an explicit unknown state), and the stay dates at the bottom.
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

Calendar data refreshes once on launch, on return from the background, or on
pull-to-refresh. Brief inactive transitions (Control Center or system prompts)
do not fetch again. Scrolling does not fetch data. The grid prepares booking
lanes, per-day slices and date labels once per dashboard update, then lazily
renders visible day columns. Scroll state is isolated from the parent screen;
only a change of month updates the month label. The pan observer uses the existing
scroll view recognizer so vertical scrolling and refresh remain native.

Validation covers prepared-column continuity, direction reversal/jitter, Rome DST, leap years, range boundaries, clipped stays,
same-day turnovers, overlapping stays and untruncated arrival groups.
