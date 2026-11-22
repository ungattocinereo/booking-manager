import SwiftUI

struct CalendarView: View {
    @EnvironmentObject private var store: BookingStore
    @State private var visibleDay = RomeDate.key()
    @ScaledMetric(relativeTo: .caption) private var dayWidth = 46.0
    @ScaledMetric(relativeTo: .caption) private var rowHeight = 52.0
    @ScaledMetric(relativeTo: .caption) private var propertyWidth = 128.0
    @State private var timeline = BookingTimeline(today: RomeDate.key())
    private var properties: [Property] { store.dashboard?.properties ?? [] }
    private var next: [Booking] { store.dashboard?.arrivalDays().first?.bookings ?? [] }

    var body: some View {
        ScrollViewReader { proxy in
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
                    monthControls(proxy)
                    if store.dashboard == nil && store.isLoading { ProgressView().frame(maxWidth: .infinity) }
                    else if properties.isEmpty { Text("Апартаменты пока не загружены").foregroundStyle(.secondary).padding(20) }
                    else { grid(proxy) }
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
                .onAppear { scroll(to: store.calendarDay, proxy: proxy) }
                .onChange(of: store.calendarDay) { _, day in scroll(to: day, proxy: proxy) }
                .onChange(of: properties.map(\.id)) { _, _ in scroll(to: store.calendarDay, proxy: proxy) }
                .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
                    if timeline.today != RomeDate.key() {
                        timeline = BookingTimeline(today: RomeDate.key())
                        scroll(to: RomeDate.key(), proxy: proxy)
                    }
                }
        }
    }

    private func monthControls(_ proxy: ScrollViewProxy) -> some View {
        HStack {
            Menu {
                ForEach(timeline.months, id: \.self) { day in
                    Button(RomeDate.label(day, template: "LLLL yyyy").capitalized) { scroll(to: day, proxy: proxy) }
                }
            } label: {
                HStack(spacing: 8) {
                    Text(RomeDate.label(visibleDay, template: "LLLL yyyy").capitalized)
                        .font(.system(.headline, design: .rounded, weight: .bold))
                    Image(systemName: "chevron.down").font(.caption.weight(.semibold))
                }.foregroundStyle(.primary).frame(minHeight: 44)
            }.tint(.primary).accessibilityLabel("Выбрать месяц")
            Spacer(minLength: 8)
            Button("Сегодня") { scroll(to: RomeDate.key(), proxy: proxy) }
                .font(.subheadline).padding(.horizontal, 12).frame(minHeight: 44)
                .background(Color(uiColor: .secondarySystemGroupedBackground), in: Capsule())
        }.padding(.horizontal, 18)
    }

    private func grid(_ proxy: ScrollViewProxy) -> some View {
        let rows = properties.map { property in
            (property, timeline.segments(for: property.id, bookings: store.dashboard?.bookings ?? []))
        }
        return HStack(alignment: .top, spacing: 0) {
            VStack(spacing: 0) {
                Text("АПАРТАМЕНТЫ").font(.system(size: 10, weight: .medium)).foregroundStyle(.secondary)
                    .frame(width: propertyWidth, height: 58).background(Orbit.calendarSurface)
                    .overlay(alignment: .bottom) { Divider() }
                ForEach(rows, id: \.0.id) { property, segments in
                    NavigationLink { PropertyDetailView(property: property) } label: {
                        HStack(spacing: 6) {
                            Text(property.name).font(.caption.weight(.bold)).foregroundStyle(.primary)
                                .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 0)
                            PropertyIcon(propertyId: property.id, size: 17)
                        }.padding(.horizontal, 10)
                            .frame(width: propertyWidth, height: height(segments)).contentShape(Rectangle())
                    }.buttonStyle(.plain).background(Orbit.calendarSurface)
                        .overlay(alignment: .bottom) { Divider() }
                }
            }.overlay(alignment: .trailing) { Divider() }.zIndex(1)
            ScrollView(.horizontal) {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 0) {
                        ForEach(timeline.days, id: \.self) { day in
                            VStack(spacing: 4) {
                                Text(timeline.weekdays[day] ?? "").font(.caption2).foregroundStyle(.secondary)
                                Text(String(Int(day.suffix(2)) ?? 0)).font(.system(.headline, design: .rounded, weight: .heavy))
                                    .foregroundStyle(day == RomeDate.key() ? Orbit.violet : .primary)
                            }.frame(width: dayWidth, height: 58)
                                .background(day == RomeDate.key() ? Orbit.violet.opacity(0.07) : .clear)
                                .overlay(alignment: .trailing) { Divider() }
                                .id(day).accessibilityElement(children: .ignore)
                                .accessibilityLabel(RomeDate.label(day, template: "d MMMM yyyy"))
                        }
                    }.scrollTargetLayout().overlay(alignment: .bottom) { Divider() }
                    ForEach(rows, id: \.0.id) { property, segments in
                        timelineRow(property, segments: segments)
                    }
                }
            }.scrollPosition(id: Binding<String?>(get: { visibleDay }, set: { if let day = $0 { visibleDay = day } }), anchor: .leading)
                .background(Orbit.calendarSurface)
                .defaultScrollAnchor(.leading)
        }
    }

    private func timelineRow(_ property: Property, segments: [TimelineSegment]) -> some View {
        ZStack(alignment: .topLeading) {
            Canvas { context, size in
                var lines = Path()
                for day in 0...timeline.days.count {
                    let x = CGFloat(day) * dayWidth
                    lines.move(to: CGPoint(x: x, y: 0)); lines.addLine(to: CGPoint(x: x, y: size.height))
                }
                lines.move(to: CGPoint(x: 0, y: size.height)); lines.addLine(to: CGPoint(x: size.width, y: size.height))
                context.stroke(lines, with: .color(Color(uiColor: .separator).opacity(0.35)), lineWidth: 0.5)
            }.accessibilityHidden(true)
            ForEach(segments) { segment in
                Button { store.selectedBooking = segment.booking } label: {
                    HStack(spacing: 4) {
                        if !segment.clippedStart { Image(systemName: "arrow.down.right").font(.caption2) }
                        Spacer(minLength: 0)
                        PlatformIcon(booking: segment.booking, size: 20)
                        Spacer(minLength: 0)
                        if !segment.clippedEnd { Image(systemName: "arrow.up.right").font(.caption2) }
                    }.padding(.horizontal, segment.end - segment.start < 2 ? 3 : 9)
                        .frame(width: max(1, (segment.end - segment.start) * dayWidth - 4), height: rowHeight - 12)
                        .foregroundStyle(Orbit.violet)
                        .background(Orbit.violet.opacity(0.14), in: RoundedRectangle(cornerRadius: 9))
                        .frame(height: rowHeight).contentShape(Rectangle())
                }.buttonStyle(.plain)
                    .offset(x: segment.start * dayWidth + 2, y: CGFloat(segment.lane) * rowHeight)
                    .accessibilityLabel("\(property.name), \(segment.booking.platformLabel), заезд \(RomeDate.label(segment.booking.startDate)), выезд \(RomeDate.label(segment.booking.endDate))")
            }
        }.frame(width: CGFloat(timeline.days.count) * dayWidth, height: height(segments)).clipped()
    }

    private func height(_ segments: [TimelineSegment]) -> CGFloat { CGFloat((segments.map(\.lane).max() ?? 0) + 1) * rowHeight }
    private func scroll(to day: String, proxy: ScrollViewProxy) {
        let target = timeline.clamped(day)
        visibleDay = target
        proxy.scrollTo(target, anchor: .leading)
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

struct CleaningsView: View {
    @EnvironmentObject private var store: BookingStore
    @State private var onlyPending = true
    private var tasks: [CleaningTask] {
        (store.dashboard?.cleaningTasks ?? []).filter { $0.status != "cancelled" && (!onlyPending || !$0.isComplete) }.sorted { $0.scheduledDate < $1.scheduledDate }
    }
    var body: some View {
        List {
            Section { Toggle("Только предстоящие", isOn: $onlyPending) }
            if tasks.isEmpty { ContentUnavailableView("Уборок пока нет", systemImage: "sparkles") }
            ForEach(Array(Set(tasks.map(\.scheduledDate))).sorted(), id: \.self) { date in
                Section(RomeDate.label(date, template: "d MMMM EEEE")) {
                    ForEach(tasks.filter { $0.scheduledDate == date }) { task in
                        HStack(spacing: 14) {
                            Image(systemName: task.isComplete ? "checkmark.circle.fill" : "sparkles").foregroundStyle(task.isComplete ? Orbit.mint : Orbit.violet)
                            VStack(alignment: .leading, spacing: 5) {
                                Text(store.dashboard?.propertyName(task.propertyId) ?? task.propertyId).font(.headline)
                                Text(task.cleanerName ?? "Исполнитель не назначен").font(.subheadline).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(task.isComplete ? "Готово" : "Ожидает").font(.caption).foregroundStyle(.secondary)
                        }.padding(.vertical, 5)
                    }
                }
            }
            Section { Text("Назначения и отметки об уборке изменяются в веб-кабинете.").font(.caption).foregroundStyle(.secondary) }
        }.navigationTitle("Уборки").refreshable { await store.refresh() }
    }
}
