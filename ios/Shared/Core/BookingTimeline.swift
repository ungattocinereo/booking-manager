import Foundation

public struct ArrivalDay: Identifiable, Sendable {
    public let id: String
    public let bookings: [Booking]
}

extension Dashboard {
    public func previousArrivals(on day: String = RomeDate.key()) -> [Booking] {
        Array(bookings.filter { $0.startDate < day }
            .sorted { ($0.startDate, $0.id) > ($1.startDate, $1.id) }.prefix(7))
    }
    public func previousArrivalDays(on day: String = RomeDate.key()) -> [ArrivalDay] {
        let grouped = Dictionary(grouping: previousArrivals(on: day), by: \.startDate)
        return grouped.keys.sorted(by: >).map { ArrivalDay(id: $0, bookings: grouped[$0]!) }
    }

    public func arrivalDays(on day: String = RomeDate.key()) -> [ArrivalDay] {
        let ordered = upcoming(on: day)
        let grouped = Dictionary(grouping: ordered, by: \.startDate)
        return grouped.keys.sorted().map { ArrivalDay(id: $0, bookings: grouped[$0]!) }
    }
}

public struct TimelineSegment: Identifiable, Sendable {
    public var id: String { booking.id }
    public let booking: Booking
    public let start: Double
    public let end: Double
    public let lane: Int
    public let clippedStart: Bool
    public let clippedEnd: Bool
}

/// Calendar-day positions, independent of DST and seconds in a day.
/// Retains the API's 90-day history for existing widget/calendar deep links.
public struct BookingTimeline: Sendable {
    public let today: String
    public let days: [String]
    public let months: [String]
    public let weekdays: [String: String]
    public var firstDay: String { days[0] }
    public var lastDay: String { days[days.count - 1] }

    public init(today: String) {
        self.today = today
        let calendar = RomeDate.calendar
        let date = RomeDate.date(today) ?? Date()
        let first = calendar.date(byAdding: .day, value: -90, to: date)!
        let end = calendar.date(byAdding: .year, value: 1, to: date)!
        let count = calendar.dateComponents([.day], from: first, to: end).day!
        let dates = (0..<count).map { calendar.date(byAdding: .day, value: $0, to: first)! }
        let keys = dates.map(RomeDate.key)
        days = keys
        months = keys.enumerated().compactMap { index, key in
            index == 0 || key.prefix(7) != keys[index - 1].prefix(7) ? key : nil
        }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ru_RU")
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "EE"
        weekdays = Dictionary(uniqueKeysWithValues: zip(keys, dates.map { formatter.string(from: $0) }))
    }

    public func clamped(_ day: String) -> String { max(firstDay, min(lastDay, day)) }

    public func segments(for propertyId: String, bookings: [Booking]) -> [TimelineSegment] {
        let visible = bookings.filter {
            $0.propertyId == propertyId && $0.endDate > $0.startDate &&
            $0.endDate >= firstDay && $0.startDate <= lastDay
        }.sorted { ($0.startDate, $0.endDate, $0.id) < ($1.startDate, $1.endDate, $1.id) }
        var laneEnds: [String] = []
        return visible.map { booking in
            let lane = laneEnds.firstIndex(where: { $0 <= booking.startDate }) ?? laneEnds.count
            if lane == laneEnds.count { laneEnds.append(booking.endDate) }
            else { laneEnds[lane] = booking.endDate }
            let start = Double(RomeDate.days(firstDay, booking.startDate)) + 0.5
            let end = Double(RomeDate.days(firstDay, booking.endDate)) + 0.5
            return TimelineSegment(booking: booking, start: max(0, start), end: min(Double(days.count), end),
                                   lane: lane, clippedStart: start < 0, clippedEnd: end > Double(days.count))
        }
    }
}

/// The pull distance is measured from the top edge, so normal scrolling cannot switch views.
public enum ArrivalPullAction: Equatable {
    case none, history, refresh
    public static func forDistance(_ distance: Double) -> Self {
        distance >= 120 ? .refresh : distance >= 48 ? .history : .none
    }
}
