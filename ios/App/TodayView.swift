import SwiftUI

struct TodayView: View {
    @EnvironmentObject private var store: BookingStore

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                StatusBanner().padding(.bottom, 12)
                Text("Заезды").font(.system(.largeTitle, design: .rounded, weight: .heavy))
                    .padding(.bottom, 28).accessibilityAddTraits(.isHeader)
                if let data = store.dashboard {
                    let days = data.arrivalDays()
                    if days.isEmpty { Text("Предстоящих заездов пока нет").foregroundStyle(.secondary) }
                    ForEach(Array(days.enumerated()), id: \.element.id) { index, day in
                        VStack(alignment: .leading, spacing: 12) {
                            if index == 0 { Text("Следующий заезд").font(.subheadline).foregroundStyle(.secondary) }
                            Text(RomeDate.label(day.id, template: "d MMMM") + (day.id.prefix(4) != RomeDate.key().prefix(4) ? " \(day.id.prefix(4))" : ""))
                                .font(.system(index == 0 ? .largeTitle : .title, design: .rounded, weight: .heavy))
                                .accessibilityAddTraits(.isHeader)
                            ForEach(day.bookings) { booking in
                                Button { store.selectedBooking = booking } label: {
                                    HStack(spacing: 10) {
                                        Text(data.propertyName(booking.propertyId)).font(.title2.weight(.regular))
                                            .foregroundStyle(Orbit.subtitle)
                                            .multilineTextAlignment(.leading)
                                        PlatformIcon(booking: booking, size: 22)
                                        Spacer(minLength: 0)
                                    }.frame(minHeight: 44).contentShape(Rectangle())
                                }.buttonStyle(.plain)
                            }
                        }.padding(.vertical, index == 0 ? 0 : 22)
                        if index < days.count - 1 { Divider().padding(.top, index == 0 ? 22 : 0) }
                    }
                } else if store.isLoading { ProgressView("Загружаем заезды…") }
            }.padding(24)
        }.background(Orbit.background)
            .navigationTitle("Заезды").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .principal) { Text("Atrani").font(.headline) } }
            .refreshable { await store.refresh() }
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
