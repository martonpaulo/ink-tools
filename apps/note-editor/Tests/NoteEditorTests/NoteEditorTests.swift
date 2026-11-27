import Foundation
import NoteEditorKit
import Testing

@testable import NoteEditor
@testable import NoteFormat

/// The app's edits of a note from the tablet (#313, #314, #330): a page move drawn at once, sent
/// through the real write path (SHA-256 bases, `NoteWriter.movePage`, `NoteDiff`) to the fake
/// tablet of the write path's tests, Undo and Redo, a refusal taken back, and Revert to Backup.
@MainActor
@Suite final class NoteEditorTests {
    let folder: URL
    let copy: URL
    let original: Data
    let tablet: WritePathTests.FakeTablet

    init() throws {
        folder = try WritePathTests.makeFolder("note-editor-tests")
        copy = folder.appending(path: "Edit.note")
        original = try Fixtures.data("content.note")
        try original.write(to: copy)
        tablet = WritePathTests.FakeTablet(bytes: original)
    }

    deinit {
        try? FileManager.default.removeItem(at: folder)
    }

    func editor() throws -> NoteEditor {
        NoteEditor(
            tabletPath: WritePathTests.note, copy: copy, base: try NoteFile(data: original), tablet: tablet,
            backups: NoteBackups(folder: folder.appending(path: "Backups")))
    }

    static func ids(_ note: NoteFile) -> [String] { note.pages.map { $0.metadata["PAGEID"] ?? "" } }

    static func ids(_ data: Data) throws -> [String] { ids(try NoteFile(data: data)) }

    /// Waits until every edit has its answer, at most two seconds.
    func settle(_ editor: NoteEditor) async {
        for _ in 0..<200 where !editor.pending.isEmpty || editor.restoring {
            // timing-independent: a poll on the condition with a deadline; the assertion below fails a hang.
            try? await Task.sleep(for: .milliseconds(10))
        }
        #expect(editor.pending.isEmpty)
    }

    /// Undo puts the note back as the backup kept before the edit: Revert to Backup's route.
    func expectUndoneByBackup(_ editor: NoteEditor) async {
        editor.undo()
        await settle(editor)
        #expect(tablet.bytes == original)
        #expect(tablet.calls.suffix(3) == ["edit openNote", "push", "pull"])
    }

    @Test(arguments: [(0, 3), (3, 0), (1, 2)])
    func aMoveIsDrawnAtOnceAndTheTabletGetsTheSameOrder(from: Int, to: Int) async throws {
        let editor = try editor()
        let before = Self.ids(editor.shown)
        let expected = NoteEdit.movePage(from: from, to: to).apply(to: before)
        #expect(editor.movePage(from: from, to: to))
        // Drawn before the tablet answers.
        #expect(Self.ids(editor.shown) == expected)
        #expect(editor.pending.count == 1)
        await settle(editor)
        #expect(try Self.ids(tablet.bytes) == expected)
        #expect(Self.ids(editor.base) == expected)
        #expect(editor.history.undoKind == .movePage(from: from, to: to))
        // The first send after the queue was idle reads the tablet's note first (#317).
        #expect(tablet.calls == ["pull", "edit openNote", "push", "pull"])
    }

    @Test func aMoveToItsOwnPlaceRecordsAndSendsNothing() throws {
        let editor = try editor()
        #expect(!editor.movePage(from: 2, to: 2))
        #expect(!editor.movePage(from: 0, to: 9))
        #expect(editor.pending.isEmpty && editor.history.undoKind == nil)
        #expect(tablet.calls.isEmpty)
    }

    @Test func undoAndRedoGiveTheTabletEachOrderBack() async throws {
        let editor = try editor()
        let before = Self.ids(editor.shown)
        editor.movePage(from: 0, to: 2)
        // Undone before it is sent or after: either way the tablet ends with the old order.
        editor.undo()
        await settle(editor)
        #expect(Self.ids(editor.shown) == before)
        #expect(try Self.ids(tablet.bytes) == before)
        #expect(editor.history.redoKind == .movePage(from: 0, to: 2))
        editor.redo()
        await settle(editor)
        #expect(try Self.ids(tablet.bytes) == NoteEdit.movePage(from: 0, to: 2).apply(to: before))
        #expect(editor.history.redoKind == nil)
    }

