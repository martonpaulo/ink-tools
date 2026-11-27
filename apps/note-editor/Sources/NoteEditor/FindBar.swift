import AppKit
import NoteEditorKit
import NoteFormat
import SwiftUI

/// The text of one open note: its word index (#321), Find in Note (#322) and the text Copy as
/// Text takes out (#323). The notebook window owns it and hands it down in the environment.
@Observable
final class NoteText {
    let indexer: NoteIndexer
    /// The note file's name without its extension.
    var name = ""
    /// Whether a find runs: the bar under the toolbar shows its result.
    var findShown = false
    /// How many of the toolbar's find fields are in the window: a narrow window moves the field
    /// under the overflow button, and the bar then holds one (#460). The toolbar may keep more than
    /// one copy of an item's view, so each copy counts itself in and out.
    var toolbarFields = 0
    var fieldInToolbar: Bool { toolbarFields > 0 }
    /// The find field's text; each change finds again.
    var query = "" {
        didSet { find() }
    }
    private(set) var search = NoteSearch()
    /// Asks the find field to take the keyboard focus, as Edit › Find does.
    var focusRequest = 0
    /// The note's Headings and their pictures, read once (#331).
    @ObservationIgnored private var headingsRead: Result<[Heading], NoteFormatError>?
    /// Keyed by page and place, which no two Headings share.
    @ObservationIgnored private var pictures: [String: CGImage?] = [:]

    init(indexer: NoteIndexer) {
        self.indexer = indexer
    }

    /// The note's words once every page is read; nil while the indexer runs.
    var index: NoteIndex? {
        if case .ready(let index) = indexer.state { index } else { nil }
    }

    func find() {
        search.find(query, in: index?.words ?? [])
    }

    /// Edit › Find: shows the bar and puts the focus in the find field.
    func showFind() {
        findShown = true
        focusRequest += 1
    }

    func closeFind() {
        findShown = false
        query = ""
    }

    func next() { search.next() }
    func previous() { search.previous() }

    /// What the bar says beside the field: the count, «No results», or how far the reading is.
    var status: String {
        let query = query.trimmingCharacters(in: .whitespaces)
        if query.isEmpty { return "" }
        switch indexer.state {
        case .idle: return Copy.readingHandwritingStart
        case .indexing(let done, let count): return Copy.readingHandwriting(done, count)
        case .ready: break
        }
        guard let current = search.current else { return Copy.noResults }
        return Copy.matchOf(current + 1, search.matches.count)
    }

    /// A newer copy of the note arrived (#315): its Headings are read again when next shown, its
    /// changed pages' words are read again, and the find runs again once they are.
    func refresh(note: NoteFile, changed: Set<Int>?) async {
        forgetHeadings()
        await indexer.refresh(note: note, changed: changed)
        find()
    }

    /// Drops the Headings read from an older copy, before the window shows the newer one.
    func forgetHeadings() {
        headingsRead = nil
        pictures = [:]
    }

    /// The note's Headings, read from its footer the first time they are asked for.
    func headings(of note: NoteFile) -> Result<[Heading], NoteFormatError> {
        if let headingsRead { return headingsRead }
        let read = HeadingsList.read(note)
        headingsRead = read
        return read
    }

    /// A Heading's handwriting, drawn the first time a row asks for it.
    func picture(of heading: Heading, in note: NoteFile, draw: (NoteFile, Heading) -> CGImage?) -> CGImage? {
        let key = "\(heading.page) \(heading.box.x) \(heading.box.y)"
        if let picture = pictures[key] { return picture }
        let picture = draw(note, heading)
        pictures[key] = picture
        return picture
    }

    /// The text of the words of `pages` (every page when nil), in reading order; nil while the
    /// indexer runs.
    func text(pages: Set<Int>?) -> String? {
        index.map { ReadingOrder.text($0.textWords(pages: pages)) }
    }
}

