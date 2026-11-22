import SwiftUI

struct CalendarScrollRequest: Equatable {
    let id = UUID()
    let day: String
}

/// Scroll state stays here: moving by one day never rebuilds the parent or its snapshot.
struct CalendarTimelineGrid: View {
    let data: TimelineGrid
    let today: String
    let request: CalendarScrollRequest
    let onMonth: (String) -> Void
    let onBooking: (Booking) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .caption) private var dayWidth = 46.0
    @ScaledMetric(relativeTo: .caption) private var rowHeight = 52.0
    @ScaledMetric(relativeTo: .caption) private var propertyWidth = 128.0
    @State private var visibleDay: String?
    @State private var reportedMonth = ""
    @State private var collapsed = false
    private let headerHeight = 58.0
    private let iconWidth = 44.0
    private var gridHeight: CGFloat { headerHeight + CGFloat(data.rows.reduce(0) { $0 + $1.lanes }) * rowHeight }

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            propertyRail.zIndex(1)
            ScrollViewReader { proxy in
                ScrollView(.horizontal) {
                    LazyHStack(spacing: 0) {
                        ForEach(Array(data.days.enumerated()), id: \.element.id) { index, day in
                            dayColumn(index: index, day: day).id(day.id)
                        }
                    }.scrollTargetLayout()
                        .background(CalendarPanObserver { next in
                            guard next != collapsed else { return }
                            withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.24)) { collapsed = next }
                        })
                }
                .scrollPosition(id: $visibleDay, anchor: .leading)
                .frame(height: gridHeight)
                .background(Orbit.calendarSurface)
                .onAppear { proxy.scrollTo(request.day, anchor: .leading) }
                .onChange(of: request) { _, value in proxy.scrollTo(value.day, anchor: .leading) }
                .onChange(of: visibleDay) { _, day in
                    guard let day, String(day.prefix(7)) != reportedMonth else { return }
                    reportedMonth = String(day.prefix(7))
                    onMonth(day)
                }
            }
        }
    }

    private var propertyRail: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .trailing) {
                Text("АПАРТАМЕНТЫ").font(.system(size: 10, weight: .medium)).foregroundStyle(.secondary)
                    .frame(width: propertyWidth).opacity(collapsed ? 0 : 1)
                Image(systemName: "building.2").font(.caption).foregroundStyle(.secondary)
                    .frame(width: iconWidth).opacity(collapsed ? 1 : 0)
            }.frame(height: headerHeight).overlay(alignment: .bottom) { Divider() }
            ForEach(data.rows) { row in
                NavigationLink { PropertyDetailView(property: row.property) } label: {
                    ZStack(alignment: .trailing) {
                        Text(row.property.name).font(.caption.weight(.bold)).foregroundStyle(.primary)
                            .multilineTextAlignment(.leading)
                            .frame(width: propertyWidth - iconWidth - 12, alignment: .leading)
                            .padding(.leading, 12).padding(.trailing, iconWidth)
                            .offset(x: collapsed ? -24 : 0).opacity(collapsed ? 0 : 1)
                        PropertyIcon(propertyId: row.id, size: 18).frame(width: iconWidth)
                    }.frame(width: collapsed ? iconWidth : propertyWidth, height: CGFloat(row.lanes) * rowHeight, alignment: .trailing)
                        .clipped().contentShape(Rectangle())
                }.buttonStyle(.plain).accessibilityLabel(row.property.name)
                    .overlay(alignment: .bottom) { Divider() }
            }
        }.frame(width: collapsed ? iconWidth : propertyWidth).clipped()
            .background(Orbit.calendarSurface).overlay(alignment: .trailing) { Divider() }
    }

    private func dayColumn(index: Int, day: TimelineGrid.Day) -> some View {
        VStack(spacing: 0) {
            VStack(spacing: 4) {
                Text(day.weekday).font(.caption2).foregroundStyle(.secondary)
                Text(day.number).font(.system(.headline, design: .rounded, weight: .heavy))
                    .foregroundStyle(day.id == today ? Orbit.violet : .primary)
            }.frame(width: dayWidth, height: headerHeight)
                .background(day.id == today ? Orbit.violet.opacity(0.07) : .clear)
                .overlay(alignment: .bottom) { Divider() }
                .accessibilityElement(children: .ignore).accessibilityLabel(day.label)
            ForEach(data.rows) { row in
                ZStack(alignment: .topLeading) {
                    ForEach(row.cells[index]) { slice in
                        bookingSlice(slice)
                    }
                }.frame(width: dayWidth, height: CGFloat(row.lanes) * rowHeight)
                    .overlay(alignment: .bottom) { Divider() }
            }
        }.frame(width: dayWidth).overlay(alignment: .trailing) { Divider().opacity(0.6) }
    }

    private func bookingSlice(_ slice: TimelineGrid.Slice) -> some View {
        let leading = slice.startsHere ? 2.0 : 0
        let trailing = slice.endsHere ? 2.0 : 0
        return Button { onBooking(slice.booking) } label: {
            ZStack {
                UnevenRoundedRectangle(topLeadingRadius: slice.startsHere ? 8 : 0,
                    bottomLeadingRadius: slice.startsHere ? 8 : 0,
                    bottomTrailingRadius: slice.endsHere ? 8 : 0, topTrailingRadius: slice.endsHere ? 8 : 0)
                    .fill(Orbit.violet.opacity(0.14))
                if slice.showsSource { PlatformIcon(booking: slice.booking, size: 19) }
                else if slice.startsHere || slice.endsHere {
                    Image(systemName: slice.startsHere ? "arrow.down.right" : "arrow.up.right")
                        .font(.caption2).foregroundStyle(Orbit.violet)
                }
            }.frame(width: max(1, (slice.end - slice.start) * dayWidth - leading - trailing), height: rowHeight - 12)
                .frame(height: rowHeight).contentShape(Rectangle())
        }.buttonStyle(.plain)
            .offset(x: slice.start * dayWidth + leading, y: CGFloat(slice.lane) * rowHeight)
            .accessibilityLabel(slice.label)
    }
}

