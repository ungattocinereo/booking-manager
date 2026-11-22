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

    private var hero: some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 8) {
                Text(history ? "Гости" : "Заезды")
                    .font(.system(.largeTitle, design: .rounded, weight: .heavy))
                    .accessibilityAddTraits(.isHeader)
                if history {
                    Text("Предыдущие 7 заездов")
                        .font(.system(.subheadline, design: .rounded))
                        .foregroundStyle(.white.opacity(0.75))
                }
            }
            .frame(maxWidth: dynamicTypeSize.isAccessibilitySize ? .infinity : 180, alignment: .leading)
            .frame(maxWidth: .infinity, minHeight: dynamicTypeSize.isAccessibilitySize ? 220 : 190, alignment: .leading)
            .padding(.trailing, dynamicTypeSize.isAccessibilitySize ? 0 : 128)
            HStack(alignment: .center, spacing: 12) {
                Button { Task { await store.refresh() } } label: {
                    if store.isLoading { ProgressView().tint(.white).frame(width: 44, height: 44) }
                    else { Image(systemName: "arrow.clockwise").frame(width: 44, height: 44) }
                }.buttonStyle(.plain).accessibilityLabel("Обновить заезды").disabled(store.isLoading)
                Spacer(minLength: 0)
                Button { toggleHistory() } label: {
                    Label(history ? "К предстоящим" : "Предыдущие гости", systemImage: history ? "arrow.up.right" : "clock.arrow.circlepath")
                        .font(.system(.subheadline, design: .rounded, weight: .medium))
                        .padding(.horizontal, 16).padding(.vertical, 10).frame(minHeight: 44)
                        .background(purple.opacity(0.92), in: Capsule())
                        .overlay(Capsule().strokeBorder(.white.opacity(0.18), lineWidth: 0.75))
                }.buttonStyle(.plain).accessibilityIdentifier("arrival-history")
            }
        }.foregroundStyle(.white).padding(.horizontal, 24).padding(.top, 8).padding(.bottom, 24)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(alignment: .topTrailing) {
                GlassArrivalMark(animates: store.tab == 0)
                    .frame(width: dynamicTypeSize.isAccessibilitySize ? 190 : 280, height: 270)
                    .offset(x: 38, y: 0)
                    .opacity(dynamicTypeSize.isAccessibilitySize ? 0.25 : 1)
                    .accessibilityHidden(true)
            }
            .background {
                LinearGradient(colors: [purple, Color(red: 0.43, green: 0.19, blue: 0.77)], startPoint: .top, endPoint: .bottom)
            }
            .clipShape(UnevenRoundedRectangle(bottomLeadingRadius: 30, bottomTrailingRadius: 30))
    }
}

private struct GlassArrivalMark: View {
    let animates: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var phase
    @State private var visible = false

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: reduceMotion || phase != .active || !animates || !visible)) { context in
            let time = reduceMotion ? 0 : context.date.timeIntervalSinceReferenceDate
            let breath = sin(time * .pi / 5)
            let orbit = sin(time * .pi / 8)
            let glint = reduceMotion ? 0.5 : time.truncatingRemainder(dividingBy: 7) / 7
            ZStack {
                // Violet light and small drifting particles echo the background without flashing.
                Ellipse()
                    .fill(RadialGradient(colors: [Color(red: 0.72, green: 0.32, blue: 1).opacity(0.8), Color.purple.opacity(0.3), .clear], center: .center, startRadius: 4, endRadius: 130))
                    .frame(width: 310, height: 230).blur(radius: 15)
                    .scaleEffect(1 + breath * 0.07).offset(x: -8 + orbit * 12, y: 18)
                Ellipse().fill(Color(red: 0.67, green: 0.25, blue: 0.95).opacity(0.55))
                    .frame(width: 130, height: 90).blur(radius: 32)
                    .offset(x: 50, y: -20 + breath * 12)
                Ellipse()
                    .stroke(AngularGradient(colors: [.clear, .white.opacity(0.35), .purple.opacity(0.5), .clear, .clear], center: .center, angle: .degrees(time.truncatingRemainder(dividingBy: 40) * 9)), lineWidth: 1)
                    .frame(width: 255, height: 140).rotationEffect(.degrees(-28 + orbit * 5))
                    .blur(radius: 0.7).offset(x: -6, y: 12)
                ForEach(0..<11) { index in
                    let angle = Double(index) * 0.61
                    Circle().fill(.white.opacity(index.isMultiple(of: 3) ? 0.55 : 0.25))
                        .frame(width: index.isMultiple(of: 3) ? 3 : 1.5, height: index.isMultiple(of: 3) ? 3 : 1.5)
                        .shadow(color: .purple.opacity(0.7), radius: 4)
                        .offset(x: cos(angle) * 125 - 12, y: sin(angle) * 105 + orbit * 3)
                }
                Image("ArrivalGlassMark").resizable().scaledToFit()
                    .frame(width: 252, height: 236)
                    .shadow(color: .purple.opacity(0.5), radius: 18)
                    .overlay {
                        GeometryReader { geometry in
                            LinearGradient(colors: [.clear, .white.opacity(0.65), .clear], startPoint: .leading, endPoint: .trailing)
                                .frame(width: 32).rotationEffect(.degrees(25))
                                .offset(x: geometry.size.width * (glint * 2 - 0.5))
                        }.mask(Image("ArrivalGlassMark").resizable().scaledToFit())
                    }
                    .rotationEffect(.degrees(-9))
                    .rotation3DEffect(.degrees(orbit * 5), axis: (x: 0, y: 1, z: 0))
                    .offset(x: 12, y: 14 + breath * 3)
            }
        }
        .allowsHitTesting(false)
        .onAppear { visible = true }
        .onDisappear { visible = false }
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
            HStack(spacing: 9) {
                if busy { ProgressView().controlSize(.small) }
                else {
                    Image(systemName: paid ? "checkmark.circle.fill" : "building.columns")
                        .font(.system(.body, weight: .medium))
                }
                if let amount = booking.cityTax {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(amount.formatted(.currency(code: "EUR").precision(.fractionLength(0...2)).locale(Locale(identifier: "ru_RU"))))
                            .font(.system(.title3, design: .rounded, weight: .semibold)).monospacedDigit()
                        Text("City tax").font(.system(.caption2, design: .rounded, weight: .medium))
                            .opacity(0.7)
                    }
                }
            }.padding(.horizontal, 12).padding(.vertical, 6).frame(minWidth: 44, minHeight: 44)
                .foregroundStyle(paid ? Orbit.mint : Orbit.violet)
                .background((paid ? Orbit.mint : Orbit.violet).opacity(0.055), in: RoundedRectangle(cornerRadius: 14))
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
