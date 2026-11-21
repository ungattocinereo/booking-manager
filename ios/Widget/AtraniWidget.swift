import AppIntents
import SwiftUI
import WidgetKit

enum PropertyChoice: String, AppEnum {
    case all, awesome, central, orange, vingtage, youth, solo, carina, royal, harmony, susy, carmela
    static var typeDisplayRepresentation: TypeDisplayRepresentation { "Объект" }
    static var caseDisplayRepresentations: [Self: DisplayRepresentation] {
        [.all: "Все объекты", .awesome: "Awesome Apartments", .central: "Central Room", .orange: "Orange Room",
         .vingtage: "Vingtage Room", .youth: "Youth Room", .solo: "Solo Room", .carina: "Carina", .royal: "Royal",
         .harmony: "Harmony", .susy: "Villa Susy", .carmela: "Carmela"]
    }
}

struct BookingWidgetIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource { "Ближайшие заезды" }
    static var description: IntentDescription { "Все апартаменты или выбранный объект." }
    @Parameter(title: "Объект", default: .all) var property: PropertyChoice
}


struct BookingProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> BookingEntry {
        BookingEntry(date: Date(), dashboard: .demo(), propertyId: nil, preview: true)
    }
    func snapshot(for configuration: BookingWidgetIntent, in context: Context) async -> BookingEntry {
        if context.isPreview { return placeholder(in: context) }
        return await entry(configuration)
    }
    func timeline(for configuration: BookingWidgetIntent, in context: Context) async -> Timeline<BookingEntry> {
        var current = await entry(configuration)
        let defaults = UserDefaults(suiteName: SharedStore.group)
        current.dayOffset = defaults?.integer(forKey: "arrival-day-" + (current.propertyId ?? "all")) ?? 0
        current.page = defaults?.integer(forKey: "arrival-page-" + (current.propertyId ?? "all")) ?? 0
        let start = RomeDate.calendar.startOfDay(for: current.date)
        var entries = [current]
        // Midnight transitions work from the saved schedule even without another network request.
        for offset in 1...7 {
            var future = current
            future.date = RomeDate.calendar.date(byAdding: .day, value: offset, to: start)!
            entries.append(future)
        }
        return Timeline(entries: entries, policy: .after(current.date.addingTimeInterval(30 * 60)))
    }
    private func entry(_ configuration: BookingWidgetIntent) async -> BookingEntry {
        let propertyId = configuration.property == .all ? nil : configuration.property.rawValue
        guard let connection = SharedStore.connection() else { return BookingEntry(date: Date(), dashboard: nil, propertyId: propertyId) }
        let interaction = UserDefaults(suiteName: SharedStore.group)?.double(forKey: "arrival-interaction-at") ?? 0
        if Date().timeIntervalSince1970 - interaction < 10, let cached = SharedStore.cached() {
            return BookingEntry(date: Date(), dashboard: cached, propertyId: propertyId)
        }
        do {
            let (dashboard, data) = try await APITransport.shared.load(connection)
            // A sign-out while the request was running must not restore private cached data.
            guard SharedStore.connection() == connection else { return BookingEntry(date: Date(), dashboard: nil, propertyId: propertyId) }
            try SharedStore.cache(data)
            return BookingEntry(date: Date(), dashboard: dashboard, propertyId: propertyId)
        } catch {
            guard SharedStore.connection() == connection else { return BookingEntry(date: Date(), dashboard: nil, propertyId: propertyId) }
            return BookingEntry(date: Date(), dashboard: SharedStore.cached(), propertyId: propertyId, offline: true)
        }
    }
}


@main
struct AtraniWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: SharedStore.widgetKind, intent: BookingWidgetIntent.self, provider: BookingProvider()) { BookingWidgetView(entry: $0) }
            .configurationDisplayName("Ближайшие заезды")
            .description("Следующее бронирование, гости и ближайшие заезды в Atrani.")
            .supportedFamilies([.systemLarge])
    }
}
