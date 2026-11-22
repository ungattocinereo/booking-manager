#if DEBUG && targetEnvironment(simulator)
import SwiftUI

/// Deterministic visual harness. Uses invented data and never writes the production cache.
struct ArrivalWidgetPreview: View {
    @State private var count = 1
    init() {
        let args = ProcessInfo.processInfo.arguments
        if let index = args.firstIndex(of: "--widget-count"), index + 1 < args.count {
            _count = State(initialValue: min(25, max(0, Int(args[index + 1]) ?? 1)))
        }
        if let index = args.firstIndex(of: "--widget-offset"), index + 1 < args.count {
            _tomorrow = State(initialValue: args[index + 1] == "1")
        }
    }
    @State private var tomorrow = false
    var body: some View {
        VStack(spacing: 24) {
            Text("Предпросмотр виджета · пример").font(.headline)
            BookingWidgetView(entry: sample)
                .padding(16).frame(width: 338, height: 354)
                .background(Color(uiColor: .systemBackground), in: RoundedRectangle(cornerRadius: 24))
            Picker("Заезды", selection: $count) {
                Text("1").tag(1); Text("2").tag(2); Text("5").tag(5); Text("6").tag(6); Text("12").tag(12); Text("13").tag(13)
            }.pickerStyle(.segmented)
            Toggle("Завтра", isOn: $tomorrow)
        }.padding(24).frame(maxWidth: .infinity, maxHeight: .infinity).background(Color(uiColor: .systemGroupedBackground))
    }
    private var sample: BookingEntry {
        var data = Dashboard.demo()
        let inventory = [
            ("vingtage", "Vingtage Room"), ("orange", "Orange Room"), ("central", "Central Room"),
            ("awesome", "Awesome Apartments"), ("carina", "Carina"), ("youth", "Youth Room"),
            ("solo", "Solo Room"), ("royal", "Royal"), ("harmony", "Harmony"),
            ("susy", "Villa Susy"), ("carmela", "Carmela")
        ]
        data.properties = inventory.map { Property(id: $0.0, name: $0.1) }
        let args = ProcessInfo.processInfo.arguments
        func argument(_ name: String, default value: Int) -> Int {
            guard let index = args.firstIndex(of: name), index + 1 < args.count else { return value }
            return Int(args[index + 1]) ?? value
        }
        let offset = tomorrow ? 1 : 0
        let arrivalOffset = argument("--widget-arrival-offset", default: offset)
        let arrivalDate = RomeDate.calendar.date(byAdding: .day, value: arrivalOffset, to: Date())!
        let day = RomeDate.key(arrivalDate)
        let guests = ["Marco Rossi", "Anna Müller", "Sofia Bianchi", "James Wilson", "Elena Petrova"]
        data.bookings = (0..<count).map { index in
            Booking(id: "preview-\(index)", propertyId: inventory[index % inventory.count].0,
                    startDate: day, endDate: RomeDate.key(RomeDate.calendar.date(byAdding: .day, value: [3, 2, 5, 4][index % 4], to: arrivalDate)!),
                    guestName: guests[index % guests.count], guestCount: 2, platform: "booking", operationalFallback: false)
        }
        return BookingEntry(date: Date(), dashboard: data, propertyId: nil, preview: true,
                            dayOffset: offset, page: argument("--widget-page", default: 0))
    }
}
#endif
