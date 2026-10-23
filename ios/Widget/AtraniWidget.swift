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

struct BookingEntry: TimelineEntry {
    var date: Date
    var dashboard: Dashboard?
    var propertyId: String?
    var offline = false
    var preview = false
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
        let current = await entry(configuration)
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

struct BookingWidgetView: View {
    let entry: BookingEntry
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var violet: Color {
        isDark ? Color(red: 0.72, green: 0.52, blue: 1) : Color(red: 0.43, green: 0.17, blue: 0.99)
    }
    // Explicit dark surfaces avoid the elevated grey of systemBackground in widgets.
    private var background: Color {
        isDark ? Color(red: 0.035, green: 0.027, blue: 0.055) : Color(uiColor: .systemBackground)
    }
    private var cardBackground: Color {
        isDark ? Color(red: 0.12, green: 0.075, blue: 0.19) : violet.opacity(0.07)
    }
    private var primaryText: Color {
        isDark ? Color(red: 0.98, green: 0.97, blue: 1) : .primary
    }
    private var secondaryText: Color {
        isDark ? Color(red: 0.76, green: 0.73, blue: 0.82) : .secondary
    }
    private var day: String { RomeDate.key(entry.date) }
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("ATRANI").font(.caption.weight(.black)).tracking(2).foregroundStyle(violet)
                Spacer()
                Text(RomeDate.label(day)).font(.caption2).foregroundStyle(secondaryText)
            }
            if let dashboard = entry.dashboard {
                let bookings = dashboard.upcoming(on: day, propertyId: entry.propertyId)
                if let next = bookings.first {
                    Link(destination: next.deepLink) {
                        VStack(alignment: .leading, spacing: 7) {
                            Text("СЛЕДУЮЩИЙ ЗАЕЗД").font(.system(size: 9, weight: .bold)).tracking(1.2).foregroundStyle(secondaryText)
                            Text(dashboard.propertyName(next.propertyId)).font(.system(size: 26, weight: .bold, design: .rounded)).lineLimit(1).minimumScaleFactor(0.7)
                            Text(next.guestLabel).font(.subheadline).lineLimit(1).foregroundStyle(secondaryText)
                            HStack {
                                Text("\(RomeDate.label(next.startDate)) – \(RomeDate.label(next.endDate))").font(.subheadline.weight(.bold))
                                Spacer()
                                Text("\(next.nights) ноч.").font(.caption.weight(.semibold))
                            }.foregroundStyle(violet).padding(.top, 4)
                        }.padding(14)
                            .background(cardBackground, in: RoundedRectangle(cornerRadius: 18))
                            .overlay {
                                RoundedRectangle(cornerRadius: 18).strokeBorder(violet.opacity(isDark ? 0.24 : 0), lineWidth: 1)
                            }
                    }.buttonStyle(.plain)
                    ForEach(bookings.dropFirst().prefix(2)) { booking in
                        Link(destination: booking.deepLink) {
                            HStack(spacing: 9) {
                                Text(RomeDate.label(booking.startDate)).font(.caption.weight(.bold)).foregroundStyle(violet).frame(width: 58, alignment: .leading)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(dashboard.propertyName(booking.propertyId)).font(.caption.weight(.semibold)).lineLimit(1)
                                    Text(booking.guestLabel).font(.caption2).foregroundStyle(secondaryText).lineLimit(1)
                                }
                                Spacer(minLength: 0)
                            }
                        }.buttonStyle(.plain)
                    }
                } else {
                    Spacer()
                    Image(systemName: "calendar.badge.checkmark").font(.largeTitle).foregroundStyle(violet)
                    Text("Ближайших заездов нет").font(.headline)
                    Text(entry.propertyId.map { dashboard.propertyName($0) } ?? "Во всех объектах").font(.caption).foregroundStyle(secondaryText)
                }
                Spacer(minLength: 0)
                Divider()
                HStack {
                    let departures = dashboard.departures(on: day).filter { entry.propertyId == nil || $0.propertyId == entry.propertyId }
                    Label("Выезды: \(departures.count)", systemImage: "arrow.up.right").font(.caption2)
                    Spacer()
                    if entry.preview { Text("Пример").font(.caption2).foregroundStyle(secondaryText) }
                    else if entry.offline { Label("Нет связи", systemImage: "wifi.slash").font(.caption2).foregroundStyle(.orange) }
                    else if dashboard.syncHealth?.stale == true || dashboard.syncHealth?.status == "error" {
                        Label("Проверить синхр.", systemImage: "exclamationmark.triangle").font(.caption2).foregroundStyle(.orange)
                    } else { Text(received(dashboard.generatedAt)).font(.caption2).foregroundStyle(secondaryText) }
                }
            } else {
                Spacer()
                Image(systemName: "house.and.flag").font(.largeTitle).foregroundStyle(violet)
                Text("Подключите Booking Manager").font(.title3.bold())
                Text("Откройте Atrani и добавьте подключение в настройках.").font(.subheadline).foregroundStyle(secondaryText)
                Spacer()
            }
        }
        .foregroundStyle(primaryText)
        .containerBackground(for: .widget) { background }
        .widgetURL(URL(string: "atrani://today"))
        .privacySensitive()
    }

    private func received(_ value: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: value) else { return "" }
        if entry.date.timeIntervalSince(date) > 3600 { return "Данные \(RomeDate.label(RomeDate.key(date)))" }
        return "Получено \(date.formatted(date: .omitted, time: .shortened))"
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
