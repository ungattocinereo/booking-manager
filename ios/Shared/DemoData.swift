import Foundation

extension Dashboard {
    static func demo(now: Date = Date()) -> Dashboard {
        func day(_ offset: Int) -> String { RomeDate.key(RomeDate.calendar.date(byAdding: .day, value: offset, to: now)!) }
        return Dashboard(schemaVersion: 1, date: day(0), generatedAt: ISO8601DateFormatter().string(from: now), syncHealth: nil,
            properties: [Property(id: "awesome", name: "Awesome Apartments"), Property(id: "central", name: "Central Room"),
                         Property(id: "orange", name: "Orange Room"), Property(id: "vingtage", name: "Vingtage Room"),
                         Property(id: "youth", name: "Youth Room"), Property(id: "solo", name: "Solo Room"),
                         Property(id: "carina", name: "Carina"), Property(id: "royal", name: "Royal"),
                         Property(id: "harmony", name: "Harmony"), Property(id: "susy", name: "Villa Susy"), Property(id: "carmela", name: "Carmela")],
            bookings: [
                Booking(id: "demo-1", propertyId: "orange", startDate: day(1), endDate: day(4), guestName: "Sofia Moretti", guestCount: 2, platform: "booking", reservationUrl: nil, operationalFallback: false, taxPaid: false, taxApplicable: true),
                Booking(id: "demo-2", propertyId: "harmony", startDate: day(2), endDate: day(7), guestName: "Alexander Williams", guestCount: nil, platform: "airbnb", reservationUrl: nil, operationalFallback: false, taxPaid: false, taxApplicable: true),
                Booking(id: "demo-3", propertyId: "royal", startDate: day(-2), endDate: day(0), guestName: "Emma Laurent", guestCount: 2, platform: "airbnb", reservationUrl: nil, operationalFallback: false, taxPaid: false, taxApplicable: true)
            ] + (1...8).map { index in
                Booking(id: "demo-past-\(index)", propertyId: ["central", "carina", "vingtage", "solo"][index % 4],
                    startDate: day(-index * 6), endDate: day(-index * 6 + 4), guestName: ["Oliver Martin", "Giulia Rossi", "Anna Müller", "Daniel Chen"][index % 4],
                    guestCount: 2, platform: index.isMultiple(of: 2) ? "booking" : "airbnb", reservationUrl: nil,
                    operationalFallback: false, taxPaid: index.isMultiple(of: 2), taxApplicable: true)
            }, cleaningTasks: [CleaningTask(id: "demo-task", propertyId: "royal", scheduledDate: day(0), cleanerName: "Уборщица", status: "pending", taskType: "checkout_cleaning")])
    }
}

#if DEBUG && targetEnvironment(simulator)
extension Dashboard {
    /// Synthetic full-year occupancy for repeatable scrolling checks, never cached or uploaded.
    static func calendarStressDemo() -> Dashboard {
        var data = demo()
        let calendar = RomeDate.calendar
        let today = Date()
        let dates = (-90...365).map { RomeDate.key(calendar.date(byAdding: .day, value: $0, to: today)!) }
        data.bookings = data.properties.flatMap { property in
            stride(from: 0, to: dates.count - 4, by: 5).map { offset in
                Booking(id: "stress-\(property.id)-\(offset)", propertyId: property.id,
                    startDate: dates[offset], endDate: dates[offset + 3], guestName: "Тестовый гость",
                    guestCount: 2, platform: offset.isMultiple(of: 10) ? "airbnb" : "booking",
                    reservationUrl: nil, operationalFallback: false, taxPaid: false, taxApplicable: true)
            }
        }
        return data
    }
}
#endif
