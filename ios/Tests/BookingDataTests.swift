import Foundation
import Testing
@testable import AtraniCore

private let fixture = Data("""
{"schema_version":1,"date":"2026-10-23","generated_at":"2026-10-23T12:00:00Z","properties":[{"id":"orange","name":"Orange Room"}],"bookings":[
{"id":"old","property_id":"orange","start_date":"2026-10-20","end_date":"2026-10-23","platform":"airbnb","operational_fallback":false},
{"id":"next","property_id":"orange","start_date":"2026-10-26","end_date":"2026-10-29","guest_name":null,"platform":"booking","operational_fallback":false},
{"id":"today","property_id":"orange","start_date":"2026-10-23","end_date":"2026-10-25","platform":"booking","operational_fallback":true}],"cleaning_tasks":[]}
""".utf8)

@Test func nextBookingIsNotLimitedToTodayAndKeepsUnnamedGuests() throws {
    let dashboard = try Dashboard.decode(fixture)
    #expect(dashboard.upcoming(on: "2026-10-23").map(\.id) == ["today", "next"])
    #expect(dashboard.upcoming(on: "2026-10-24").first?.id == "next")
    #expect(dashboard.upcoming(on: "2026-10-24", propertyId: "royal").isEmpty == true)
    #expect(dashboard.bookings[1].guestLabel == "Имя гостя не указано")
    #expect(dashboard.bookings[1].nights == 3)
    #expect(dashboard.occupied(on: "2026-10-23").map(\.id) == ["today"])
}

@Test func romeDatesHandleMidnightAndDaylightSaving() throws {
    let formatter = ISO8601DateFormatter()
    #expect(RomeDate.key(try #require(formatter.date(from: "2026-10-23T22:30:00Z"))) == "2026-10-24")
    #expect(RomeDate.days("2026-10-24", "2026-10-26") == 2)
    #expect(RomeDate.days("2026-03-28", "2026-03-30") == 2)
}

@Test func connectionKeepsCredentialsOutOfTheURL() throws {
    let request = try Connection(server: "https://example.com/", accessKey: "secret", protectionKey: "bypass").request()
    #expect(request.url?.absoluteString == "https://example.com/api/bookings?widget=upcoming")
    #expect(request.value(forHTTPHeaderField: "x-widget-token") == "secret")
    #expect(request.value(forHTTPHeaderField: "x-vercel-protection-bypass") == "bypass")
    for server in ["http://example.com", "https://user:pass@example.com", "https://example.com?token=secret", "https://example.com/path"] {
        #expect(throws: ConnectionError.self) { try Connection(server: server, accessKey: "secret").request() }
    }
}

@Test func arrivalBoardGroupsOneDayWithoutDroppingBusyDays() throws {
    var dashboard = try Dashboard.decode(fixture)
    let today = ArrivalBoard(dashboard: dashboard, day: "2026-10-23")
    #expect(today.bookings.map(\.id) == ["today"])
    #expect(!today.isNext)
    let tomorrow = ArrivalBoard(dashboard: dashboard, day: "2026-10-24")
    #expect(tomorrow.bookings.map(\.id) == ["next"])
    #expect(tomorrow.daysUntil == 2)
    #expect(tomorrow.isNext)
    dashboard.bookings = (0..<25).map { index in
        var booking = dashboard.bookings[2]
        booking.id = "arrival-\(index)"
        return booking
    }
    let busy = ArrivalBoard(dashboard: dashboard, day: "2026-10-23")
    #expect(busy.columns == 2)
    #expect(busy.bookings.count == 25)
    #expect(busy.pageCount == 3)
    #expect((busy.page(0) + busy.page(1) + busy.page(2)).count == 25)
    #expect(busy.page(99).count == 1)
    #expect(ArrivalBoard(dashboard: dashboard, day: "2026-10-23", propertyId: "royal").bookings.isEmpty)
}

@Test func arrivalListGroupsEveryFutureDayWithoutTruncation() throws {
    var dashboard = try Dashboard.decode(fixture)
    var other = dashboard.bookings[1]
    other.id = "same-day-other-property"
    other.propertyId = "royal"
    dashboard.bookings.append(other)
    let days = dashboard.arrivalDays(on: "2026-10-24")
    #expect(days.map(\.id) == ["2026-10-26"])
    #expect(days[0].bookings.count == 2)
    #expect(dashboard.arrivalDays(on: "2026-10-30").isEmpty)
}