extension NoteText {
    /// The words whose middle lies inside `frame` (page pixels) on page `index`, in reading
    /// order; nil while the indexer runs (#323).
    func text(page: Int, in frame: CGRect) -> String? {
        index.map { found in
            ReadingOrder.text(
                found.textWords(pages: [page]).filter { frame.contains(CGPoint(x: $0.box.midX, y: $0.box.midY)) })
        }
    }

    /// The selected elements `items` of page `index` of `note` for a copy or a drag: their ink on
    /// transparent, and their words once they are read (#323).
    func provider(of note: NoteFile, page index: Int, selected items: [Selectable]) -> NSItemProvider {
        let frame = items.map(\.bounds).reduce(CGRect.null) { $0.union($1) }
        return PageExport.selectionProvider(
            note: note, page: index, items: items,
            name: PageExport.selectionName(note: name.isEmpty ? Copy.untitledNote : name, page: index),
            text: text(page: index, in: frame) ?? "")
    }

    /// Page `index` of `note` for a copy or a drag: PNG, PDF and its words once they are read.
    func provider(of note: NoteFile, page index: Int) -> NSItemProvider {
        PageExport.itemProvider(
            note: note, page: index, name: PageExport.name(note: name.isEmpty ? Copy.untitledNote : name, page: index),
            text: text(pages: [index]) ?? "")
    }
}

extension FocusedValues {
    /// The text of the notebook window in front, for Edit › Find and Copy as Text.
    @Entry var noteText: NoteText?
}

/// The find field in the toolbar, the platform's search field where Preview keeps its own (#322,
/// #460): typing finds, Return or Enter go to the next match and with Shift to the previous one
/// each time, as in Safari, Escape ends the find, and Edit › Find puts the focus in it.
struct FindField: View {
    /// The field's width in the toolbar, in points, as Preview's search field, and the least it
    /// narrows to before the toolbar moves it under its overflow button.
    static let toolbarWidth: CGFloat = 200
    static let toolbarMinWidth: CGFloat = 110

    let text: NoteText
    /// Whether this is the toolbar's field, which tells `text` when it is in the window.
    var inToolbar = false
    /// Gives the keyboard focus back to the pages when Escape ends the find.
    let closed: () -> Void

    var body: some View {
        // The query and the focus request are read here, so a change of either updates the field.
        FindSearchFieldView(
            text: text, query: text.query, focusRequest: text.focusRequest, inToolbar: inToolbar, closed: closed)
    }
}

/// The AppKit search field of `FindField`.
private struct FindSearchFieldView: NSViewRepresentable {
    let text: NoteText
    let query: String
    let focusRequest: Int
    let inToolbar: Bool
    let closed: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeNSView(context: Context) -> FindSearchField {
        let field = FindSearchField()
        if inToolbar {
            field.placed = { [weak text] inWindow in
                // Not during a view update: the bar shows or hides its own field on this.
                Task { @MainActor in text?.toolbarFields += inWindow ? 1 : -1 }
            }
        }
        field.placeholderString = Copy.findInNote
        field.setAccessibilityLabel(Copy.findInNote)
        field.delegate = context.coordinator
        (field.cell as? FindFieldCell)?.editor.step = { [weak coordinator = context.coordinator] backward in
            coordinator?.step(backward: backward)
        }
        // A field made while a find runs takes the focus, as Edit › Find asked before it existed.
        context.coordinator.focusSeen = text.findShown ? focusRequest - 1 : focusRequest
        return field
    }

    func updateNSView(_ field: FindSearchField, context: Context) {
        context.coordinator.parent = self
        // SwiftUI's control size does not reach an AppKit field: the bar's small field matches its
        // small buttons only when it is told. The toolbar's keeps AppKit's size, as the toolbar's
        // large controls would push it under the overflow button.
        let size = Self.appKitSize(context.environment.controlSize)
        if !inToolbar, field.controlSize != size {
            field.controlSize = size
            field.font = .systemFont(ofSize: NSFont.systemFontSize(for: size))
        }
        // A text an input method still composes stays the field's until it is confirmed.
        let composing = (field.currentEditor() as? NSTextView)?.hasMarkedText() == true
        if field.stringValue != query, !composing { field.stringValue = query }
        if focusRequest != context.coordinator.focusSeen {
            context.coordinator.focusSeen = focusRequest
            field.mayFocus = true
            Task { @MainActor in field.window?.makeFirstResponder(field) }
        }
    }

