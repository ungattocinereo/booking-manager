import SwiftUI

struct TodayView: View {
    @EnvironmentObject private var store: BookingStore
    @State private var dayOffset = 0
    private var today: String { RomeDate.key() }
    private var day: String { RomeDate.key(RomeDate.calendar.date(byAdding: .day, value: dayOffset, to: Date())!) }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                StatusBanner()
                if let data = store.dashboard {
                    Picker("День заезда", selection: $dayOffset) {
                        Text("Сегодня · \(data.arrivals(on: today).count)").tag(0)
                        Text("Завтра · \(data.arrivals(on: RomeDate.key(RomeDate.calendar.date(byAdding: .day, value: 1, to: Date())!)).count)").tag(1)
                    }.pickerStyle(.segmented)
                    HStack {
                        Label(RomeDate.label(day, template: "d MMMM EEEE"), systemImage: "calendar")
                        Spacer()
                        if store.isLoading { ProgressView() }
                    }.font(.subheadline).foregroundStyle(.secondary)
                    let board = ArrivalBoard(dashboard: data, day: day)
                    VStack(alignment: .leading, spacing: 16) {
                        HStack {
                            Label(board.isNext ? "Ближайшие заезды" : "Заезды", systemImage: "key.horizontal")
                                .font(.headline)
                            Spacer()
                            Text("\(board.bookings.count)").font(.headline.monospacedDigit()).foregroundStyle(Orbit.violet)
                        }
                        if board.isNext {
                            Text("\(dayOffset == 0 ? "Сегодня" : "Завтра") заездов нет · ближайший через \(RomeDate.days(today, board.displayDay)) дн.")
                                .font(.subheadline).foregroundStyle(.secondary)
                        }
                        if board.bookings.isEmpty { EmptyBookingsView(title: "Ближайших заездов нет") }
                        else if board.bookings.count == 1, let next = board.bookings.first { nextCard(next, data: data) }
                        else {
                            ForEach(board.bookings) { booking in
                                BookingRow(booking: booking)
                                if booking.id != board.bookings.last?.id { Divider() }
                            }
                        }
                    }.orbitCard()
                    HStack(spacing: 16) {
                        metric("Выезды", value: data.departures(on: day).count, icon: "arrow.up.right")
                        metric("Занято", value: Set(data.occupied(on: day).map(\.propertyId)).count, icon: "bed.double")
                        metric("Объекты", value: data.properties.count, icon: "building.2")
                    }
                    if !data.departures(on: day).isEmpty {
                        Label("\(dayOffset == 0 ? "Сегодня" : "Завтра") выезжают", systemImage: "arrow.up.right").font(.title3.weight(.semibold))
                        VStack(spacing: 16) { ForEach(data.departures(on: day)) { BookingRow(booking: $0) } }.orbitCard()
                    }
                    let later = data.upcoming(on: day).filter { $0.startDate > board.displayDay }
                    if !later.isEmpty {
                        Text("Далее в календаре").font(.title3.weight(.semibold))
                        VStack(spacing: 16) { ForEach(later.prefix(8)) { BookingRow(booking: $0) } }.orbitCard()
                    }
                    Button { store.calendarDay = day; store.tab = 1 } label: {
                        Label("Календарь всех апартаментов", systemImage: "calendar").frame(maxWidth: .infinity, minHeight: 44)
                    }.buttonStyle(.bordered)
                    Text("Получено \(updatedLabel(data.generatedAt))").font(.caption).foregroundStyle(.secondary)
                } else if store.isLoading { ProgressView("Загружаем бронирования…").frame(maxWidth: .infinity).padding(48) }
                else { EmptyBookingsView() }
            }.padding(20)
        }.background(Orbit.background).navigationTitle("Заезды")
            .refreshable { await store.refresh() }
    }
    private func metric(_ title: String, value: Int, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("\(value)").font(.title.weight(.medium).monospacedDigit())
            Label(title, systemImage: icon).font(.caption).foregroundStyle(.secondary)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
    private func nextCard(_ booking: Booking, data: Dashboard) -> some View {
        Button { store.selectedBooking = booking } label: {
            VStack(alignment: .leading, spacing: 12) {
                Text(data.propertyName(booking.propertyId)).font(.largeTitle.weight(.semibold)).foregroundStyle(Orbit.violet)
                Label(booking.guestLabel, systemImage: "person").font(.title3)
                Label("\(RomeDate.label(booking.startDate)) – \(RomeDate.label(booking.endDate))", systemImage: "calendar").font(.subheadline)
                HStack(spacing: 16) {
                    Label("\(booking.nights) ноч.", systemImage: "moon")
                    if let count = booking.guestCount { Label("\(count) гостей", systemImage: "person.2") }
                    Spacer()
                    Image(systemName: "chevron.right")
                }.font(.subheadline).foregroundStyle(.secondary)
            }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 12).contentShape(Rectangle())
        }.buttonStyle(.plain)
    }
    private func updatedLabel(_ value: String) -> String {
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value) else { return "—" }
        let display = DateFormatter(); display.locale = Locale(identifier: "ru_RU"); display.timeZone = RomeDate.calendar.timeZone
        display.dateStyle = .short; display.timeStyle = .short
        return display.string(from: date)
    }
}

struct BookingDetailView: View {
    @EnvironmentObject private var store: BookingStore
    @Environment(\.dismiss) private var dismiss
    let booking: Booking
    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    SourceBadge(booking: booking)
                    Text(booking.guestLabel).font(.title.bold())
                    Text(store.dashboard?.propertyName(booking.propertyId) ?? booking.propertyId).font(.title3).foregroundStyle(.secondary)
                }.padding(.vertical, 12)
            }
            Section("Проживание") {
                LabeledContent("Заезд", value: RomeDate.label(booking.startDate, template: "d MMMM yyyy"))
                LabeledContent("Выезд", value: RomeDate.label(booking.endDate, template: "d MMMM yyyy"))
                LabeledContent("Ночей", value: "\(booking.nights)")
                if let count = booking.guestCount { LabeledContent("Гостей", value: "\(count)") }
            }
            if booking.operationalFallback {
                Section { Label("Заезд определён по календарю. Данные гостя требуют уточнения.", systemImage: "info.circle").foregroundStyle(.secondary) }
            }
            if let value = booking.reservationUrl, let url = URL(string: value), url.scheme == "https" {
                Section { Link(destination: url) { Label("Открыть бронь на \(booking.platformLabel)", systemImage: "arrow.up.right.square") } }
            }
        }
        .navigationTitle("Бронирование").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Готово") { dismiss() } } }
    }
}
