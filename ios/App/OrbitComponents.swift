import SwiftUI

enum Orbit {
    static let violet = Color(red: 0.43, green: 0.17, blue: 0.99)
    static let mint = Color(red: 0.08, green: 0.65, blue: 0.51)
    static let background = Color(uiColor: .systemGroupedBackground)
}

extension View {
    func orbitCard() -> some View {
        padding(18).background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 24))
    }
}

struct SourceBadge: View {
    let booking: Booking
    var body: some View {
        Text(booking.platformLabel).font(.caption.weight(.semibold))
            .padding(.horizontal, 9).padding(.vertical, 5)
            .background(booking.platform == "airbnb" ? Color.pink.opacity(0.12) : Color.blue.opacity(0.12), in: Capsule())
            .foregroundStyle(booking.platform == "airbnb" ? .pink : .blue)
    }
}

struct BookingRow: View {
    @EnvironmentObject private var store: BookingStore
    let booking: Booking
    var body: some View {
        Button { store.selectedBooking = booking } label: {
            HStack(spacing: 14) {
                VStack(spacing: 2) {
                    Text(String(booking.startDate.suffix(2))).font(.title2.bold().monospacedDigit())
                    Text(RomeDate.label(booking.startDate, template: "MMM")).font(.caption)
                }
                .foregroundStyle(Orbit.violet).frame(width: 54, height: 60)
                .background(Orbit.violet.opacity(0.08), in: RoundedRectangle(cornerRadius: 15))
                VStack(alignment: .leading, spacing: 5) {
                    Text(store.dashboard?.propertyName(booking.propertyId) ?? booking.propertyId).font(.headline)
                    Text(booking.guestLabel).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                    Text("\(RomeDate.label(booking.startDate)) – \(RomeDate.label(booking.endDate)) · \(booking.nights) ноч.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(.tertiary)
            }
            .frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
        }.buttonStyle(.plain)
    }
}

struct StatusBanner: View {
    @EnvironmentObject private var store: BookingStore
    var body: some View {
        if store.demo {
            Label("Демонстрация · вымышленные данные", systemImage: "eye")
                .font(.caption.weight(.medium)).foregroundStyle(.orange).frame(maxWidth: .infinity)
        } else if let error = store.error {
            Label(error, systemImage: "wifi.exclamationmark").font(.caption).foregroundStyle(.orange)
        } else if let health = store.dashboard?.syncHealth, health.stale || health.status != "ok" {
            Label("Календари требуют проверки · данные могут быть устаревшими", systemImage: "exclamationmark.triangle")
                .font(.caption).foregroundStyle(.orange)
        }
    }
}

struct EmptyBookingsView: View {
    var title = "Бронирований пока нет"
    var body: some View {
        ContentUnavailableView(title, systemImage: "calendar.badge.checkmark", description: Text("Новые заезды появятся после синхронизации календарей."))
    }
}
