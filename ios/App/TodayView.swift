import SwiftUI
import AudioToolbox

struct TodayView: View {
    @EnvironmentObject private var store: BookingStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var history = false
    @State private var pull: ArrivalPullAction = .none
    private let purple = Color(red: 0.34, green: 0.14, blue: 0.68)

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 0) {
                    hero.id("arrivals-top")
                    LazyVStack(alignment: .leading, spacing: 22) {
                        StatusBanner()
                        if let data = store.dashboard {
                            let days = history ? data.previousArrivalDays() : data.arrivalDays()
                            if days.isEmpty {
                                Text(history ? "Предыдущих заездов пока нет" : "Предстоящих заездов пока нет")
                                    .foregroundStyle(.secondary).padding(.vertical, 24)
                            }
                            ForEach(days) { day in
                                VStack(alignment: .leading, spacing: 12) {
                                    Text(RomeDate.label(day.id, template: day.id.prefix(4) == RomeDate.key().prefix(4) ? "d MMMM" : "d MMMM yyyy"))
                                        .font(.system(.title3, design: .rounded, weight: .bold))
                                        .accessibilityAddTraits(.isHeader).padding(.horizontal, 4)
                                    ForEach(day.bookings) { booking in
                                        ArrivalCard(booking: booking, property: data.propertyName(booking.propertyId))
                                    }
                                }
                            }
                        } else if store.isLoading { ProgressView("Загружаем заезды…") }
                    }.padding(20).frame(maxWidth: .infinity, alignment: .leading)
                        .background(Orbit.background)
                }
                .background(ArrivalPullObserver(onProgress: { distance in
                    let next = ArrivalPullAction.forDistance(distance)
                    if next != pull && next != .none { UISelectionFeedbackGenerator().selectionChanged() }
                    pull = next
                }, onRelease: { distance in
                    let action = ArrivalPullAction.forDistance(distance)
                    pull = .none
                    if action == .refresh { Task { await store.refresh() } }
                    if action == .history { toggleHistory() }
                }))
            }
            .background(alignment: .top) {
                Orbit.background.overlay(alignment: .top) { purple.frame(height: 100).ignoresSafeArea(edges: .top) }
            }
            .overlay(alignment: .top) {
                if pull != .none {
                    Label(pull == .refresh ? "Отпустите, чтобы обновить" : history ? "Отпустите — к заездам" : "Отпустите — предыдущие гости",
                          systemImage: pull == .refresh ? "arrow.clockwise" : "clock.arrow.circlepath")
                        .font(.caption.weight(.semibold)).padding(10)
                        .background(.ultraThinMaterial, in: Capsule()).padding(.top, 6)
                        .allowsHitTesting(false)
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .onChange(of: history) { _, _ in proxy.scrollTo("arrivals-top", anchor: .top) }
            .safeAreaInset(edge: .bottom, spacing: 0) { Color.clear.frame(height: 4) }
        }
    }

    private func toggleHistory() {
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        AudioServicesPlaySystemSound(1104)
        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.25)) { history.toggle() }
    }

    private var headerLayout: AnyLayout {
        dynamicTypeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 10)) : AnyLayout(HStackLayout(alignment: .center, spacing: 0))
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 22) {
            headerLayout {
                VStack(alignment: .leading, spacing: 8) {
                    Text(history ? "Гости" : "Заезды")
                        .font(.system(.largeTitle, design: .rounded, weight: .heavy))
                        .accessibilityAddTraits(.isHeader)
                    Text(history ? "Предыдущие 7 заездов" : "Ближайшие бронирования")
                        .font(.system(.subheadline, design: .rounded)).foregroundStyle(.white.opacity(0.75))
                }.frame(maxWidth: .infinity, alignment: .leading)
                GlassArrivalMark().frame(width: dynamicTypeSize.isAccessibilitySize ? 72 : 106, height: dynamicTypeSize.isAccessibilitySize ? 76 : 112).accessibilityHidden(true)
            }
            if !history, let data = store.dashboard, let next = data.upcoming().first {
                VStack(alignment: .leading, spacing: 9) {
                    Label("Ближайший заезд", systemImage: "arrow.down.right")
                        .font(.caption.weight(.medium)).foregroundStyle(.white.opacity(0.7))
                    Text(RomeDate.label(next.startDate, template: next.startDate.prefix(4) == RomeDate.key().prefix(4) ? "d MMMM, EEEE" : "d MMMM yyyy"))
                        .font(.system(.title3, design: .rounded, weight: .semibold))
                    HStack(spacing: 8) {
                        PropertyIcon(propertyId: next.propertyId, size: 18)
                        Text(data.propertyName(next.propertyId)).font(.system(.subheadline, design: .rounded, weight: .medium))
                        let others = data.arrivals(on: next.startDate).count - 1
                        if others > 0 { Text("+\(others)").font(.caption.bold()).padding(5).background(.white.opacity(0.15), in: Capsule()) }
                    }
                }
            }
            HStack(spacing: 12) {
                Button {
                    UIImpactFeedbackGenerator(style: .soft).impactOccurred()
                    AudioServicesPlaySystemSound(1104)
                    withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.25)) { history.toggle() }
                } label: {
                    Label(history ? "К предстоящим" : "Предыдущие гости", systemImage: history ? "arrow.up.right" : "clock.arrow.circlepath")
                        .font(.system(.subheadline, design: .rounded, weight: .medium))
                        .padding(.horizontal, 14).frame(minHeight: 44)
                        .background(.white.opacity(0.14), in: Capsule())
                }.buttonStyle(.plain).accessibilityIdentifier("arrival-history")
                Spacer(minLength: 0)
                Button { Task { await store.refresh() } } label: {
                    if store.isLoading { ProgressView().tint(.white).frame(width: 44, height: 44) }
                    else { Image(systemName: "arrow.clockwise").frame(width: 44, height: 44) }
                }.buttonStyle(.plain).accessibilityLabel("Обновить заезды").disabled(store.isLoading)
            }
        }.foregroundStyle(.white).padding(.horizontal, 24).padding(.top, 8).padding(.bottom, 24)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                LinearGradient(colors: [purple, Color(red: 0.43, green: 0.22, blue: 0.82)], startPoint: .top, endPoint: .bottom)
                    .clipShape(UnevenRoundedRectangle(bottomLeadingRadius: 30, bottomTrailingRadius: 30))
            }
    }
}

