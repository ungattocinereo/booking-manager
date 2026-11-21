import SwiftUI
import WidgetKit

struct BookingEntry: TimelineEntry {
    var date: Date
    var dashboard: Dashboard?
    var propertyId: String?
    var offline = false
    var preview = false
    var dayOffset = 0
    var page = 0
}

struct BookingWidgetView: View {
    let entry: BookingEntry
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.widgetRenderingMode) private var renderingMode
    private var accent: Color { colorScheme == .dark ? Color(red: 0.75, green: 0.62, blue: 1) : Color(red: 0.38, green: 0.18, blue: 0.75) }
    private var day: String { RomeDate.key(RomeDate.calendar.date(byAdding: .day, value: entry.dayOffset, to: entry.date)!) }
    private var scope: String { entry.propertyId ?? "all" }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label("Atrani", systemImage: "key.horizontal").font(.subheadline.weight(.semibold))
                Spacer()
                Text(RomeDate.label(day)).font(.caption).foregroundStyle(.secondary)
            }
            if let data = entry.dashboard {
                HStack(spacing: 8) {
                    dayButton("Сегодня", offset: 0, data: data)
                    dayButton("Завтра", offset: 1, data: data)
                }
                let board = ArrivalBoard(dashboard: data, day: day, propertyId: entry.propertyId)
                if board.isNext {
                    HStack {
                        Text(entry.dayOffset == 0 ? "Сегодня заездов нет" : "Завтра заездов нет")
                        Spacer(minLength: 4)
                        Text("Через \(RomeDate.days(RomeDate.key(entry.date), board.displayDay)) дн.")
                    }.font(.caption2).foregroundStyle(.secondary)
                }
                if board.bookings.isEmpty {
                    Spacer(minLength: 0)
                    Label("Ближайших заездов нет", systemImage: "calendar.badge.checkmark").font(.headline)
                    Text(entry.propertyId.map { data.propertyName($0) } ?? "Во всех апартаментах").font(.caption).foregroundStyle(.secondary)
                    Spacer(minLength: 0)
                } else {
                    GeometryReader { geometry in
                        let items = board.page(entry.page)
                        let columns = board.columns
                        let rows = (items.count + columns - 1) / columns
                        let gap: CGFloat = items.count > 6 ? 4 : 8
                        let rowHeight = max(1, (geometry.size.height - CGFloat(rows - 1) * gap) / CGFloat(rows))
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: columns), spacing: gap) {
                            ForEach(items) { booking in
                                arrival(booking, data: data, count: items.count, height: rowHeight)
                            }
                        }
                    }
                }
                if board.pageCount > 1 {
                    HStack {
                        Text("Заезды: \(board.bookings.count)").font(.caption2)
                        Spacer()
                        Button(intent: SelectArrivalDayIntent(offset: entry.dayOffset, property: scope, page: (entry.page + 1) % board.pageCount)) {
                            Label("\(min(entry.page + 1, board.pageCount))/\(board.pageCount)", systemImage: "chevron.right")
                        }.font(.caption).buttonStyle(.plain)
                    }
                }
                Divider()
                HStack {
                    Label("Выезды: \(data.departures(on: day).filter { entry.propertyId == nil || $0.propertyId == entry.propertyId }.count)", systemImage: "arrow.up.right")
                    Spacer()
                    if entry.preview { Text("Пример") }
                    else if entry.offline { Label("Нет связи", systemImage: "wifi.slash") }
                    else if data.syncHealth?.stale == true || data.syncHealth?.status == "error" { Label("Проверить данные", systemImage: "exclamationmark.triangle") }
                    else { Text(received(data.generatedAt)) }
                }.font(.caption2).foregroundStyle(.secondary)
            } else {
                Spacer()
                Label("Подключите Booking Manager", systemImage: "house.and.flag").font(.headline)
                Text("Откройте Atrani и добавьте подключение в настройках").font(.subheadline).foregroundStyle(.secondary)
                Spacer()
            }
        }
        .containerBackground(for: .widget) { colorScheme == .dark ? Color(red: 0.035, green: 0.03, blue: 0.045) : Color(uiColor: .systemBackground) }
        .widgetURL(URL(string: "atrani://calendar?date=\(day)"))
        .privacySensitive()
    }

    private func dayButton(_ title: String, offset: Int, data: Dashboard) -> some View {
        let key = RomeDate.key(RomeDate.calendar.date(byAdding: .day, value: offset, to: entry.date)!)
        let count = data.arrivals(on: key).filter { entry.propertyId == nil || $0.propertyId == entry.propertyId }.count
        return Button(intent: SelectArrivalDayIntent(offset: offset, property: scope)) {
            HStack(spacing: 4) { Text(title); Text("\(count)").monospacedDigit() }
                .font(.caption.weight(.medium)).frame(maxWidth: .infinity).padding(.vertical, 8)
                .background(entry.dayOffset == offset ? accent.opacity(0.16) : Color.secondary.opacity(0.06), in: RoundedRectangle(cornerRadius: 8))
                .foregroundStyle(entry.dayOffset == offset ? accent : .secondary)
        }.buttonStyle(.plain).accessibilityLabel("\(title), заездов: \(count)")
            .accessibilityAddTraits(entry.dayOffset == offset ? .isSelected : [])
    }

    private func arrival(_ booking: Booking, data: Dashboard, count: Int, height: CGFloat) -> some View {
        let dense = count > 6
        let titleSize: CGFloat = count == 1 ? 28 : count <= 3 ? 20 : dense ? 12 : 15
        return Link(destination: booking.deepLink) {
            VStack(alignment: .leading, spacing: dense ? 2 : 4) {
                HStack(spacing: 4) {
                    if !dense { Image(systemName: "door.left.hand.open").font(.caption).foregroundStyle(accent) }
                    Text(data.propertyName(booking.propertyId)).font(.system(size: titleSize, weight: .semibold)).lineLimit(1).minimumScaleFactor(dense ? 1 : 0.8)
                }
                Text(booking.guestLabel).font(dense ? .system(size: 11) : .subheadline).foregroundStyle(.secondary).lineLimit(count == 1 ? 2 : 1)
                if count <= 3 {
                    HStack(spacing: 8) {
                        Label("\(booking.nights) ноч.", systemImage: "moon")
                        if let guests = booking.guestCount { Label("\(guests)", systemImage: "person.2") }
                    }.font(.caption).foregroundStyle(.secondary)
                    Text("\(RomeDate.label(booking.startDate)) – \(RomeDate.label(booking.endDate))").font(.caption).foregroundStyle(accent)
                }
            }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                .padding(.horizontal, dense ? 4 : 12)
                .frame(height: height)
                .background(renderingMode == .fullColor ? accent.opacity(colorScheme == .dark ? 0.10 : 0.05) : Color.clear, in: RoundedRectangle(cornerRadius: 12))
        }.buttonStyle(.plain)
            .accessibilityLabel("\(data.propertyName(booking.propertyId)), \(booking.guestLabel), заезд \(RomeDate.label(booking.startDate)), \(booking.nights) ночей")
    }

    private func received(_ value: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value) else { return "" }
        if entry.date.timeIntervalSince(date) > 3600 { return "Данные \(RomeDate.label(RomeDate.key(date)))" }
        let time = DateFormatter(); time.timeZone = RomeDate.calendar.timeZone; time.dateFormat = "HH:mm"
        return "Получено \(time.string(from: date))"
    }
}