/// Observe the scroll view's existing pan recognizer. Adding a SwiftUI DragGesture
/// here would compete with the outer vertical scroll and pull-to-refresh.
private struct CalendarPanObserver: UIViewRepresentable {
    let onDirection: (Bool) -> Void
    func makeUIView(context: Context) -> PanObserverView { PanObserverView() }
    func updateUIView(_ view: PanObserverView, context: Context) { view.onDirection = onDirection }
    static func dismantleUIView(_ view: PanObserverView, coordinator: ()) { view.disconnect() }

    final class PanObserverView: UIView {
        var onDirection: ((Bool) -> Void)?
        private weak var pan: UIPanGestureRecognizer?
        private var direction = CalendarRailGesture()
        private var origin = CGPoint.zero
        override func didMoveToWindow() {
            super.didMoveToWindow()
            if window == nil { disconnect() }
            else { DispatchQueue.main.async { [weak self] in self?.connect() } }
        }
        override func layoutSubviews() { super.layoutSubviews(); connect() }
        private func connect() {
            guard pan == nil, window != nil else { return }
            var ancestor = superview
            while let view = ancestor {
                if let scroll = view as? UIScrollView {
                    pan = scroll.panGestureRecognizer
                    pan?.addTarget(self, action: #selector(didPan(_:)))
                    return
                }
                ancestor = view.superview
            }
        }
        func disconnect() {
            pan?.removeTarget(self, action: #selector(didPan(_:)))
            pan = nil
            direction.end()
        }
        @objc private func didPan(_ recognizer: UIPanGestureRecognizer) {
            switch recognizer.state {
            case .began:
                direction.end()
                origin = recognizer.location(in: window)
                let velocity = recognizer.velocity(in: window)
                if abs(velocity.x) > 60 && abs(velocity.x) > abs(velocity.y) * 1.2 {
                    onDirection?(velocity.x < 0)
                }
            case .changed:
                // UIScrollView resets translation while consuming a pan; window
                // locations remain stable even when the property rail changes width.
                let location = recognizer.location(in: window)
                if let collapsed = direction.update(x: location.x - origin.x, y: location.y - origin.y) {
                    onDirection?(collapsed)
                }
            case .ended, .cancelled, .failed: direction.end()
            default: break
            }
        }
    }
}
