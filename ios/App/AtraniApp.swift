import SwiftUI
import WidgetKit

@main
struct AtraniApp: App {
    @StateObject private var store = BookingStore()
    var body: some Scene {
        WindowGroup {
            RootView().environmentObject(store).tint(Orbit.violet)
                .task { await store.start() }
                .onOpenURL { store.open($0) }
        }
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
    private var revision = UUID()
    private var pendingBookingId: String?

    func start() async {
        #if DEBUG && targetEnvironment(simulator)
        let arguments = ProcessInfo.processInfo.arguments
        if arguments.contains("--demo") { showDemo(); return }
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
        guard !isLoading, let settings = candidate ?? connection else { return }
        let requestRevision = revision
        isLoading = true
        defer { if requestRevision == revision { isLoading = false } }
        do {
            let (result, raw) = try await APITransport.shared.load(settings)
            guard requestRevision == revision else { return }
            if candidate != nil {
                try SharedStore.save(settings)
                connection = settings
            }
            try SharedStore.cache(raw)
            dashboard = result
            demo = false
            error = nil
            resolvePendingLink()
            WidgetCenter.shared.reloadTimelines(ofKind: SharedStore.widgetKind)
        } catch {
            guard requestRevision == revision else { return }
            self.error = error.localizedDescription
        }
    }

    func showDemo() {
        revision = UUID()
        isLoading = false
        dashboard = .demo()
        demo = true
        error = nil
        tab = 0
    }

    func disconnect() {
        revision = UUID()
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
    var body: some View {
        Group {
            if store.dashboard == nil && store.connection == nil {
                NavigationStack { ConnectionView(onboarding: true) }
            } else {
                TabView(selection: $store.tab) {
                    NavigationStack { TodayView() }.tabItem { Label("Сегодня", systemImage: "sun.max") }.tag(0)
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
        .onChange(of: phase) { _, value in
            if value == .active && !store.demo { Task { await store.refresh() } }
        }
    }
}
