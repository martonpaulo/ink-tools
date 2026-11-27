import AppKit
import NoteEditorKit
import SwiftUI

/// What an insert waits on: the picture or the text, its page, and the point it lands around, in
/// page pixels; nil for the page's middle (#264).
struct InsertRequest: Identifiable {
    enum Content {
        case picture(PictureImport)
        case text(String)
    }

    let id = UUID()
    let page: Int
    let content: Content
    var centre: CGPoint?
}

/// The Insert menu, as Pages holds one: a picture from a file or the screen, a text box (#264) and
/// a shape drawn by a drag on the page (#350).
struct InsertCommands: View {
    @FocusedValue(\.pageViewer) private var viewer: PageViewer?
    @FocusedValue(\.noteEditor) private var editor
    @FocusedValue(\.pageNavigator) private var navigator

    var body: some View {
        let page = navigator?.wrappedValue.index
        let ready = editor?.canEdit == true && page != nil
        Group {
            Button(Copy.insertPictureEllipsis) {
                guard let editor, let page else { return }
                InsertActions.choosePicture(editor: editor, page: page)
            }
            .keyboardShortcut("i", modifiers: [.command, .shift])
            Button(Copy.insertScreenshot) {
                guard let editor, let page else { return }
                InsertActions.screenshot(editor: editor, page: page)
            }
            Divider()
            Button(Copy.insertTextBoxEllipsis) {
                guard let page else { return }
                editor?.insertRequest = InsertRequest(page: page, content: .text(""))
            }
            .keyboardShortcut("t", modifiers: [.command, .option])
            Menu(Copy.insertShape) {
                ForEach(ShapeKind.allCases, id: \.self) { kind in
                    Button(Copy.shapeName(kind), systemImage: kind.symbol) {
                        viewer?.layout = .scroll
                        viewer?.shapeTool = kind
                    }
                }
            }
        }
        .disabled(!ready)
        .help(editor == nil ? Copy.editOnlyFromTablet : "")
    }
}

extension ShapeKind {
    /// The shape's symbol in Insert › Shape and its hint bar.
    var symbol: String {
        switch self {
        case .line: "line.diagonal"
        case .arrow: "arrow.up.right"
        case .rectangle: "rectangle"
        case .roundedRectangle: "app"
        case .ellipse: "oval"
        case .triangle: "triangle"
        case .diamond: "diamond"
        }
    }
}

extension View {
    /// Return puts the shape Insert › Shape waits with in the middle of `page`, with no drag (#350).
    func shapeReturn(viewer: PageViewer, editor: NoteEditor?, page index: Int?) -> some View {
        onKeyPress(.return) {
            guard let kind = viewer.shapeTool, let editor, editor.canEdit, let index else { return .ignored }
            let size = editor.pageSize(index)
            let page = CGSize(width: size.width, height: size.height)
            editor.insertShape(
                page: index,
                shape: ShapeDrawing.shape(kind, centredOn: CGPoint(x: page.width / 2, y: page.height / 2), page: page))
            viewer.shapeTool = nil
            return .handled
        }
    }
}

/// The steps that bring a picture or a text into an insert (#264).
enum InsertActions {
    /// The system's screenshot tool: `-i` lets the person pick the part of the screen.
    static let screenshotTool = URL(filePath: "/usr/sbin/screencapture")

    /// File chooser: a PNG, a JPEG or a PDF's first page.
    static func choosePicture(editor: NoteEditor, page: Int) {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = PictureImport.types
        panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let url = panel.url else { return }
        request(editor: editor, page: page, centre: nil) { try PictureImport.image(at: url) }
    }

    /// The system's interactive screenshot of a part of the screen, as Insert › Screenshot.
    static func screenshot(editor: NoteEditor, page: Int) {
        let file = FileManager.default.temporaryDirectory.appending(path: "screenshot-\(UUID().uuidString).png")
        let process = Process()
        process.executableURL = screenshotTool
        process.arguments = ["-i", file.path(percentEncoded: false)]
        process.terminationHandler = { _ in
            Task { @MainActor in
                defer { try? FileManager.default.removeItem(at: file) }
                // Escape in the screenshot leaves no file: nothing to insert.
                guard FileManager.default.fileExists(atPath: file.path(percentEncoded: false)) else { return }
                request(editor: editor, page: page, centre: nil) { try PictureImport.image(at: file) }
            }
        }
        do {
            try process.run()
        } catch {
            editor.refusal = Copy.cannotInsert(error.localizedDescription)
        }
    }

    /// Paste: an image becomes a picture, text a text box with its plain text and line breaks.
    /// Returns whether the pasteboard held either.
    @discardableResult
    static func paste(_ pasteboard: NSPasteboard, editor: NoteEditor, page: Int) -> Bool {
        if let image = PictureImport.image(on: pasteboard) {
            request(editor: editor, page: page, centre: nil) { image }
            return true
        }
        guard let text = TextPreview.plain(from: pasteboard), !text.isEmpty else { return false }
        return editor.pasteText(text, page: page)
    }

