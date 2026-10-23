import Foundation

extension Dashboard {
    static func demo(now: Date = Date()) -> Dashboard {
        func day(_ offset: Int) -> String { RomeDate.key(RomeDate.calendar.date(byAdding: .day, value: offset, to: now)!) }
        return Dashboard(schemaVersion: 1, date: day(0), generatedAt: ISO8601DateFormatter().string(from: now), syncHealth: nil,
            properties: [Property(id: "orange", name: "Orange Room", color: "#F7A541"),
                         Property(id: "harmony", name: "Harmony", color: "#6D2CFC"),
                         Property(id: "royal", name: "Royal", color: "#2476EA")],
            bookings: [
                Booking(id: "demo-1", propertyId: "orange", startDate: day(1), endDate: day(4), guestName: "Гость 1", guestCount: 2, platform: "booking", reservationUrl: nil, operationalFallback: false),
                Booking(id: "demo-2", propertyId: "harmony", startDate: day(2), endDate: day(7), guestName: "Гость 2", guestCount: 3, platform: "airbnb", reservationUrl: nil, operationalFallback: false),
                Booking(id: "demo-3", propertyId: "royal", startDate: day(-2), endDate: day(0), guestName: "Гость 3", guestCount: 2, platform: "airbnb", reservationUrl: nil, operationalFallback: false)
            ], cleaningTasks: [CleaningTask(id: "demo-task", propertyId: "royal", scheduledDate: day(0), cleanerName: "Уборщица", status: "pending", taskType: "checkout_cleaning")])
    }
}
