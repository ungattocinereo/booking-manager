import SwiftUI
import WidgetKit

@main
struct AtraniApp: App {
    @StateObject private var store = BookingStore()
    var body: some Scene {
        WindowGroup {
            launchView.environmentObject(store).tint(Orbit.violet)
                .task { await store.start() }
                .onOpenURL { store.open($0) }
        }
    }
    @ViewBuilder private var launchView: some View {
        #if DEBUG && targetEnvironment(simulator)
        if ProcessInfo.processInfo.arguments.contains("--widget-preview") { ArrivalWidgetPreview() }
        else { RootView() }
        #else
        RootView()
        #endif
    }

}

@MainActor
final class BookingStore: ObservableObject {
    @Published var dashboard: Dashboard? = SharedStore.cached()
    @Published var connection: Connection? = SharedStore.connection()
    @Published var isLoading = false
    @Published var error: String?
    @Published var demo = false
    @Published var selectedBooking: Booking?
    @Published var tab = 0
    @Published var calendarDay = RomeDate.key()
    @Published var taxUpdatingIDs: Set<String> = []
    @Published var cleanerDirectory: CleanerDirectory?
    @Published var cleanersLoading = false
    @Published var cleanersSaving = false
    @Published var cleanersError: String?
    private var dataRevision = 0
    private var started = false
    private(set) var revision = UUID()
    private var pendingBookingId: String?

    func start() async {
        guard !started else { return }
        started = true
        #if DEBUG && targetEnvironment(simulator)
        let arguments = ProcessInfo.processInfo.arguments
        if arguments.contains("--widget-preview") { return }
        if arguments.contains("--demo") {
            showDemo()
            if arguments.contains("--calendar-stress") { dashboard = .calendarStressDemo(); tab = 1 }
            return
        }
        if let index = arguments.firstIndex(of: "--connection-file"), index + 1 < arguments.count {
            do {
                let data = try Data(contentsOf: URL(fileURLWithPath: arguments[index + 1]))
                let value = try JSONDecoder().decode(Connection.self, from: data)
                await refresh(using: value)
            } catch { self.error = error.localizedDescription }
            return
        }
        #endif
        await refresh()
    }

    func refresh(using candidate: Connection? = nil) async {
        guard !isLoading, taxUpdatingIDs.isEmpty, !demo || candidate != nil, let settings = candidate ?? connection else { return }
        let requestRevision = revision
        let requestDataRevision = dataRevision
        isLoading = true
        defer { if requestRevision == revision { isLoading = false } }
        do {
            let (result, raw) = try await APITransport.shared.load(settings)
            guard requestRevision == revision, requestDataRevision == dataRevision else { return }
            if candidate != nil {
                try SharedStore.save(settings)
                connection = settings
                cleanerDirectory = nil
                cleanersLoading = false
                cleanersSaving = false
            }
            try SharedStore.cache(raw)
            dashboard = result
            demo = false
            error = nil
            resolvePendingLink()
            WidgetCenter.shared.reloadTimelines(ofKind: SharedStore.widgetKind)
        } catch {
            guard requestRevision == revision, requestDataRevision == dataRevision else { return }
            self.error = error.localizedDescription
        }
    }