private struct GlassArrivalMark: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var phase
    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: reduceMotion || phase != .active)) { context in
            let progress = reduceMotion ? 0.5 : context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 7) / 7
            Image("ArrivalGlassMark").resizable().scaledToFit()
                .shadow(color: .purple.opacity(0.65), radius: 18)
                .overlay {
                    GeometryReader { geometry in
                        LinearGradient(colors: [.clear, .white.opacity(0.65), .clear], startPoint: .leading, endPoint: .trailing)
                            .frame(width: 28).rotationEffect(.degrees(25))
                            .offset(x: geometry.size.width * (progress * 2 - 0.5))
                    }.mask(Image("ArrivalGlassMark").resizable().scaledToFit())
                }
        }
    }
}

private struct ArrivalCard: View {
    @EnvironmentObject private var store: BookingStore
    let booking: Booking
    let property: String
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Button { store.selectedBooking = booking } label: {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(alignment: .center, spacing: 9) {
                        PropertyIcon(propertyId: booking.propertyId, size: 22)
                        Text(property).font(.system(.subheadline, design: .rounded, weight: .semibold))
                            .foregroundStyle(Orbit.subtitle).frame(maxWidth: .infinity, alignment: .leading)
                        PlatformIcon(booking: booking, size: 25)
                    }
                    Text(booking.guestLabel).font(.system(.title2, design: .rounded, weight: .regular))
                        .foregroundStyle(.primary).fixedSize(horizontal: false, vertical: true)
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 18) { stayMetadata }
                        VStack(alignment: .leading, spacing: 8) { stayMetadata }
                    }.font(.system(.subheadline, design: .rounded)).foregroundStyle(.secondary)
                }.frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
            }.buttonStyle(.plain)
            Divider().overlay(Orbit.violet.opacity(0.05))
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .center, spacing: 12) { dates; Spacer(minLength: 0); ArrivalTaxButton(booking: booking) }
                VStack(alignment: .leading, spacing: 10) { dates; ArrivalTaxButton(booking: booking) }
            }
        }.padding(18).frame(maxWidth: .infinity, alignment: .leading)
            .background(Orbit.calendarSurface, in: RoundedRectangle(cornerRadius: 24))
            .overlay(RoundedRectangle(cornerRadius: 24).strokeBorder(Orbit.violet.opacity(0.05)))
    }
    private var dates: some View {
        Button { store.selectedBooking = booking } label: {
            VStack(alignment: .leading, spacing: 4) {
                Text("\(RomeDate.label(booking.startDate)) — \(RomeDate.label(booking.endDate))")
                    .font(.system(.caption, design: .rounded, weight: .medium))
                Text(booking.startDate.prefix(4) == booking.endDate.prefix(4) ? String(booking.endDate.prefix(4)) : "\(booking.startDate.prefix(4)) — \(booking.endDate.prefix(4))")
                    .font(.caption2).foregroundStyle(.tertiary)
            }.foregroundStyle(.secondary).frame(minHeight: 44, alignment: .leading)
        }.buttonStyle(.plain)
    }
    @ViewBuilder private var stayMetadata: some View {
        Label(booking.nightsLabel, systemImage: "moon")
        Label(booking.guestsLabel, systemImage: "person.2")
    }
}

