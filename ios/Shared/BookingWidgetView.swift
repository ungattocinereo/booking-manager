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
                HStack(spacing: 2) {
                    dayButton("Сегодня", offset: 0, data: data)
                    dayButton("Завтра", offset: 1, data: data)
                }
                .padding(3)
                .background(Color.secondary.opacity(0.10), in: RoundedRectangle(cornerRadius: 13))
                let board = ArrivalBoard(dashboard: data, day: day, propertyId: entry.propertyId)
                if board.isNext {
                    HStack {
                        Text(entry.dayOffset == 0 ? "Сегодня заездов нет" : "Завтра заездов нет")
                        Spacer(minLength: 4)
                        Text("Через \(RomeDate.days(RomeDate.key(entry.date), board.displayDay)) дн.")
                    }.font(.caption2).foregroundStyle(.secondary)
                }
                if !board.bookings.isEmpty {
                    HStack {
                        Text(board.isNext ? "БЛИЖАЙШИЕ ЗАЕЗДЫ" : "ЗАЕЗДЫ")
                        Spacer()
                        if board.isNext { Text(RomeDate.label(board.displayDay)) }
                    }.font(.system(size: 10, weight: .semibold)).foregroundStyle(.secondary)
                }
                if board.bookings.isEmpty {
                    Spacer(minLength: 0)
                    Label("Ближайших заездов нет", systemImage: "calendar.badge.checkmark").font(.headline)
                    Text(entry.propertyId.map { data.propertyName($0) } ?? "Во всех апартаментах").font(.caption).foregroundStyle(.secondary)
                    Spacer(minLength: 0)
                } else {
                    GeometryReader { geometry in
                        let items = board.page(entry.page)
                        let columns = items.count > 6 ? 2 : 1
                        let rows = (items.count + columns - 1) / columns
                        let gap: CGFloat = items.count > 6 ? 4 : 0
                        let rowHeight = max(1, (geometry.size.height - CGFloat(rows - 1) * gap) / CGFloat(rows))
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: columns), spacing: gap) {
                            ForEach(Array(items.enumerated()), id: \.element.id) { index, booking in
                                arrival(booking, data: data, count: items.count, height: rowHeight)
                                    .overlay(alignment: .bottom) {
                                        if columns == 1 && index < items.count - 1 {
                                            Divider().opacity(0.55)
                                        }
                                    }
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
                    if entry.preview { Text("Пример данных") }
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
                .font(.system(size: 13, weight: entry.dayOffset == offset ? .semibold : .medium))
                .frame(maxWidth: .infinity).padding(.vertical, 7)
                .background(entry.dayOffset == offset ? accent.opacity(0.20) : Color.clear, in: RoundedRectangle(cornerRadius: 10))
                .foregroundStyle(entry.dayOffset == offset ? accent : .secondary)
        }.buttonStyle(.plain).accessibilityLabel("\(title), заездов: \(count)")
            .accessibilityAddTraits(entry.dayOffset == offset ? .isSelected : [])
    }

    private func arrival(_ booking: Booking, data: Dashboard, count: Int, height: CGFloat) -> some View {
        Link(destination: booking.deepLink) {
            Group {
                if count == 1 {
                    featuredArrival(booking, data: data, height: height)
                } else if count <= 3 && height >= 58 {
                    spaciousArrival(booking, data: data, count: count)
                } else {
                    compactArrival(booking, data: data, columns: count > 6, height: height)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .frame(height: height)
            .contentShape(Rectangle())
        }.buttonStyle(.plain)
            .accessibilityLabel("\(data.propertyName(booking.propertyId)), \(booking.guestLabel), заезд \(RomeDate.label(booking.startDate)), выезд \(RomeDate.label(booking.endDate)), \(booking.nights) ночей")
    }

    private func featuredArrival(_ booking: Booking, data: Dashboard, height: CGFloat) -> some View {
        HStack(alignment: .top, spacing: 12) {
            PropertyIcon(propertyId: booking.propertyId, size: 28, showsTile: true)
            VStack(alignment: .leading, spacing: height > 180 ? 10 : 6) {
                Text(RomeDate.label(booking.startDate, template: "EEEE"))
                    .font(.caption).foregroundStyle(.secondary)
                Text(data.propertyName(booking.propertyId))
                    .font(.system(size: 26, weight: .semibold)).lineLimit(2).minimumScaleFactor(0.8)
                Text(booking.guestLabel).font(.system(size: 17)).foregroundStyle(.secondary).lineLimit(2)
                Text(dateRange(booking)).font(.system(size: 14)).lineLimit(1).minimumScaleFactor(0.8)
                HStack(spacing: 12) {
                    Label("\(booking.nights) ноч.", systemImage: "moon")
                    if let guests = booking.guestCount { Label("\(guests)", systemImage: "person.2") }
                }.font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(renderingMode == .fullColor ? accent.opacity(0.09) : Color.secondary.opacity(0.06),
                    in: RoundedRectangle(cornerRadius: 18))
    }

    private func spaciousArrival(_ booking: Booking, data: Dashboard, count: Int) -> some View {
        HStack(spacing: 12) {
            PropertyIcon(propertyId: booking.propertyId, size: count == 2 ? 26 : 22, showsTile: true)
            VStack(alignment: .leading, spacing: 4) {
                Text(data.propertyName(booking.propertyId))
                    .font(.system(size: count == 2 ? 20 : 17, weight: .semibold))
                    .lineLimit(1).minimumScaleFactor(0.75)
                Text(booking.guestLabel).font(.system(size: count == 2 ? 15 : 13)).foregroundStyle(.secondary).lineLimit(1)
                Text("\(dateRange(booking)) · \(booking.nights) ноч.")
                    .font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.8)
            }
        }
    }

    private func compactArrival(_ booking: Booking, data: Dashboard, columns: Bool, height: CGFloat) -> some View {
        let tight = height < 35
        return HStack(spacing: columns ? 5 : 8) {
            PropertyIcon(propertyId: booking.propertyId, size: columns || tight ? 13 : 17, showsTile: true)
            VStack(alignment: .leading, spacing: 2) {
                Text(data.propertyName(booking.propertyId))
                    .font(.system(size: columns || tight ? 11 : 13, weight: .semibold))
                    .lineLimit(1).minimumScaleFactor(0.8)
                Text(booking.guestLabel).font(.system(size: columns || tight ? 10 : 11))
                    .foregroundStyle(.secondary).lineLimit(1)
            }.frame(maxWidth: .infinity, alignment: .leading)
            if !columns {
                VStack(alignment: .trailing, spacing: 2) {
                    Text("до \(RomeDate.label(booking.endDate))")
                    Text("\(booking.nights) ноч.").foregroundStyle(.secondary)
                }.font(.system(size: tight ? 10 : 11)).fixedSize(horizontal: true, vertical: false)
            }
        }
    }

    private func dateRange(_ booking: Booking) -> String {
        "\(RomeDate.label(booking.startDate)) – \(RomeDate.label(booking.endDate))"
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

