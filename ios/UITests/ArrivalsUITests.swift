import XCTest

final class ArrivalsUITests: XCTestCase {
    func testHistoryPullAndTaxConfirmation() {
        let app = XCUIApplication()
        app.launchArguments = ["--demo"]
        app.launch()
        let history = app.buttons["arrival-history"]
        XCTAssertTrue(history.waitForExistence(timeout: 30))
        let headerShot = XCTAttachment(screenshot: app.screenshot())
        headerShot.name = "arrivals-header"; headerShot.lifetime = .keepAlways; add(headerShot)
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
        app.swipeUp()
        let unknownShot = XCTAttachment(screenshot: app.screenshot())
        unknownShot.name = "arrivals-unknown-tax"; unknownShot.lifetime = .keepAlways; add(unknownShot)
    }
    func testCleanerCreationAssignmentAndCopy() {
        let app = XCUIApplication()
        app.launchArguments = ["--demo"]
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["Уборки"].waitForExistence(timeout: 30))
        app.tabBars.buttons["Уборки"].tap()
        let name = app.textFields["new-cleaner-name"]
        XCTAssertTrue(name.waitForExistence(timeout: 10))
        name.tap(); name.typeText("Test Cleaner")
        app.buttons["Добавить уборщицу"].tap()
        XCTAssertTrue(app.navigationBars["Комнаты"].waitForExistence(timeout: 5))
        let orange = app.switches["assign-orange"]
        orange.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap()
        let enabled = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == '1'"), object: orange)
        XCTAssertEqual(XCTWaiter.wait(for: [enabled], timeout: 5), .completed)
        app.buttons["Сохранить"].tap()
        XCTAssertTrue(app.navigationBars["Уборки"].waitForExistence(timeout: 5))
        let row = app.buttons["Test Cleaner"]
        for _ in 0..<7 {
            if row.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(row.isHittable)
        row.tap()
        XCTAssertTrue(app.switches["assign-orange"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.switches["assign-orange"].value as? String, "1")
        app.buttons["Отмена"].tap()
        let copy = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "copy-cleaner-")).allElementsBoundByIndex.last!
        if !copy.isHittable { app.swipeUp() }
        copy.tap()
        XCTAssertTrue(app.buttons["Ссылка скопирована"].waitForExistence(timeout: 5))
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "cleaner-assignments"; shot.lifetime = .keepAlways; add(shot)
    }

}
