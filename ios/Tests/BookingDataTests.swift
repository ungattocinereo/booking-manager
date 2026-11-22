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