    /// Converts the picture `read` gives and asks for its placement.
    static func request(
        editor: NoteEditor, page: Int, centre: CGPoint?, read: () throws -> CGImage
    ) {
        do {
            let picture = try PictureImport.make(try read(), folder: try PictureImport.folder())
            editor.insertRequest = InsertRequest(page: page, content: .picture(picture), centre: centre)
        } catch {
            editor.refusal = Copy.cannotInsert(String(describing: error))
        }
    }
}

extension NoteEditor {
    /// A pasted text becomes a text box in the middle of `page`, at once (#264).
    func pasteText(_ text: String, page: Int) -> Bool {
        let size = pageSize(page)
        let lines = text.split(separator: "\n", omittingEmptySubsequences: false).count
        let box = TextBoxPlacement.box(
            lines: lines, fontSize: InsertSheet.defaultFontSize,
            centredOn: CGPoint(x: size.width / 2, y: size.height / 2),
            page: CGSize(width: size.width, height: size.height))
        return insertText(page: page, text: text, rect: box, fontSize: InsertSheet.defaultFontSize)
    }
}

/// The sheet before an insert is sent: the picture in Manta greys and its width, or the text box's
/// text and font size, as the tablet will show them (#264).
struct InsertSheet: View {
    /// The sheet's width, and the preview's height, in points.
    static let width: CGFloat = 396
    static let previewHeight: CGFloat = 220
    /// The tablet's text box font sizes, in page pixels (the helper's own limits), and the one a
    /// new text box starts at, as `inkctl note insert-text` does.
    static let fontSizes = 8...200
    static let defaultFontSize = 40
    /// One step of the font size, in page pixels.
    static let fontStep = 4
    /// The narrowest a picture may be placed, as a share of the page's width.
    static let narrowest = 0.1

    let editor: NoteEditor
    let request: InsertRequest
    @State private var share: Double
    @State private var text: String
    @State private var fontSize = Self.defaultFontSize
    @Environment(\.dismiss) private var dismiss

    init(editor: NoteEditor, request: InsertRequest) {
        self.editor = editor
        self.request = request
        let page = editor.pageSize(request.page)
        if case .picture(let picture) = request.content {
            let box = PicturePlacement.box(
                pixels: CGSize(width: picture.image.width, height: picture.image.height), centredOn: .zero,
                page: CGSize(width: page.width, height: page.height))
            _share = State(initialValue: Double(box.right - box.left) / Double(page.width))
            _text = State(initialValue: "")
        } else {
            _share = State(initialValue: TextBoxPlacement.widthShare)
            if case .text(let initial) = request.content {
                _text = State(initialValue: initial)
            } else {
                _text = State(initialValue: "")
            }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            switch request.content {
            case .picture(let picture):
                Text(Copy.insertPictureTitle).font(.headline)
                Image(decorative: picture.image, scale: 1)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: .infinity, maxHeight: Self.previewHeight)
                    .background(.white)
                    .accessibilityLabel(Copy.insertPictureTitle)
                LabeledContent(Copy.pictureWidth) {
                    Slider(value: $share, in: Self.narrowest...1)
                        .accessibilityLabel(Copy.pictureWidth)
                        .accessibilityValue(Copy.percentOfPage(share))
                }
                Text(Copy.greysNote).font(.callout).foregroundStyle(.secondary)
            case .text:
                Text(Copy.insertTextBoxTitle).font(.headline)
                TextEditor(text: $text)
                    .font(.body)
                    .frame(height: Self.previewHeight / 2)
                    .accessibilityLabel(Copy.insertTextBoxTitle)
                Stepper(value: $fontSize, in: Self.fontSizes, step: Self.fontStep) {
                    Text(Copy.fontSize(fontSize))
                }
                .accessibilityLabel(Copy.fontSize(fontSize))
                Text(Copy.textBoxNote).font(.callout).foregroundStyle(.secondary)
            }
            HStack {
                Spacer()
                Button(Copy.cancel, role: .cancel) { dismiss() }
                    .keyboardShortcut(.cancelAction)
                Button(Copy.insert) {
                    insert()
                    dismiss()
                }
                .keyboardShortcut(.defaultAction)
                .disabled(isTextEmpty)
            }
        }
        .padding(InsertPageSheet.inset)
        .frame(width: Self.width)
    }

    private var isTextEmpty: Bool {
        if case .text = request.content { return text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        return false
    }

    private func insert() {
        let page = editor.pageSize(request.page)
        let size = CGSize(width: page.width, height: page.height)
        let centre = request.centre ?? CGPoint(x: size.width / 2, y: size.height / 2)
        switch request.content {
        case .picture(let picture):
            let box = PicturePlacement.box(
                pixels: CGSize(width: picture.image.width, height: picture.image.height), centredOn: centre, page: size,
                width: size.width * share)
            editor.insertPicture(page: request.page, file: picture.file, rect: box, image: picture.image)
        case .text:
            let lines = text.split(separator: "\n", omittingEmptySubsequences: false).count
            let box = TextBoxPlacement.box(lines: lines, fontSize: fontSize, centredOn: centre, page: size)
            editor.insertText(page: request.page, text: text, rect: box, fontSize: fontSize)
        }
    }
}
