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
