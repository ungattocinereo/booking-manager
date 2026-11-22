import SwiftUI

struct TodayView: View {
    @EnvironmentObject private var store: BookingStore
    @ScaledMetric(relativeTo: .largeTitle) private var headingSize = 40.0

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 18) {
                Text("Заезды")
                    .font(.system(size: headingSize, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white).accessibilityAddTraits(.isHeader)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 24).padding(.vertical, 28)
                    .background(Color(red: 0.38, green: 0.18, blue: 0.75), in: RoundedRectangle(cornerRadius: 26))
                StatusBanner()
                if let data = store.dashboard {
                    let days = data.arrivalDays()
                    if days.isEmpty { Text("Предстоящих заездов пока нет").foregroundStyle(.secondary).padding(6) }
                    ForEach(Array(days.enumerated()), id: \.element.id) { index, day in
                        VStack(alignment: .leading, spacing: 10) {
                            if index == 0 { Text("Следующий заезд").font(.subheadline).foregroundStyle(.secondary) }
                            Text(RomeDate.label(day.id, template: day.id.prefix(4) == RomeDate.key().prefix(4) ? "d MMMM" : "d MMMM yyyy"))
                                .font(.system(.title3, design: .rounded, weight: .bold))
                                .accessibilityAddTraits(.isHeader)
                            ForEach(day.bookings) { booking in
                                Button { store.selectedBooking = booking } label: {
                                    ArrivalCard(booking: booking, property: data.propertyName(booking.propertyId))
                                }.buttonStyle(.plain)
                            }
                        }.padding(.bottom, 6)
                    }
                } else if store.isLoading { ProgressView("Загружаем заезды…") }
            }.padding(18)
        }.background(Orbit.background)
            .navigationTitle("Заезды").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .principal) { Text("Atrani").font(.headline) } }
            .refreshable { await store.refresh() }
    }
}

private struct ArrivalCard: View {
    let booking: Booking
    let property: String
    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 8) {
                PropertyIcon(propertyId: booking.propertyId, size: 18)
                Text(property).font(.headline.weight(.regular)).foregroundStyle(Orbit.subtitle)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            HStack(spacing: 6) {
                PlatformIcon(booking: booking, size: 17).accessibilityHidden(true)
                Text(booking.platformLabel).font(.caption).foregroundStyle(.secondary)
            }
            Text(booking.guestLabel).font(.subheadline).foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 16) {
                Label("\(booking.nights) ноч.", systemImage: "moon")
                Label(booking.guestCount.map { "\($0) чел." } ?? "Гостей: уточняется", systemImage: "person.2")
            }.font(.caption).foregroundStyle(.secondary)
            Divider()
            Text("\(RomeDate.label(booking.startDate, template: "d MMM")) — \(RomeDate.label(booking.endDate, template: "d MMM yyyy"))")
                .font(.caption).foregroundStyle(.secondary)
        }.padding(14).frame(maxWidth: .infinity, alignment: .leading)
            .background(Orbit.calendarSurface, in: RoundedRectangle(cornerRadius: 18))
            .contentShape(Rectangle())
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