    func setTaxPaid(_ booking: Booking, paid: Bool) async {
        guard booking.taxApplicable == true, booking.taxPaid != nil,
              !taxUpdatingIDs.contains(booking.id) else { return }
        let requestRevision = revision
        dataRevision += 1
        taxUpdatingIDs.insert(booking.id)
        defer {
            if requestRevision == revision { taxUpdatingIDs.remove(booking.id); dataRevision += 1 }
        }
        do {
            let receipt: MobileTaxReceipt
            if demo {
                receipt = MobileTaxReceipt(bookingId: booking.id, taxPaid: paid, taxPaidAt: paid ? ISO8601DateFormatter().string(from: Date()) : nil)
            } else {
                guard let connection else { throw ConnectionError.unauthorized }
                receipt = try await APITransport.shared.setTaxPaid(connection, booking: booking, paid: paid)
            }
            guard requestRevision == revision,
                  let index = dashboard?.bookings.firstIndex(where: { $0.id == booking.id }) else { return }
            dashboard?.bookings[index].taxPaid = receipt.taxPaid
            dashboard?.bookings[index].taxPaidAt = receipt.taxPaidAt
            if selectedBooking?.id == booking.id { selectedBooking = dashboard?.bookings[index] }
            error = nil
            if !demo, let dashboard {
                let encoder = JSONEncoder()
                encoder.keyEncodingStrategy = .convertToSnakeCase
                try SharedStore.cache(encoder.encode(dashboard))
                WidgetCenter.shared.reloadTimelines(ofKind: SharedStore.widgetKind)
            }
        } catch {
            guard requestRevision == revision else { return }
            if case ConnectionError.taxConflict = error {
                taxUpdatingIDs.remove(booking.id)
                await refresh()
            }
            self.error = error.localizedDescription
        }
    }

    func showDemo() {
        revision = UUID()
        cleanerDirectory = nil
        cleanersLoading = false
        cleanersSaving = false
        cleanersError = nil
        taxUpdatingIDs.removeAll()
        isLoading = false
        dashboard = .demo()
        demo = true
        error = nil
        tab = 0
    }

    func disconnect() {
        revision = UUID()
        cleanerDirectory = nil
        cleanersLoading = false
        cleanersSaving = false
        cleanersError = nil
        taxUpdatingIDs.removeAll()
        SharedStore.clear()
        dashboard = nil
        connection = nil
        selectedBooking = nil
        pendingBookingId = nil
        isLoading = false
        demo = false
        error = nil
        WidgetCenter.shared.reloadAllTimelines()
    }

    func open(_ url: URL) {
        guard url.scheme == "atrani" else { return }
        tab = 0
        if url.host == "calendar" {
            calendarDay = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "date" })?.value ?? RomeDate.key()
            tab = 1
        }
        if url.host == "booking" {
            pendingBookingId = url.lastPathComponent
            resolvePendingLink()
        }
    }

    private func resolvePendingLink() {
        if let id = pendingBookingId, let booking = dashboard?.bookings.first(where: { $0.id == id }) {
            selectedBooking = booking
            pendingBookingId = nil
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var store: BookingStore
    @Environment(\.scenePhase) private var phase
    @State private var wasBackgrounded = false
    var body: some View {
        Group {
            if store.dashboard == nil && store.connection == nil {
                NavigationStack { ConnectionView(onboarding: true) }
            } else {
                TabView(selection: $store.tab) {
                    NavigationStack { TodayView() }.tabItem { Label("Заезды", systemImage: "key.horizontal") }.tag(0)
                    NavigationStack { CalendarView() }.tabItem { Label("Календарь", systemImage: "calendar") }.tag(1)
                    NavigationStack { PropertiesView() }.tabItem { Label("Объекты", systemImage: "building.2") }.tag(2)
                    NavigationStack { CleaningsView() }.tabItem { Label("Уборки", systemImage: "sparkles") }.tag(3)
                    NavigationStack { ConnectionView() }.tabItem { Label("Настройки", systemImage: "gearshape") }.tag(4)
                }
            }
        }
        .sheet(item: $store.selectedBooking) { booking in
            NavigationStack { BookingDetailView(booking: booking) }.presentationDragIndicator(.visible)
        }
        .onChange(of: store.tab) { _, tab in
            if (0...2).contains(tab) { Task { await store.refresh() } }
        }
        .onChange(of: phase) { _, value in
            if value == .background { wasBackgrounded = true }
            if value == .active && wasBackgrounded {
                wasBackgrounded = false
                if !store.demo { Task {
                    await store.refresh()
                    if store.tab == 3 { await store.loadCleaners() }
                } }
            }
        }
    }
}
