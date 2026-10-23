import SwiftUI

struct TodayView: View {
    @EnvironmentObject private var store: BookingStore
    private var today: String { RomeDate.key() }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("ATRANI / BOOKING MANAGER").font(.caption2.weight(.bold)).tracking(2).foregroundStyle(Orbit.violet)
                        Text(RomeDate.label(today, template: "d MMMM EEEE").capitalized).font(.subheadline).foregroundStyle(.secondary)
                    }
                    Spacer()
                    if store.isLoading { ProgressView() }
                    else { Image(systemName: "sun.max.fill").font(.title).foregroundStyle(.orange) }
                }
                StatusBanner()
                if let data = store.dashboard {
                    HStack(spacing: 10) {
                        metric("Заезды", value: data.arrivals(on: today).count, icon: "arrow.down.left", color: Orbit.mint)
                        metric("Выезды", value: data.departures(on: today).count, icon: "arrow.up.right", color: .orange)
                        metric("Занято", value: Set(data.occupied(on: today).map(\.propertyId)).count, icon: "bed.double", color: Orbit.violet)
                    }
                    if let next = data.upcoming().first { nextCard(next, data: data) }
                    Text("Ближайшие заезды").font(.title3.bold())
                    if data.upcoming().isEmpty { EmptyBookingsView() }
                    else {
                        VStack(spacing: 18) {
                            ForEach(data.upcoming().prefix(12)) { booking in
                                BookingRow(booking: booking)
                                if booking.id != data.upcoming().prefix(12).last?.id { Divider() }
                            }
                        }.orbitCard()
                    }
                    if !data.departures(on: today).isEmpty {
                        Text("Сегодня выезжают").font(.title3.bold())
                        VStack(spacing: 18) { ForEach(data.departures(on: today)) { BookingRow(booking: $0) } }.orbitCard()
                    }
                    Text("Данные получены: \(updatedLabel(data.generatedAt))").font(.caption2).foregroundStyle(.secondary)
                } else if store.isLoading { ProgressView("Загружаем бронирования…").frame(maxWidth: .infinity).padding(50) }
                else { EmptyBookingsView() }
            }.padding(20)
        }
        .background(Orbit.background).navigationTitle("Сегодня")
        .refreshable { await store.refresh() }
    }

    private func metric(_ title: String, value: Int, icon: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: icon).foregroundStyle(color)
            Text("\(value)").font(.system(size: 30, weight: .bold, design: .rounded))
            Text(title).font(.caption).foregroundStyle(.secondary)
        }.frame(maxWidth: .infinity, alignment: .leading).padding(16)
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 22))
    }

    private func nextCard(_ booking: Booking, data: Dashboard) -> some View {
        Button { store.selectedBooking = booking } label: {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Label("СЛЕДУЮЩИЙ ЗАЕЗД", systemImage: "arrow.down.left").font(.caption.weight(.bold)).tracking(1)
                    Spacer()
                    Image(systemName: "arrow.up.right")
                }.foregroundStyle(.white.opacity(0.8))
                Text(data.propertyName(booking.propertyId)).font(.system(size: 32, weight: .bold, design: .rounded))
                Text(booking.guestLabel).font(.title3)
                HStack {
                    Text("\(RomeDate.label(booking.startDate)) – \(RomeDate.label(booking.endDate))").font(.headline)
                    Spacer()
                    Text("\(booking.nights) ноч.").font(.subheadline.weight(.semibold))
                }.padding(.top, 8)
            }.foregroundStyle(.white).padding(24).frame(maxWidth: .infinity, alignment: .leading)
                .background(LinearGradient(colors: [Orbit.violet, Color(red: 0.3, green: 0.15, blue: 0.72)], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 28))
        }.buttonStyle(.plain)
    }

    private func updatedLabel(_ value: String) -> String {
        guard let date = ISO8601DateFormatter().date(from: value) ?? fractionalDate(value) else { return "—" }
        return date.formatted(date: .abbreviated, time: .shortened)
    }
    private func fractionalDate(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: value)
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
