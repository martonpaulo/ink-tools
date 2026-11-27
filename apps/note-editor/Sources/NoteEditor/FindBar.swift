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
    /// Whether the find bar shows.
    var findShown = false
    /// The find bar's text; each change finds again.
    var query = "" {
        didSet { find() }
    }
    private(set) var search = NoteSearch()
    /// Asks the find bar to take the keyboard focus, as Edit › Find does when the bar shows.
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

    /// Edit › Find: shows the bar and puts the focus in its field.
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

/// The find bar under the toolbar, as Safari and TextEdit show it: the field, the count, the
/// previous and next buttons and Done (#322).
struct FindBar: View {
    /// The field's width, in points.
    static let fieldWidth: CGFloat = 260

    /// The status's width, so the buttons beside it stay in place as it changes, in points.
    static let statusWidth: CGFloat = 150
    /// The space around the bar's controls, in points, as Safari's find bar.
    static let inset = EdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12)

    /// The keypad's Enter, and Fn-Return.
    static let enter = KeyEquivalent("\u{3}")

    /// Whether a text field holds text an input method is still composing, which Return confirms.
    static var composing: Bool {
        NSApplication.shared.windows.contains { ($0.firstResponder as? NSTextView)?.hasMarkedText() == true }
    }

    @Bindable var text: NoteText
    /// Gives the keyboard focus back to the pages when the bar closes.
    let closed: () -> Void
    @FocusState private var fieldFocused: Bool

    var body: some View {
        HStack(spacing: 8) {
            TextField(Copy.findInNote, text: $text.query, prompt: Text(Copy.findInNote))
                .textFieldStyle(.roundedBorder)
                .frame(maxWidth: Self.fieldWidth)
                .focused($fieldFocused)
                // Return or Enter, and with Shift, go to the next and previous match each time, as in
                // Safari; `onSubmit` fired only on the first Return after a change. A Return that
                // confirms an input method's text stays the field's.
                .onKeyPress(keys: [.return, Self.enter]) { press in
                    guard !Self.composing else { return .ignored }
                    if press.modifiers.contains(.shift) { text.previous() } else { text.next() }
                    return .handled
                }
                .accessibilityLabel(Copy.findInNote)
            Text(text.status)
                .foregroundStyle(.secondary)
                .monospacedDigit()
                .lineLimit(1)
                .frame(width: Self.statusWidth, alignment: .leading)
                .help(text.status)
                .accessibilityLabel(text.status)
            ControlGroup {
                Button(Copy.previousMatch, systemImage: "chevron.left") { text.previous() }
                    .help(Copy.previousMatch)
                Button(Copy.nextMatch, systemImage: "chevron.right") { text.next() }
                    .help(Copy.nextMatch)
            }
            .fixedSize()
            .disabled(text.search.matches.isEmpty)
            Spacer(minLength: 0)
            Button(Copy.done, action: close)
        }
        .controlSize(.small)
        .padding(Self.inset)
        .background(.bar)
        .overlay(alignment: .bottom) { Divider() }
        .onExitCommand(perform: close)
        .onChange(of: text.focusRequest, initial: true) { fieldFocused = true }
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
