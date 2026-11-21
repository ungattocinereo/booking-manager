#if DEBUG && targetEnvironment(simulator)
import SwiftUI

/// Deterministic visual harness. Uses invented data and never writes the production cache.
struct ArrivalWidgetPreview: View {
    @State private var count = 1
    init() {
        let args = ProcessInfo.processInfo.arguments
        if let index = args.firstIndex(of: "--widget-count"), index + 1 < args.count {
            _count = State(initialValue: min(11, max(1, Int(args[index + 1]) ?? 1)))
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
                Text("1").tag(1); Text("3").tag(3); Text("6").tag(6); Text("11").tag(11)
            }.pickerStyle(.segmented)
            Toggle("Завтра", isOn: $tomorrow)
        }.padding(24).frame(maxWidth: .infinity, maxHeight: .infinity).background(Color(uiColor: .systemGroupedBackground))
    }
    private var sample: BookingEntry {
        var data = Dashboard.demo()
        let names = ["Awesome Apartments", "Central Room", "Orange Room", "Vingtage Room", "Youth Room", "Solo Room", "Carina", "Royal", "Harmony", "Villa Susy", "Carmela"]
        data.properties = names.enumerated().map { Property(id: "preview-\($0.offset)", name: $0.element) }
        let day = RomeDate.key(RomeDate.calendar.date(byAdding: .day, value: tomorrow ? 1 : 0, to: Date())!)
        data.bookings = (0..<count).map { Booking(id: "preview-\($0)", propertyId: "preview-\($0)", startDate: day, endDate: RomeDate.key(RomeDate.calendar.date(byAdding: .day, value: 4, to: Date())!), guestName: ["Мария Иванова", "Alessandro Rossi", "Екатерина Петрова"][$0 % 3], guestCount: 2, platform: "booking", operationalFallback: false) }
        return BookingEntry(date: Date(), dashboard: data, propertyId: nil, preview: true, dayOffset: tomorrow ? 1 : 0)
    }
}
#endif