    @Test func aRefusedMoveIsTakenBackWithItsMessageAndTheFirstStays() async throws {
        let editor = try editor()
        let before = Self.ids(editor.shown)
        editor.movePage(from: 0, to: 1)
        await settle(editor)
        let first = NoteEdit.movePage(from: 0, to: 1).apply(to: before)
        // The note is open on the tablet now, so the Mac may not write the next move.
        tablet.openNote = WritePathTests.note
        editor.movePage(from: 2, to: 3)
        #expect(Self.ids(editor.shown) != first)
        await settle(editor)
        #expect(Self.ids(editor.shown) == first)
        #expect(try Self.ids(tablet.bytes) == first)
        #expect(editor.refusal == WriteFailure.openOnTablet.message)
        #expect(editor.history.undoKind == .movePage(from: 0, to: 1))
    }

    /// The tablet's own add or delete of a page, as the helper applies it.
    func tabletApplies(_ edit: @escaping @Sendable (NoteFile) throws -> NoteFile) {
        tablet.onEdit = Self.applying(edit)
    }

    /// Built outside the main actor, as the tablet calls it from the sender's.
    nonisolated static func applying(_ edit: @escaping @Sendable (NoteFile) throws -> NoteFile) -> (Data) -> Data {
        { data in (try? NoteFile(data: data)).flatMap { try? edit($0) }.map { Data($0.bytes) } ?? data }
    }

    @Test func anAddedPageIsDrawnAtOnceOnItsTemplateAndUndoneByItsRemoval() async throws {
        let editor = try editor()
        let before = Self.ids(editor.shown)
        let template = try #require(editor.noteTemplates.first?.value)
        tabletApplies { @Sendable in try NotePreview.insertingPage($0, at: 1, like: 0) }
        #expect(editor.insertPage(at: 1, template: template))
        #expect(editor.shown.pages.count == before.count + 1)
        #expect(editor.shown.pages[1].style.flatMap(PageTemplate.systemName(ofStyle:)) == template)
        await settle(editor)
        #expect(try NoteFile(data: tablet.bytes).pages.count == before.count + 1)
        #expect(tablet.sent.first?["op"] as? String == "insertPage")
        // The tablet takes the system name: the page's own style, with its screen suffix, is refused.
        #expect(tablet.sent.first?["template"] as? String == template)
        #expect(editor.shown.pages[0].style?.hasSuffix("_a5x2") == true && !template.hasSuffix("_a5x2"))
        tabletApplies { @Sendable in try NotePreview.removingPage($0, at: 1) }
        editor.undo()
        await settle(editor)
        #expect(try Self.ids(tablet.bytes) == before)
        #expect(tablet.sent.last?["op"] as? String == "removePage")
    }

