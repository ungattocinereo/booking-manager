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
                Booking(id: "demo-1", propertyId: "orange", startDate: day(1), endDate: day(4), guestName: "Гость 1", guestCount: 2, platform: "booking", reservationUrl: nil, operationalFallback: false),
                Booking(id: "demo-2", propertyId: "harmony", startDate: day(2), endDate: day(7), guestName: "Гость 2", guestCount: 3, platform: "airbnb", reservationUrl: nil, operationalFallback: false),
                Booking(id: "demo-3", propertyId: "royal", startDate: day(-2), endDate: day(0), guestName: "Гость 3", guestCount: 2, platform: "airbnb", reservationUrl: nil, operationalFallback: false)
            ], cleaningTasks: [CleaningTask(id: "demo-task", propertyId: "royal", scheduledDate: day(0), cleanerName: "Уборщица", status: "pending", taskType: "checkout_cleaning")])
    }
}
