import SwiftUI

struct CalendarView: View {
    @EnvironmentObject private var store: BookingStore
    @State private var visibleDay = RomeDate.key()
    @State private var gridData: TimelineGrid?
    @State private var scrollRequest = CalendarScrollRequest(day: RomeDate.key())
    @State private var timeline = BookingTimeline(today: RomeDate.key())
    private var properties: [Property] { store.dashboard?.properties ?? [] }
    private var next: [Booking] { store.dashboard?.arrivalDays().first?.bookings ?? [] }

    var body: some View {
        ScrollView(.vertical) {
            VStack(alignment: .leading, spacing: 18) {
                StatusBanner().padding(.horizontal, 20)
                Text("Календарь").font(.system(.largeTitle, design: .rounded, weight: .heavy))
                    .padding(.horizontal, 24).accessibilityAddTraits(.isHeader)
                if !next.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(next.count > 1 ? "Следующие заезды" : "Следующий заезд").font(.caption).foregroundStyle(.secondary)
                        Text(RomeDate.label(next[0].startDate, template: "d MMMM"))
                            .font(.system(.title2, design: .rounded, weight: .heavy))
                        ForEach(next) { booking in
                            Button { store.selectedBooking = booking } label: {
                                HStack(spacing: 9) {
                                    Text(store.dashboard?.propertyName(booking.propertyId) ?? booking.propertyId)
                                        .font(.title3.weight(.regular)).foregroundStyle(Orbit.subtitle)
                                        .multilineTextAlignment(.leading)
                                    PlatformIcon(booking: booking, size: 21)
                                    Spacer(minLength: 0)
                                    Image(systemName: "arrow.up.right").font(.caption).foregroundStyle(Orbit.violet)
                                }.frame(minHeight: 44).contentShape(Rectangle())
                            }.buttonStyle(.plain)
                        }
                    }.padding(18).background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 22))
                        .padding(.horizontal, 18)
                }
                monthControls
                if store.dashboard == nil && store.isLoading { ProgressView().frame(maxWidth: .infinity) }
                else if properties.isEmpty { Text("Апартаменты пока не загружены").foregroundStyle(.secondary).padding(20) }
                else if let gridData {
                    CalendarTimelineGrid(data: gridData, today: timeline.today, request: scrollRequest,
                        onMonth: { visibleDay = $0 }, onBooking: { store.selectedBooking = $0 })
                }
                HStack(spacing: 12) {
                    Label("Занято", systemImage: "rectangle.fill").foregroundStyle(Orbit.violet)
                    Text("↘ Заезд")
                    Text("↗ Выезд")
                }.font(.caption2).foregroundStyle(.secondary).padding(.horizontal, 18)
                Text("До \(RomeDate.label(timeline.lastDay, template: "d MMMM yyyy"))")
                    .font(.caption2).foregroundStyle(.secondary).padding(.horizontal, 18)
            }.padding(.vertical, 12)
        }.background(Orbit.background)
            .navigationTitle("Календарь").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .principal) { Text("Atrani").font(.headline) } }
            .refreshable { await store.refresh() }
            .onReceive(store.$dashboard) { data in
                if let data { gridData = TimelineGrid(timeline: timeline, properties: data.properties, bookings: data.bookings) }
                else { gridData = nil }
            }
            .onAppear { scroll(to: store.calendarDay) }
            .onChange(of: store.calendarDay) { _, day in scroll(to: day) }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
                if timeline.today != RomeDate.key() {
                    timeline = BookingTimeline(today: RomeDate.key())
                    if let data = store.dashboard {
                        gridData = TimelineGrid(timeline: timeline, properties: data.properties, bookings: data.bookings)
                    }
                    scroll(to: RomeDate.key())
                }
            }
    }

    private var monthControls: some View {
        HStack {
            Menu {
                ForEach(timeline.months, id: \.self) { day in
                    Button(RomeDate.label(day, template: "LLLL yyyy").capitalized) { scroll(to: day) }
                }
            } label: {
                HStack(spacing: 8) {
                    Text(RomeDate.label(visibleDay, template: "LLLL yyyy").capitalized)
                        .font(.system(.headline, design: .rounded, weight: .bold))
                    Image(systemName: "chevron.down").font(.caption.weight(.semibold))
                }.foregroundStyle(.primary).frame(minHeight: 44)
            }.tint(.primary).accessibilityLabel("Выбрать месяц")
            Spacer(minLength: 8)
            Button("Сегодня") { scroll(to: RomeDate.key()) }
                .font(.subheadline).padding(.horizontal, 12).frame(minHeight: 44)
                .background(Color(uiColor: .secondarySystemGroupedBackground), in: Capsule())
        }.padding(.horizontal, 18)
    }

    private func scroll(to day: String) {
        let target = timeline.clamped(day)
        visibleDay = target
        scrollRequest = CalendarScrollRequest(day: target)
    }
}

struct PropertiesView: View {
    @EnvironmentObject private var store: BookingStore
    var body: some View {
        List {
            ForEach(store.dashboard?.properties ?? []) { property in
                NavigationLink {
                    PropertyDetailView(property: property)
                } label: {
                    HStack(spacing: 14) {
                        PropertyIcon(propertyId: property.id, size: 22).frame(width: 30)
                        VStack(alignment: .leading, spacing: 5) {
                            Text(property.name).font(.headline)
                            if let next = store.dashboard?.upcoming(propertyId: property.id).first {
                                Text("Следующий заезд · \(RomeDate.label(next.startDate))").font(.caption).foregroundStyle(.secondary)
                            } else { Text("Ближайших заездов нет").font(.caption).foregroundStyle(.secondary) }
                        }.padding(.vertical, 7)
                    }
                }
            }
        }.navigationTitle("Объекты").refreshable { await store.refresh() }
    }
}

struct PropertyDetailView: View {
    @EnvironmentObject private var store: BookingStore
    let property: Property
    var body: some View {
        List {
            let occupied = store.dashboard?.occupied(on: RomeDate.key()).first { $0.propertyId == property.id }
            Section {
                Label(occupied == nil ? "Сегодня свободно" : "Сегодня проживают гости", systemImage: occupied == nil ? "door.left.hand.open" : "bed.double")
                    .foregroundStyle(occupied == nil ? Orbit.mint : Orbit.violet)
                if let occupied { BookingRow(booking: occupied) }
            }
            Section("Будущие заезды") {
                let upcoming = store.dashboard?.upcoming(propertyId: property.id) ?? []
                if upcoming.isEmpty { Text("Бронирований пока нет").foregroundStyle(.secondary) }
                ForEach(upcoming) { BookingRow(booking: $0).padding(.vertical, 4) }
            }
        }.navigationTitle(property.name)
    }
}