@Test func timelineCoversLeapYearAndRomeDSTWithWholeDayColumns() {
    let leap = BookingTimeline(today: "2027-11-22")
    #expect(leap.firstDay == "2027-08-24")
    #expect(leap.lastDay == "2028-11-21")
    #expect(leap.days.count == 456)
    #expect(leap.days.contains("2028-02-29"))
    let timeline = BookingTimeline(today: "2026-11-22")
    #expect(timeline.days.count == 455)
    #expect(timeline.lastDay == "2027-11-21")
    #expect(timeline.months.contains("2027-03-01"))
    let spring = timeline.days.firstIndex(of: "2027-03-28")!
    #expect(timeline.days[spring + 1] == "2027-03-29")
    #expect(timeline.clamped("2099-01-01") == timeline.lastDay)
    #expect(timeline.clamped("2000-01-01") == timeline.firstDay)
}

@Test func timelineSeparatesOverlapsAndPreservesSameDayTurnoversAndClippedStays() throws {
    let data = try Dashboard.decode(fixture)
    let timeline = BookingTimeline(today: "2026-10-23")
    func stay(_ id: String, _ start: String, _ end: String) -> Booking {
        var value = data.bookings[0]
        value.id = id; value.startDate = start; value.endDate = end
        return value
    }
    let input = [stay("a", "2026-10-24", "2026-10-27"),
                 stay("b", "2026-10-26", "2026-10-29"),
                 stay("turnover", "2026-10-27", "2026-10-30"),
                 stay("early", "2026-01-01", timeline.firstDay),
                 stay("late", timeline.lastDay, "2028-01-01"),
                 stay("invalid", "2026-10-25", "2026-10-25")]
    let bars = timeline.segments(for: "orange", bookings: input)
    #expect(bars.count == 5)
    let a = try #require(bars.first { $0.id == "a" })
    let b = try #require(bars.first { $0.id == "b" })
    let turnover = try #require(bars.first { $0.id == "turnover" })
    #expect(a.end - a.start == 3)
    #expect(a.lane != b.lane)
    #expect(a.lane == turnover.lane)
    #expect(a.end == turnover.start)
    #expect(bars.first?.clippedStart == true)
    #expect(bars.first?.start == 0)
    #expect(bars.last?.clippedEnd == true)
    #expect(bars.last?.end == Double(timeline.days.count))
    #expect(timeline.segments(for: "royal", bookings: input).isEmpty)
}

@Test func preparedColumnsKeepTurnoversOverlapsAndClippedBookings() throws {
    var data = try Dashboard.decode(fixture)
    let timeline = BookingTimeline(today: "2026-10-23")
    func stay(_ id: String, _ start: String, _ end: String) -> Booking {
        var value = data.bookings[0]
        value.id = id; value.startDate = start; value.endDate = end
        return value
    }
    data.bookings = [stay("first", "2026-10-24", "2026-10-27"),
                     stay("next", "2026-10-27", "2026-10-28"),
                     stay("overlap", "2026-10-26", "2026-10-29"),
                     stay("early", "2020-01-01", timeline.firstDay),
                     stay("late", timeline.lastDay, "2029-01-01")]
    let grid = TimelineGrid(timeline: timeline, properties: data.properties, bookings: data.bookings)
    let row = try #require(grid.rows.first)
    #expect(row.cells.count == timeline.days.count)
    #expect(row.lanes == 2)
    let index = try #require(timeline.days.firstIndex(of: "2026-10-27"))
    let checkout = try #require(row.cells[index].first { $0.id == "first" })
    let checkin = try #require(row.cells[index].first { $0.id == "next" })
    let overlap = try #require(row.cells[index].first { $0.id == "overlap" })
    #expect(checkout.start == 0 && checkout.end == 0.5 && checkout.endsHere)
    #expect(checkin.start == 0.5 && checkin.end == 1 && checkin.startsHere)
    #expect(checkin.lane == checkout.lane && overlap.lane != checkout.lane)
    #expect(row.cells[0].first?.startsHere == false)
    #expect(row.cells.last?.first?.endsHere == false)
    for booking in data.bookings {
        #expect(row.cells.flatMap { $0 }.filter { $0.id == booking.id && $0.showsSource }.count == 1)
    }
    // Reassembling visible slices must preserve each original segment's duration.
    for segment in timeline.segments(for: "orange", bookings: data.bookings) {
        let duration = row.cells.flatMap { $0 }.filter { $0.id == segment.id }.reduce(0) { $0 + $1.end - $1.start }
        #expect(duration == segment.end - segment.start)
    }
}

