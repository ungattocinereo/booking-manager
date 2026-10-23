import SwiftUI

struct CalendarView: View {
    @EnvironmentObject private var store: BookingStore
    @State private var month = Date()
    @State private var selected = RomeDate.key()
    @State private var property = ""
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 3), count: 7)

    private var first: Date { RomeDate.calendar.date(from: RomeDate.calendar.dateComponents([.year, .month], from: month))! }
    private var offset: Int { (RomeDate.calendar.component(.weekday, from: first) + 5) % 7 }
    private var count: Int { RomeDate.calendar.range(of: .day, in: .month, for: month)!.count }
    private var earliest: Date {
        let served = RomeDate.date(store.dashboard?.date ?? RomeDate.key()) ?? Date()
        return RomeDate.calendar.startOfDay(for: RomeDate.calendar.date(byAdding: .day, value: -90, to: served)!)
    }
    private var bookings: [Booking] {
        (store.dashboard?.bookings ?? []).filter { (property.isEmpty || $0.propertyId == property) && $0.startDate <= selected && $0.endDate >= selected }
            .sorted { $0.startDate < $1.startDate }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                StatusBanner()
                Picker("Объект", selection: $property) {
                    Text("Все объекты").tag("")
                    ForEach(store.dashboard?.properties ?? []) { Text($0.name).tag($0.id) }
                }.pickerStyle(.menu)
                VStack(spacing: 16) {
                    HStack {
                        Button { shift(-1) } label: { Image(systemName: "chevron.left").padding(8) }
                            .accessibilityLabel("Предыдущий месяц")
                            .disabled(RomeDate.calendar.isDate(first, equalTo: earliest, toGranularity: .month) || first < earliest)
                        Spacer()
                        Text(RomeDate.label(RomeDate.key(month), template: "LLLL yyyy").capitalized).font(.headline)
                        Spacer()
                        Button { shift(1) } label: { Image(systemName: "chevron.right").padding(8) }.accessibilityLabel("Следующий месяц")
                    }
                    LazyVGrid(columns: columns, spacing: 7) {
                        ForEach(["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"], id: \.self) { Text($0).font(.caption2.bold()).foregroundStyle(.secondary) }
                        ForEach(0..<(offset + count), id: \.self) { index in
                            if index < offset { Color.clear.frame(height: 44) }
                            else { dayCell(index - offset + 1) }
                        }
                    }
                }.orbitCard()
                HStack {
                    Text(RomeDate.label(selected, template: "d MMMM")).font(.title3.bold())
                    Spacer()
                    Button("Сегодня") { month = Date(); selected = RomeDate.key() }.font(.subheadline)
                }
                if bookings.isEmpty { EmptyBookingsView(title: "На эту дату броней нет") }
                else {
                    VStack(spacing: 20) { ForEach(bookings) { BookingRow(booking: $0) } }.orbitCard()
                }
            }.padding(20)
        }.background(Orbit.background).navigationTitle("Календарь")
            .refreshable { await store.refresh() }
    }

    private func shift(_ delta: Int) {
        month = RomeDate.calendar.date(byAdding: .month, value: delta, to: first)!
        selected = RomeDate.key(month)
    }

    private func dayCell(_ day: Int) -> some View {
        let date = RomeDate.calendar.date(byAdding: .day, value: day - 1, to: first)!
        let key = RomeDate.key(date)
        let occupied = store.dashboard?.bookings.contains { (property.isEmpty || $0.propertyId == property) && $0.startDate <= key && key < $0.endDate } ?? false
        return Button { selected = key } label: {
            VStack(spacing: 3) {
                Text("\(day)").font(.subheadline.weight(selected == key ? .bold : .medium))
                Circle().fill(occupied ? (selected == key ? .white : Orbit.violet) : .clear).frame(width: 4, height: 4)
            }.frame(maxWidth: .infinity).frame(height: 44)
                .background(selected == key ? Orbit.violet : .clear, in: RoundedRectangle(cornerRadius: 13))
                .foregroundStyle(selected == key ? .white : (key == RomeDate.key() ? Orbit.violet : .primary))
        }.buttonStyle(.plain).disabled(date < earliest)
            .accessibilityLabel("\(RomeDate.label(key, template: "d MMMM"))\(occupied ? ", есть бронирования" : "")")
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
                        Image(systemName: "door.left.hand.open").foregroundStyle(Orbit.violet).frame(width: 30)
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
