import AppIntents
import WidgetKit
import Foundation

struct SelectArrivalDayIntent: AppIntent {
    static var title: LocalizedStringResource = "Показать заезды"
    static var openAppWhenRun = false
    @Parameter(title: "День") var offset: Int
    @Parameter(title: "Объект") var property: String
    @Parameter(title: "Страница") var page: Int
    init() {}
    init(offset: Int, property: String, page: Int = 0) {
        self.offset = offset; self.property = property; self.page = page
    }
    func perform() async throws -> some IntentResult {
        let defaults = UserDefaults(suiteName: SharedStore.group)
        defaults?.set(min(1, max(0, offset)), forKey: "arrival-day-" + property)
        defaults?.set(max(0, page), forKey: "arrival-page-" + property)
        defaults?.set(Date().timeIntervalSince1970, forKey: "arrival-interaction-at")
        WidgetCenter.shared.reloadTimelines(ofKind: SharedStore.widgetKind)
        return .result()
    }
}
