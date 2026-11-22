import XCTest

final class ArrivalsUITests: XCTestCase {
    func testHistoryPullAndTaxConfirmation() {
        let app = XCUIApplication()
        app.launchArguments = ["--demo"]
        app.launch()
        let history = app.buttons["arrival-history"]
        XCTAssertTrue(history.waitForExistence(timeout: 30))
        // A short pull changes the list, without invoking a refresh.
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.22))
            .press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.44)), withVelocity: .slow, thenHoldForDuration: 0.2)
        XCTAssertTrue(app.staticTexts["Гости"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Предыдущие 7 заездов"].exists)
        let historyShot = XCTAttachment(screenshot: app.screenshot())
        historyShot.name = "arrivals-history"; historyShot.lifetime = .keepAlways; add(historyShot)
        history.tap()
        XCTAssertTrue(app.staticTexts["Sofia Moretti"].waitForExistence(timeout: 5))
        // A deeper pull refreshes instead of switching to history.
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.22))
            .press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.85)), withVelocity: .slow, thenHoldForDuration: 0.2)
        XCTAssertFalse(app.staticTexts["Гости"].exists)
        let tax = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Городской налог,")).firstMatch
        tax.tap()
        app.buttons["Отметить оплаченным"].tap()
        XCTAssertTrue(app.buttons["Городской налог, оплачен"].waitForExistence(timeout: 5))
        let paidShot = XCTAttachment(screenshot: app.screenshot())
        paidShot.name = "arrivals-paid"; paidShot.lifetime = .keepAlways; add(paidShot)
        app.buttons["Городской налог, оплачен"].tap()
        app.buttons["Отметить неоплаченным"].tap()
        let unpaid = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: app.buttons["Городской налог, оплачен"])
        XCTAssertEqual(XCTWaiter.wait(for: [unpaid], timeout: 5), .completed)
    }
}