@Test func railFollowsHorizontalDirectionAndIgnoresJitterAndVerticalDrags() {
    var gesture = CalendarRailGesture()
    #expect(gesture.update(x: -8, y: 0) == nil)
    #expect(gesture.update(x: -24, y: 80) == nil)
    #expect(gesture.update(x: -24, y: 2) == true)
    #expect(gesture.update(x: -29, y: 3) == nil)
    #expect(gesture.update(x: -48, y: 4) == true)
    #expect(gesture.update(x: -25, y: 4) == false)
    gesture.end()
    #expect(gesture.update(x: 24, y: 0) == false)
}

@Test func cityTaxUsesNightsAndPeopleWithoutInventingMissingCounts() throws {
    var booking = try Dashboard.decode(fixture).bookings[1]
    #expect(booking.taxPaid == nil) // old caches remain decodable, not falsely marked unpaid
    #expect(booking.cityTax == nil)
    booking.guestCount = 2
    #expect(booking.cityTax == 15)
    booking.startDate = "2026-03-28"; booking.endDate = "2026-03-30"
    #expect(booking.cityTax == 10)
    booking.guestCount = 0
    #expect(booking.cityTax == nil)
    booking.guestCount = 2; booking.operationalFallback = true
    #expect(booking.cityTax == nil)
    booking.operationalFallback = false; booking.taxApplicable = false
    #expect(booking.cityTax == nil)
    #expect(booking.nightsLabel == "2 ночи")
    #expect(booking.guestsLabel == "2 человека")
}

@Test func previousGuestsKeepSevenLatestArrivalsIncludingOngoingStays() throws {
    var data = try Dashboard.decode(fixture)
    let template = data.bookings[0]
    data.bookings += (1...10).map { index in
        var booking = template
        booking.id = "past-\(index)"
        booking.startDate = String(format: "2026-10-%02d", index)
        return booking
    }
    let guests = data.previousArrivals(on: "2026-10-23")
    #expect(guests.count == 7)
    #expect(guests.map(\.id) == ["old", "past-10", "past-9", "past-8", "past-7", "past-6", "past-5"])
    #expect(data.previousArrivalDays(on: "2026-10-23").map(\.id) == guests.map(\.startDate))
    #expect(data.previousArrivals(on: "2026-01-01").isEmpty)
}

@Test func shortPullSelectsHistoryAndDeepPullRefreshes() {
    #expect(ArrivalPullAction.forDistance(-50) == .none)
    #expect(ArrivalPullAction.forDistance(47) == .none)
    #expect(ArrivalPullAction.forDistance(48) == .history)
    #expect(ArrivalPullAction.forDistance(119) == .history)
    #expect(ArrivalPullAction.forDistance(120) == .refresh)
}

@Test func taxMutationIsScopedAndRetainsHeaderAuthentication() throws {
    let request = try Connection(server: "https://example.com", accessKey: "test", protectionKey: "bypass").taxRequest(bookingId: "42", paid: true, expected: false)
    #expect(request.httpMethod == "PATCH")
    #expect(request.url?.absoluteString == "https://example.com/api/bookings?widget=tax")
    #expect(request.value(forHTTPHeaderField: "x-widget-token") == "test")
    let raw = try #require(request.httpBody)
    let body = try #require(JSONSerialization.jsonObject(with: raw) as? [String: Any])
    #expect(body["booking_id"] as? String == "42")
    #expect(body["tax_paid"] as? Bool == true)
    #expect(body["expected_paid"] as? Bool == false)
}

@Test func cleanerLinksUseThePublicOriginWithoutCredentials() throws {
    let raw = Data("""
    {"public_base_url":"https://b.amalfi.day","properties":[],"cleaners":[{"id":"anna","name":"Anna","slug":"anna-42","properties":[]}]}
    """.utf8)
    let decoder = JSONDecoder()
    decoder.keyDecodingStrategy = .convertFromSnakeCase
    var directory = try decoder.decode(CleanerDirectory.self, from: raw)
    var cleaner = directory.cleaners[0]
    #expect(directory.link(for: cleaner)?.absoluteString == "https://b.amalfi.day/maid/anna-42")
    cleaner.slug = "../admin"
    #expect(directory.link(for: cleaner) == nil)
    cleaner.slug = "anna"
    directory.publicBaseUrl = "https://key@example.com?token=secret"
    #expect(directory.link(for: cleaner) == nil)
    let request = try Connection(server: "https://example.com", accessKey: "test").cleanersRequest(method: "PUT", payload: Data("{}".utf8))
    #expect(request.url?.absoluteString == "https://example.com/api/bookings?widget=cleaners")
    #expect(request.value(forHTTPHeaderField: "x-widget-token") == "test")
    #expect(request.httpMethod == "PUT")
}
