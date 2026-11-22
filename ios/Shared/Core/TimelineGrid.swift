import Foundation

/// Prepared once per dashboard refresh. Scrolling only reads visible day columns.
public struct TimelineGrid: Sendable {
    public struct Day: Identifiable, Sendable {
        public let id: String
        public let number: String
        public let weekday: String
        public let label: String
    }
    public struct Slice: Identifiable, Sendable {
        public var id: String { booking.id }
        public let booking: Booking
        public let lane: Int
        public let start: Double
        public let end: Double
        public let startsHere: Bool
        public let endsHere: Bool
        public let showsSource: Bool
        public let label: String
    }
    public struct Row: Identifiable, Sendable {
        public var id: String { property.id }
        public let property: Property
        public let lanes: Int
        public let cells: [[Slice]]
    }
    public let days: [Day]
    public let rows: [Row]

    public init(timeline: BookingTimeline, properties: [Property], bookings: [Booking]) {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ru_RU")
        formatter.timeZone = RomeDate.calendar.timeZone
        formatter.setLocalizedDateFormatFromTemplate("d MMMM yyyy")
        func label(_ key: String) -> String { RomeDate.date(key).map { formatter.string(from: $0) } ?? key }
        days = timeline.days.map { Day(id: $0, number: String(Int($0.suffix(2)) ?? 0), weekday: timeline.weekdays[$0] ?? "", label: label($0)) }
        let grouped = Dictionary(grouping: bookings, by: \.propertyId)
        rows = properties.map { property in
            let segments = timeline.segments(for: property.id, bookings: grouped[property.id] ?? [])
            var cells = Array(repeating: [Slice](), count: timeline.days.count)
            for segment in segments {
                let first = max(0, Int(floor(segment.start)))
                let last = min(cells.count - 1, Int(ceil(segment.end)) - 1)
                guard first <= last else { continue }
                let sourceDay = Int(floor((segment.start + segment.end) / 2))
                let description = "\(property.name), \(segment.booking.platformLabel), заезд \(label(segment.booking.startDate)), выезд \(label(segment.booking.endDate))"
                for day in first...last {
                    cells[day].append(Slice(booking: segment.booking, lane: segment.lane,
                        start: max(0, segment.start - Double(day)), end: min(1, segment.end - Double(day)),
                        startsHere: day == first && !segment.clippedStart,
                        endsHere: day == last && !segment.clippedEnd,
                        showsSource: day == sourceDay, label: description))
                }
            }
            return Row(property: property, lanes: (segments.map(\.lane).max() ?? 0) + 1, cells: cells)
        }
    }
}

/// Direction changes use a small hysteresis so finger jitter does not toggle the rail.
public struct CalendarRailGesture {
    private var reference = 0.0
    public init() {}
    public mutating func update(x: Double, y: Double) -> Bool? {
        guard abs(x) > abs(y) * 1.2, abs(x - reference) >= 18 else { return nil }
        let collapsed = x < reference
        reference = x
        return collapsed
    }
    public mutating func end() { reference = 0 }
}