    /// The AppKit control size of a SwiftUI one.
    static func appKitSize(_ size: ControlSize) -> NSControl.ControlSize {
        switch size {
        case .mini: .mini
        case .small: .small
        case .large: .large
        case .extraLarge: .extraLarge
        default: .regular
        }
    }

    final class Coordinator: NSObject, NSSearchFieldDelegate {
        var parent: FindSearchFieldView
        /// The last Edit › Find the field took the focus for.
        var focusSeen = 0

        init(_ parent: FindSearchFieldView) { self.parent = parent }

        func controlTextDidChange(_ notification: Notification) {
            guard let field = notification.object as? NSSearchField else { return }
            // The field's clear button ends the find, as Preview's does.
            if field.stringValue.isEmpty {
                parent.text.closeFind()
            } else {
                parent.text.findShown = true
                parent.text.query = field.stringValue
            }
        }

        func step(backward: Bool) {
            if backward { parent.text.previous() } else { parent.text.next() }
        }

        func control(_ control: NSControl, textView: NSTextView, doCommandBy selector: Selector) -> Bool {
            guard selector == #selector(NSResponder.cancelOperation(_:)) else { return false }
            parent.text.closeFind()
            parent.closed()
            return true
        }
    }
}

/// The find field: a search field drawn by `FindFieldCell`.
final class FindSearchField: NSSearchField {
    /// Told when the field moves into a window (true) or out of one (false).
    var placed: (Bool) -> Void = { _ in }
    private var inWindow = false

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        guard (window != nil) != inWindow else { return }
        inWindow = window != nil
        placed(inWindow)
    }

    /// Whether the field takes the focus: once clicked or asked by Edit › Find, never when the
    /// window opens, where the pages keep it, as Preview's search field waits.
    var mayFocus = false

    override var acceptsFirstResponder: Bool { mayFocus && super.acceptsFirstResponder }

    override func mouseDown(with event: NSEvent) {
        mayFocus = true
        super.mouseDown(with: event)
    }

    override class var cellClass: AnyClass? {
        get { FindFieldCell.self }
        set {}
    }
}

/// The find field's cell, whose editor takes Return and Enter, with or without Shift, before the
/// field ends its editing: `onSubmit` fired only on the first Return after a change.
final class FindFieldCell: NSSearchFieldCell {
    let editor = FindFieldEditor()

    override func fieldEditor(for controlView: NSView) -> NSTextView? { editor }
}

/// The text view that edits the find field.
final class FindFieldEditor: NSTextView {
    /// Return and the keypad's Enter, by key code.
    static let stepKeys: Set<UInt16> = [36, 76]
    /// Goes to the next match, or the previous one when the argument is true.
    var step: (Bool) -> Void = { _ in }

    convenience init() {
        self.init(frame: .zero)
        isFieldEditor = true
    }

    override func keyDown(with event: NSEvent) {
        // A Return that confirms an input method's text stays the input method's.
        guard Self.stepKeys.contains(event.keyCode), !hasMarkedText() else {
            super.keyDown(with: event)
            return
        }
        step(event.modifierFlags.contains(.shift))
    }
}