struct ArrivalTaxButton: View {
    @EnvironmentObject private var store: BookingStore
    @State private var confirm = false
    let booking: Booking
    private var busy: Bool { store.taxUpdatingIDs.contains(booking.id) }
    private var paid: Bool { booking.taxPaid == true }
    private var available: Bool { booking.taxApplicable == true && booking.taxPaid != nil }
    var body: some View {
        Button { confirm = true } label: {
            HStack(spacing: 7) {
                if busy { ProgressView().controlSize(.small) }
                else { Image(systemName: paid ? "checkmark.circle.fill" : "building.columns").font(.body) }
                VStack(alignment: .leading, spacing: 3) {
                    Text("Городской налог").font(.system(.caption2, design: .rounded, weight: .medium))
                    Text(available ? (paid ? "Оплачен" : booking.taxAmountLabel) : "Уточняется")
                        .font(.system(.caption, design: .rounded, weight: .semibold))
                }
            }.padding(.horizontal, 10).frame(minHeight: 44)
                .foregroundStyle(paid ? Orbit.mint : Orbit.violet)
                .background((paid ? Orbit.mint : Orbit.violet).opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
        }.buttonStyle(.plain).disabled(busy || !available)
            .accessibilityLabel("Городской налог, \(paid ? "оплачен" : booking.taxAmountLabel)")
            .accessibilityHint(available ? "Изменить отметку об оплате" : "Обновите данные или уточните бронирование")
            .confirmationDialog(paid ? "Снять отметку об оплате?" : "Городской налог получен?", isPresented: $confirm, titleVisibility: .visible) {
                Button(paid ? "Отметить неоплаченным" : "Отметить оплаченным", role: paid ? .destructive : nil) {
                    Task { await store.setTaxPaid(booking, paid: !paid) }
                }
                Button("Отмена", role: .cancel) {}
            } message: {
                Text("2,50 € × \(booking.nightsLabel) × \(booking.guestsLabel). \(booking.taxAmountLabel).")
            }
    }
}

/// Observe the existing scroll recognizer without replacing its delegate or stealing card taps.
private struct ArrivalPullObserver: UIViewRepresentable {
    var onProgress: (Double) -> Void
    var onRelease: (Double) -> Void
    func makeUIView(context: Context) -> UIView { ProbeView(coordinator: context.coordinator) }
    func updateUIView(_ view: UIView, context: Context) { context.coordinator.owner = self }
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    final class ProbeView: UIView {
        let coordinator: Coordinator
        init(coordinator: Coordinator) { self.coordinator = coordinator; super.init(frame: .zero); isUserInteractionEnabled = false }
        required init?(coder: NSCoder) { fatalError() }
        override func didMoveToWindow() {
            super.didMoveToWindow()
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                var parent = self.superview
                while let view = parent {
                    if let scroll = view as? UIScrollView { self.coordinator.attach(scroll); break }
                    parent = view.superview
                }
            }
        }
    }
    final class Coordinator: NSObject {
        var owner: ArrivalPullObserver
        weak var scroll: UIScrollView?
        var distance = 0.0
        init(_ owner: ArrivalPullObserver) { self.owner = owner }
        func attach(_ value: UIScrollView) {
            guard scroll !== value else { return }
            scroll?.panGestureRecognizer.removeTarget(self, action: #selector(pan))
            scroll = value
            value.alwaysBounceVertical = true
            value.panGestureRecognizer.addTarget(self, action: #selector(pan))
        }
        @objc func pan(_ gesture: UIPanGestureRecognizer) {
            guard let scroll else { return }
            switch gesture.state {
            case .began: distance = 0
            case .changed:
                distance = max(0, -scroll.contentOffset.y - scroll.adjustedContentInset.top)
                owner.onProgress(distance)
            case .ended: owner.onRelease(distance); distance = 0
            case .cancelled, .failed: owner.onProgress(0); distance = 0
            default: break
            }
        }
        deinit { scroll?.panGestureRecognizer.removeTarget(self, action: #selector(pan)) }
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