    @Test func theSheetOffersTheTabletsTemplatesThePageInFrontsFirst() async throws {
        let editor = try editor()
        tablet.templateList = [
            .system("style_white"), .system("style_5mm_grid"), .system("style_8mm_lines"),
            .custom(name: "week", path: "/storage/emulated/0/MyStyle/week.png"),
        ]
        // Page 2 of the fixture is on the 5 mm grid (#451).
        await editor.loadTemplates(nextTo: 1)
        #expect(
            editor.templateList.choices.map(\.value) == [
                "style_5mm_grid", "style_white", "style_8mm_lines", "/storage/emulated/0/MyStyle/week.png",
            ])
        #expect(tablet.calls.last == "templates")
        if case .tablet = editor.templateList {} else { Issue.record("not the tablet's list: \(editor.templateList)") }
    }

    @Test func theSheetFallsBackToTheNotesTemplatesWhenTheTabletDoesNotAnswer() async throws {
        let editor = try editor()
        tablet.failTemplates = .notConnected("No tablet answered.")
        await editor.loadTemplates(nextTo: 2)
        #expect(
            editor.templateList
                == .noteOnly(
                    ["style_8mm_ruled_line", "style_white", "style_5mm_grid", "style_5mm_dots"]
                        .map(PageTemplateChoice.system),
                    reason: "No tablet answered."))
    }

    @Test func aSheetThatOpensAgainStartsLoadingAndAClosedSheetsReadLeavesNoFailure() async throws {
        let editor = try editor()
        await editor.loadTemplates(nextTo: 0)
        #expect(editor.templateList != .loading)
        editor.insertNextTo = 0
        #expect(editor.templateList == .loading)
        tablet.failTemplates = .cancelled
        await editor.loadTemplates(nextTo: 0)
        #expect(editor.templateList == .loading)
    }

    @Test(arguments: ["style_8mm_lines", "/storage/emulated/0/MyStyle/week.png"])
    func aPageOnATemplateNoPageUsesIsSentByItsValueAndDrawnBlank(template: String) async throws {
        let editor = try editor()
        tabletApplies { @Sendable in try NotePreview.insertingPage($0, at: 1, like: 0) }
        #expect(editor.insertPage(at: 1, template: template))
        // Drawn at once with no template: the Mac has no picture of it (#451).
        #expect(!(try editor.shown.render(page: 1)).pixels.contains { $0 < 250 })
        await settle(editor)
        #expect(tablet.sent.first?["template"] as? String == template)
    }

    @Test func aDeletedPageComesBackWithItsInkByItsBackup() async throws {
        let editor = try editor()
        tabletApplies { @Sendable in try NotePreview.removingPage($0, at: 0) }
        #expect(editor.removePages(at: [0]))
        #expect(editor.shown.pages.count == 3)
        await settle(editor)
        #expect(try NoteFile(data: tablet.bytes).pages.count == 3)
        editor.undo()
        // Drawn at once from the backup, then pushed back by the Mac's route.
        #expect(editor.shown.pages.count == 4)
        await settle(editor)
        #expect(tablet.bytes == original)
        #expect(tablet.calls.suffix(3) == ["edit openNote", "push", "pull"])
        #expect(editor.history.redoKind == .removePages(at: [0]))
    }

    /// Two pages deleted at once (#329): drawn at once, one request of two removals, highest first,
    /// and one Undo puts both back with their ink by the backup kept before the send.
    @Test func severalPagesAreDeletedAtOnceAndOneUndoPutsThemBack() async throws {
        let editor = try editor()
        let before = Self.ids(editor.shown)
        tabletApplies { @Sendable in try NotePreview.removingPage(NotePreview.removingPage($0, at: 3), at: 1) }
        #expect(editor.removePages(at: [1, 3]))
        #expect(Self.ids(editor.shown) == [before[0], before[2]])
        await settle(editor)
        #expect(try Self.ids(tablet.bytes) == [before[0], before[2]])
        let removals = tablet.sent.filter { $0["op"] as? String == "removePage" }
        #expect(removals.compactMap { $0["page"] as? Int } == [3, 1])
        #expect(Copy.name(of: try #require(editor.history.undoKind)) == "Delete Pages")
        editor.undo()
        #expect(editor.shown.pages.count == before.count)
        await settle(editor)
        #expect(tablet.bytes == original)
        #expect(editor.history.redoKind == .removePages(at: [1, 3]))
    }

    @Test func everyPageAtOnceIsNeverDeleted() throws {
        let editor = try editor()
        #expect(!editor.canRemove(editor.pageCount))
        editor.askRemoval(of: Array(0..<editor.pageCount))
        #expect(editor.removalAsked == nil)
        #expect(!editor.removePages(at: Array(0..<editor.pageCount)))
        #expect(editor.pending.isEmpty && tablet.calls.isEmpty)
        editor.askRemoval(of: [0, 2])
        #expect(editor.removalAsked == [0, 2])
    }

    @Test func theLastPageIsNeverDeleted() async throws {
        let editor = try editor()
        tabletApplies { @Sendable in try NotePreview.removingPage($0, at: 0) }
        for _ in 0..<3 {
            #expect(editor.removePages(at: [0]))
            await settle(editor)
        }
        #expect(!editor.canRemovePage)
        #expect(!editor.removePages(at: [0]))
        #expect(editor.pending.isEmpty && editor.shown.pages.count == 1)
    }

    /// The selection of page 1 of `content.note`: its text box and its picture.
    func selection() throws -> [MovedElement] {
        try NoteFile(data: original).elements(page: 0).map { element in
            MovedElement(
                record: element.record, box: EditRect(element.bounds), points: element.points,
                isArea: element.kind != .stroke)
        }
    }

    @Test func aDraggedSelectionIsDrawnAtOnceAndSentAsOneModify() async throws {
        let editor = try editor()
        tabletApplies { @Sendable in $0 }
        let elements = try selection()
        let move = ElementMove(page: 0, elements: elements, dx: 120, dy: -40)
        // The drag lifted the selection's ink: its pixels under the selection, none elsewhere.
        let lifted = try #require(
            await LiftedInk.make(try NoteFile(data: original), page: 0, items: elements.map(\.selectable)))
        #expect(lifted.frame.contains(CGRect(x: 760, y: 1130, width: 300, height: 200)))
        #expect(editor.moveElements(move, lifted: lifted))
        // Drawn from the lifted ink before the tablet answers.
        #expect(
            editor.liftedChanges(on: 0).map(\.matrix) == [PageMatrix(a: 1, b: 0, c: 0, d: 1, tx: 120, ty: -40)])
        await settle(editor)
        let sent = tablet.sent.filter { $0["op"] as? String == "modifyElements" }
        #expect(sent.count == elements.count)
        #expect(sent.compactMap { $0["num"] as? Int } == elements.map { $0.record + 1 })
        #expect(editor.history.undoKind == .moveElements(move))
        #expect(editor.movedPage == 0)
    }

    /// The picture of page 1 of `content.note`, as a selection names it.
    func picture() throws -> MovedElement {
        let element = try #require(try NoteFile(data: original).elements(page: 0).first { $0.kind == .picture })
        return MovedElement(
            record: element.record, box: EditRect(element.bounds), points: element.points, isPicture: true)
    }

    @Test func aTurnedPictureIsSentAsANewFileAndNoChangeOfItsPageStartsMeanwhile() async throws {
        let editor = try editor()
        let folder = try WritePathTests.makeFolder("transformed-pictures")
        defer { try? FileManager.default.removeItem(at: folder) }
        editor.pictureFolder = { folder }
        tabletApplies { @Sendable in $0 }
        let picture = try picture()
        #expect(
            await editor.transform([picture.selectable], page: 0) {
                .quarterTurn(page: 0, elements: $0, clockwise: true)
            })
        // The tablet renumbers the page's elements as it replaces the picture: nothing waits on it.
        #expect(!editor.moveElements(ElementMove(page: 0, elements: [picture], dx: 5, dy: 5)))
        #expect(editor.refusal == Copy.refusal(.pictureOnItsWay))
        await settle(editor)
        let sent = tablet.sent.filter { $0["op"] as? String == "modifyElements" }
        #expect(sent.count == 1 && sent.first?["num"] as? Int == picture.record + 1)
        let file = try #require(sent.first?["file"] as? String)
        #expect(file.hasPrefix(folder.path(percentEncoded: false)) && file.hasSuffix(".png"))
        #expect(editor.movedPage == nil)
    }

    @Test func aDraggedPictureMovesAsANewFileDrawnFromTheDragsInk() async throws {
        let editor = try editor()
        let folder = try WritePathTests.makeFolder("moved-pictures")
        defer { try? FileManager.default.removeItem(at: folder) }
        editor.pictureFolder = { folder }
        tabletApplies { @Sendable in $0 }
        let picture = try picture()
        let lifted = try #require(
            await LiftedInk.make(try NoteFile(data: original), page: 0, items: [picture.selectable]))
        #expect(editor.moveElements(ElementMove(page: 0, elements: [picture], dx: 40, dy: 60), lifted: lifted))
        for _ in 0..<6000 where editor.pending.isEmpty {
            // timing-independent: a poll on the picture's file with a deadline.
            try? await Task.sleep(for: .milliseconds(10))
        }
        #expect(editor.liftedChanges(on: 0).first?.lifted.frame == lifted.frame)
        await settle(editor)
        let sent = try #require(tablet.sent.first { $0["op"] as? String == "modifyElements" })
        #expect((sent["file"] as? String)?.hasPrefix(folder.path(percentEncoded: false)) == true)
        #expect((sent["rect"] as? [String: Int])?["left"] == picture.box.left + 40)
    }

    @Test func makeLargerGrowsTheSelectionAboutItsCentreAndTheMenuHoldsOnlyTurns() throws {
        let elements = try selection()
        let larger = SelectionChange.makeLarger.transform(page: 0, elements: elements)
        let before = larger.frame
        #expect(abs(larger.transformedFrame.width - before.width * SelectionChange.step) < 1e-6)
        #expect(abs(larger.transformedFrame.midX - before.midX) < 1e-6)
        let smaller = SelectionChange.makeSmaller.transform(page: 0, elements: larger.transformed)
        #expect(abs(smaller.transformedFrame.width - before.width) < 1)
        // The selection holds a text box: VoiceOver and Tools offer it no turn.
        #expect(!SelectionChange.turns(elements.map(\.selectable)))
        #expect(SelectionChange.menu.allSatisfy(\.turns) && !SelectionChange.makeLarger.turns)
    }

    @Test func aTextBoxIsNeverTurnedAndTheBarSaysWhy() async throws {
        let editor = try editor()
        let elements = try selection()
        let turned = await editor.transform(elements.map(\.selectable), page: 0) {
            .flip(page: 0, elements: $0, horizontal: true)
        }
        #expect(!turned && editor.refusal == Copy.refusal(.textBoxTurned) && editor.pending.isEmpty)
    }

    @Test func tenNudgesAreOneRequestAndOneUndo() async throws {
        let editor = try editor()
        tabletApplies { @Sendable in $0 }
        let elements = try selection()
        for _ in 0..<10 { editor.nudge(elements, page: 0, dx: 0, dy: 4) }
        #expect(editor.pending.count == 1 && editor.history.undoKind == nil)
        editor.endNudges()
        await settle(editor)
        #expect(
            tablet.calls.filter { $0.hasPrefix("edit") } == [
                "edit " + elements.map { _ in "modifyElements" }.joined(separator: ",")
            ])
        let rects = tablet.sent.compactMap { $0["rect"] as? [String: Int] }
        #expect(rects.first?["top"] == elements[0].box.top + 40)
        #expect(editor.history.undoKind == .moveElements(ElementMove(page: 0, elements: elements, dx: 0, dy: 40)))
        editor.undo()
        await settle(editor)
        #expect(
            tablet.sent.suffix(elements.count).compactMap { ($0["rect"] as? [String: Int])?["top"] }
                == elements.map(\.box.top))
    }

    @Test func aRefusedMoveLeavesTheSelectionInPlaceAndSaysWhy() async throws {
        let editor = try editor()
        tablet.failEdit = .failed("device-link edit: no-element: operation 1")
        #expect(editor.moveElements(ElementMove(page: 0, elements: try selection(), dx: 10, dy: 10)))
        await settle(editor)
        #expect(editor.liftedChanges(on: 0).isEmpty && editor.history.undoKind == nil)
        #expect(editor.refusal?.contains("no-element") == true)
    }

    @Test func anInsertedPictureIsDrawnAtOnceSentAsAnElementAndUndoneByItsBackup() async throws {
        let editor = try editor()
        tabletApplies { @Sendable in $0 }
        let picture = try PictureImport.make(try PictureImportTests.colourImage(), folder: folder)
        let rect = EditRect(left: 100, top: 100, right: 500, bottom: 300)
        #expect(editor.insertPicture(page: 1, file: picture.file, rect: rect, image: picture.image))
        #expect(editor.insertions(on: 1).map(\.rect) == [rect])
        await settle(editor)
        let sent = try #require(tablet.sent.first { $0["op"] as? String == "insertElements" })
        let element = try #require((sent["elements"] as? [[String: Any]])?.first)
        #expect(
            element["kind"] as? String == "picture"
                && element["file"] as? String == picture.file.path(percentEncoded: false))
        #expect(
            editor.insertions(on: 1).isEmpty
                && editor.history.undoKind == .insertPicture(page: 1, file: picture.file, rect: rect))
        await expectUndoneByBackup(editor)
    }

    @Test func pastedTextIsOneTextBoxInTheMiddleOfThePageInBlack() async throws {
        let editor = try editor()
        tabletApplies { @Sendable in $0 }
        #expect(editor.pasteText("Plan\nBuy paper", page: 0))
        await settle(editor)
        let sent = try #require(tablet.sent.first { $0["op"] as? String == "insertElements" })
        let element = try #require((sent["elements"] as? [[String: Any]])?.first)
        #expect(element["kind"] as? String == "text" && element["text"] as? String == "Plan\nBuy paper")
        #expect(element["fontSize"] as? Int == InsertSheet.defaultFontSize)
        // No colour travels with a text box: the tablet sets it in black.
        #expect(element.keys.sorted() == ["fontSize", "kind", "rect", "text"])
        let rect = try #require(element["rect"] as? [String: Int])
        let page = editor.pageSize(0)
        #expect(((rect["left"] ?? 0) + (rect["right"] ?? 0)) / 2 == page.width / 2)
    }

    @Test func aRefusedInsertLeavesThePageAndSaysWhy() async throws {
        let editor = try editor()
        tablet.failEdit = .failed("device-link edit: tablet-refused: operation 1")
        #expect(
            editor.insertText(
                page: 0, text: "Hello", rect: EditRect(left: 0, top: 0, right: 600, bottom: 60), fontSize: 40))
        await settle(editor)
        #expect(editor.insertions(on: 0).isEmpty && editor.history.undoKind == nil)
        #expect(editor.refusal?.contains("tablet-refused") == true)
    }

    /// The fixture's text box on page 0, as the selection names it.
    func textBox() throws -> (item: Selectable, text: String, fontSize: Double) {
        let element = try #require(try NoteFile(data: original).elements(page: 0).first { $0.kind == .textBox })
        guard case .textBox(let text, let fontSize) = element.content else { throw NoteFormatError.badPage(0) }
        let item = Selectable(
            id: 0, bounds: element.bounds, points: element.points, isArea: true, record: element.record)
        return (item, text, fontSize)
    }

    @Test func aTextBoxMadeOnTheTabletOpensWithItsTextAndFontSize() throws {
        let editor = try editor()
        let box = try textBox()
        let request = try #require(editor.textBoxRequest([box.item], page: 0))
        guard case .editText(let element, let text, let fontSize) = request.content else {
            Issue.record("not a text box edit")
            return
        }
        #expect(text == box.text && fontSize == Int(box.fontSize.rounded()))
        #expect(element.record == box.item.record && element.box == EditRect(box.item.bounds))
        // Two elements, a picture or a stroke open nothing.
        #expect(editor.textBoxRequest([box.item, box.item], page: 0) == nil)
        let picture = try picture()
        #expect(editor.textBoxRequest([picture.selectable], page: 0) == nil)
    }

    @Test func anEditedTextBoxIsDrawnAtOnceSentAsOneModifyAndUndoneByItsBackup() async throws {
        let editor = try editor()
        tabletApplies { @Sendable in $0 }
        let box = try textBox()
        let element = MovedElement(box.item)
        #expect(editor.editText(page: 0, element: element, text: "New\nsecond line", fontSize: 48))
        let shown = try #require(editor.insertions(on: 0).first?.rect)
        // Its place and width kept, two lines high at the new size.
        #expect(shown.left == element.box.left && shown.right == element.box.right && shown.top == element.box.top)
        #expect(shown.bottom - shown.top == 144)
        await settle(editor)
        let sent = try #require(tablet.sent.first { $0["op"] as? String == "modifyElements" })
        #expect(sent["num"] as? Int == element.record + 1)
        #expect(sent["text"] as? String == "New\nsecond line" && sent["fontSize"] as? Int == 48)
        #expect(sent["file"] == nil)
        #expect(
            editor.history.undoKind
                == .editText(page: 0, element: element, text: "New\nsecond line", fontSize: 48, rect: shown))
        await expectUndoneByBackup(editor)
    }

    @Test func aTextBoxReopenedWhileItsEditIsOnItsWayShowsTheNewText() throws {
        let editor = NoteEditor(
            tabletPath: WritePathTests.note, copy: copy, base: try NoteFile(data: original),
            tablet: RenderTests.SlowTablet(pullWaits: true),
            backups: NoteBackups(folder: folder.appending(path: "Backups")))
        let box = try textBox()
        #expect(editor.editText(page: 0, element: MovedElement(box.item), text: "Newer", fontSize: 60))
        let rect = try #require(editor.insertions(on: 0).first?.rect)
        let request = try #require(editor.textBoxRequest([box.item], page: 0))
        guard case .editText(let element, let text, let fontSize) = request.content else {
            Issue.record("not a text box edit")
            return
        }
        #expect(text == "Newer" && fontSize == 60 && element.box == rect && element.record == box.item.record)
    }

    @Test func aLongLineWrapsToMoreLinesInANarrowBox() {
        let line = String(repeating: "word ", count: 40)
        #expect(TextPreview.lines(line, width: 400, fontSize: 40) > 1)
        #expect(TextPreview.lines("One\nTwo", width: 1200, fontSize: 40) == 2)
        #expect(TextPreview.lines("", width: 1200, fontSize: 40) == 1)
    }

    @Test func aBlankTextBoxIsNeverSent() throws {
        let editor = try editor()
        let element = MovedElement(try textBox().item)
        #expect(!editor.editText(page: 0, element: element, text: " \n ", fontSize: 40))
        #expect(editor.pending.isEmpty)
    }

    @Test func aDeletedSelectionIsDrawnAtOnceAsItsTemplate() async throws {
        let editor = NoteEditor(
            tabletPath: WritePathTests.note, copy: copy, base: try NoteFile(data: original),
            tablet: RenderTests.SlowTablet(),
            backups: NoteBackups(folder: folder.appending(path: "Backups")))
        #expect(editor.deleteElements(page: 0, elements: try selection()))
        for _ in 0..<500 where editor.deletions(on: 0).isEmpty {
            // timing-independent: a poll on the lift with a deadline; the expectation fails a hang.
            try? await Task.sleep(for: .milliseconds(10))
        }
        #expect(editor.deletions(on: 0).count == 1)
        #expect(editor.history.undoKind == .deleteElements(page: 0, elements: try selection()))
    }

    @Test func aDeleteIsSentByNumberAndUndoneByItsBackup() async throws {
        let editor = try editor()
        tabletApplies { @Sendable in $0 }
        let elements = try selection()
        #expect(editor.deleteElements(page: 0, elements: elements))
        await settle(editor)
        let sent = try #require(tablet.sent.first { $0["op"] as? String == "deleteElements" })
        #expect(sent["nums"] as? [Int] == elements.map { $0.record + 1 })
        await expectUndoneByBackup(editor)
        #expect(editor.history.redoKind == .deleteElements(page: 0, elements: elements))
    }

    @Test func aDeleteUndoneBeforeItIsSentSendsNothing() async throws {
        let editor = try editor()
        tabletApplies { @Sendable in $0 }
        #expect(editor.deleteElements(page: 0, elements: try selection()))
        editor.undo()
        await settle(editor)
        // Dropped from the queue, or sent then put back: the tablet ends with the note as it was.
        #expect(tablet.bytes == original)
        #expect(editor.deletions(on: 0).isEmpty)
    }

    @Test func aRefusedDeleteLeavesTheElementsAndSaysWhy() async throws {
        let editor = try editor()
        tablet.failEdit = .failed("device-link edit: no-element: operation 1")
        #expect(editor.deleteElements(page: 0, elements: try selection()))
        await settle(editor)
        #expect(editor.deletions(on: 0).isEmpty && editor.history.undoKind == nil)
        #expect(editor.refusal?.contains("no-element") == true)
    }

    @Test func revertToTheOldestBackupGivesTheNoteBackAndStartsUndoOver() async throws {
        let editor = try editor()
        #expect(!editor.canRevert)
        editor.movePage(from: 0, to: 3)
        await settle(editor)
        #expect(editor.canRevert)
        let oldest = try #require(editor.backups.last)
        await editor.revert(to: oldest)
        #expect(tablet.bytes == original)
        #expect(try Data(contentsOf: copy) == original)
        #expect(Self.ids(editor.shown) == (try Self.ids(original)))
        #expect(editor.history.undoKind == nil && editor.refusal == nil)
    }

    @Test func revertWaitsUntilEveryEditReachedTheTablet() async throws {
        let editor = try editor()
        editor.movePage(from: 0, to: 1)
        await settle(editor)
        editor.movePage(from: 1, to: 2)
        #expect(!editor.canRevert)
        await settle(editor)
        #expect(editor.canRevert)
    }
}