/// The result of a find, under the toolbar while it runs: the previous and next buttons, the count
/// and Done (#322, #460), and the find field itself while the toolbar's is under its overflow button. The status follows the buttons and takes its own width, so a longer
/// status never moves them.
struct FindBar: View {
    /// The space around the bar's controls, in points, as Safari's find bar.
    static let inset = EdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12)

    @Bindable var text: NoteText
    /// Gives the keyboard focus back to the pages when the bar closes.
    let closed: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            if !text.fieldInToolbar {
                // As wide as the toolbar's field, narrowing first so the status keeps its words.
                FindField(text: text, closed: closed).frame(
                    minWidth: FindField.toolbarMinWidth, idealWidth: FindField.toolbarWidth,
                    maxWidth: FindField.toolbarWidth)
            }
            ControlGroup {
                Button(Copy.previousMatch, systemImage: "chevron.left") { text.previous() }
                    .help(Copy.previousMatch)
                Button(Copy.nextMatch, systemImage: "chevron.right") { text.next() }
                    .help(Copy.nextMatch)
            }
            .fixedSize()
            .disabled(text.search.matches.isEmpty)
            Text(text.status)
                .foregroundStyle(.secondary)
                .monospacedDigit()
                .lineLimit(1)
                .layoutPriority(1)
                .help(text.status)
                .accessibilityLabel(text.status)
            Spacer(minLength: 0)
            Button(Copy.done, action: close)
        }
        .controlSize(.small)
        .padding(Self.inset)
        .background(.bar)
        .overlay(alignment: .bottom) { Divider() }
        .onExitCommand(perform: close)
        .onChange(of: text.indexer.state) { text.find() }
        // VoiceOver hears the count as it changes, not each page of the reading.
        .onChange(of: text.status) { _, status in
            if !status.isEmpty, text.index != nil { AccessibilityNotification.Announcement(status).post() }
        }
    }

    private func close() {
        text.closeFind()
        closed()
    }
}

/// The matches on one page, each a box over its words, the current one stronger, as Preview and
/// Safari mark what they found (#322).
struct FindMarks: View {
    /// The page's index and size in pixels, and its drawn size in points.
    let page: Int
    let pixels: CGSize
    let size: CGSize
    @Environment(NoteText.self) private var text: NoteText?

    /// How far a mark reaches past its words' box, in points: a recognized word's box can end
    /// inside its last letter.
    static let outset: CGFloat = 3

    /// The mark of a match whose words' box is `box` in page pixels, on a page drawn at `scale`
    /// points a pixel.
    static func mark(_ box: CGRect, scale: CGFloat) -> CGRect {
        CGRect(x: box.minX * scale, y: box.minY * scale, width: box.width * scale, height: box.height * scale)
            .insetBy(dx: -outset, dy: -outset)
    }

    var body: some View {
        if let text, text.findShown {
            let scale = pixels.width > 0 ? size.width / pixels.width : 0
            let current = text.search.currentMatch
            ZStack(alignment: .topLeading) {
                ForEach(Array(text.search.matches.enumerated()), id: \.offset) { _, match in
                    if match.page == page {
                        let box = Self.mark(match.box, scale: scale)
                        let isCurrent = match == current
                        RoundedRectangle(cornerRadius: 2)
                            .fill(Color(nsColor: .findHighlightColor).opacity(isCurrent ? 0.55 : 0.3))
                            .overlay {
                                if isCurrent {
                                    // The page is paper in light and dark mode, so the outline stays dark.
                                    RoundedRectangle(cornerRadius: 2).strokeBorder(
                                        .black.opacity(0.6), lineWidth: 1.5)
                                }
                            }
                            .frame(width: box.width, height: box.height)
                            .offset(x: box.minX, y: box.minY)
                    }
                }
            }
            .frame(width: size.width, height: size.height, alignment: .topLeading)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }
}

/// Edit › Find, Find Next and Find Previous, with the Mac's keys, for the notebook window in
/// front (#322).
struct FindCommands: View {
    @FocusedValue(\.noteText) private var text

    var body: some View {
        Menu(Copy.findMenu) {
            Button(Copy.findItem) { text?.showFind() }
                .keyboardShortcut("f")
            Button(Copy.findNext) { text?.next() }
                .keyboardShortcut("g")
                .disabled(text?.search.matches.isEmpty != false)
            Button(Copy.findPrevious) { text?.previous() }
                .keyboardShortcut("g", modifiers: [.command, .shift])
                .disabled(text?.search.matches.isEmpty != false)
        }
        .disabled(text == nil)
    }
}
