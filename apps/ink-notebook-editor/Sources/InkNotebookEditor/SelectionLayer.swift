import AppKit
import InkNotebookEditorKit
import SwiftUI
import UniformTypeIdentifiers

/// The selection on one page (#324): a click, a drag of the rectangle or the lasso, Shift to add
/// or remove, and the selection drawn as each element's box and a dashed frame with handles
/// around them all. On a note from the tablet a drag on the selection moves it, drawn at once
/// from its lifted ink, as are the moves still on their way (#325), its handles resize it, Shift
/// keeping the proportion, and the knob above it rotates it, Shift by 15° (#326); elsewhere it
/// takes the selection out to another app (#323).
struct SelectionLayer: View {
    /// How far from a stroke a click still takes it, and a drag shorter than this is a click,
    /// in points.
    static let reach: CGFloat = 4
    /// The side of a handle, in points.
    static let handle: CGFloat = 7
    /// The dash of the frame around a selection and of a drag in progress, in points.
    static let dash: [CGFloat] = [4, 3]
    /// How far above the frame the rotation knob sits, in points.
    static let knob: CGFloat = 18
    /// The step of a rotation with Shift, as Preview's and Keynote's rotations snap.
    static let snap = CGFloat.pi / 12
    /// The layer's own coordinates, for the rotation knob's angle.
    static let space = "selection"

    let index: Int
    let pages: PageImages
    let viewer: PageViewer
    /// The page's size in pixels, from the page that holds the layer (#329).
    let pixelSize: CGSize
    /// The page's drawn size, in points.
    let size: CGSize
    /// The drag in progress, in points.
    @State private var path: [CGPoint] = []
    /// The selection's move under the pointer, and its ink lifted off the page.
    @State private var dragged: ElementMove?
    /// The resize or rotation under the pointer (#326).
    @State private var live: ElementTransform?
    @State private var lifted: LiftedInk?
    @Environment(NoteText.self) private var text: NoteText?
    @Environment(NoteEditor.self) private var editor: NoteEditor?
    @Environment(\.openDocument) private var openDocument

    /// Page pixels per point.
    private var pixels: CGFloat {
        size.width > 0 ? pixelSize.width / size.width : 1
    }

    var body: some View {
        let selected = viewer.selection.page == index ? viewer.selection.ids : []
        let items = (pages.selectable(index) ?? []).filter { selected.contains($0.id) }
        // The selection where the changes on their way put it (#326).
        let elements = editor?.chain(items, page: index).elements ?? items.map(MovedElement.init)
        let current = (live?.transformed ?? elements).map(\.selectable)
        let shift = offset()
        let editable = editor?.canEdit == true && !items.isEmpty
        Canvas { context, _ in
            let accent = GraphicsContext.Shading.color(.accentColor)
            // Each selection's changes on their way, the one under the pointer last: the template
            // where the selection was, and its ink where the changes put it.
            for change in changes(items) {
                context.draw(Image(decorative: change.lifted.hole, scale: 1), in: points(change.lifted.frame))
                var mapped = context
                mapped.scaleBy(x: 1 / pixels, y: 1 / pixels)
                mapped.concatenate(change.matrix.affine)
                mapped.draw(Image(decorative: change.lifted.ink, scale: 1), in: change.lifted.frame)
            }
            // Each delete on its way: the template where its elements were (#327).
            for lifted in editor?.deletions(on: index) ?? [] {
                context.draw(Image(decorative: lifted.hole, scale: 1), in: points(lifted.frame))
            }
            // Each picture or text box on its way, at its box (#264).
            for (rect, image) in editor?.insertions(on: index) ?? [] {
                let box = CGRect(
                    x: rect.left, y: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top)
                context.draw(Image(decorative: image, scale: 1), in: points(box))
            }
            context.translateBy(x: shift.width, y: shift.height)
            // A picture or a text box shows its own frame; a stroke shows only in the frame around
            // the selection, so no box covers the ink.
            for item in current where item.isArea {
                context.stroke(Path(points(item.bounds)), with: accent, lineWidth: 1)
            }
            if let box = frame(current) {
                context.stroke(Path(box), with: accent, style: StrokeStyle(lineWidth: 1, dash: Self.dash))
                if editable {
                    // The rotation knob, joined to the middle of the top edge (#326).
                    let knob = Self.knobPoint(of: box)
                    var stem = Path()
                    stem.move(to: CGPoint(x: box.midX, y: box.minY))
                    stem.addLine(to: knob)
                    context.stroke(stem, with: accent, lineWidth: 1)
                    let circle = Path(
                        ellipseIn: CGRect(
                            x: knob.x - Self.handle / 2, y: knob.y - Self.handle / 2, width: Self.handle,
                            height: Self.handle))
                    context.fill(circle, with: .color(.white))
                    context.stroke(circle, with: accent, lineWidth: 1)
                }
                for corner in ResizeHandle.allCases.map({ Self.point(of: $0, in: box) }) {
                    let square = Path(
                        CGRect(
                            x: corner.x - Self.handle / 2, y: corner.y - Self.handle / 2, width: Self.handle,
                            height: Self.handle))
                    context.fill(square, with: .color(.white))
                    context.stroke(square, with: accent, lineWidth: 1)
                }
            }
            context.translateBy(x: -shift.width, y: -shift.height)
            if path.count > 1 {
                var drag = Path()
                if viewer.tool == .lasso {
                    drag.addLines(path)
                } else if let start = path.first, let end = path.last {
                    drag.addRect(Self.rect(start, end))
                }
                context.stroke(drag, with: accent, style: StrokeStyle(lineWidth: 1, dash: Self.dash))
            }
        }
        .contentShape(.rect)
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { value in
                    if path.isEmpty { path = [value.startLocation] }
                    path.append(value.location)
                }
                .onEnded { value in
                    finish(value)
                    path = []
                }
        )
        // A drag that starts on the selection takes its ink and words out to another app (#323).
        // Only the selected elements' own boxes, so a click or a new rectangle between them
        // still reaches the page.
        .overlay(alignment: .topLeading) {
            ForEach(current, id: \.id) { item in
                let box = points(item.bounds)
                let target = Color.clear
                    .contentShape(.rect)
                    .frame(width: max(box.width, Self.handle), height: max(box.height, Self.handle))
                    .offset(x: box.minX + shift.width, y: box.minY + shift.height)
                if let editor, editor.canEdit {
                    target.gesture(move(items, elements, editor: editor))
                } else if let text {
                    target.onDrag { text.provider(of: pages.note, page: index, selected: items) }
                }
            }
            if let editor, editable, let box = frame(current) {
                handles(box, items: items, elements: elements, editor: editor)
            }
        }
        .coordinateSpace(.named(Self.space))
        // A picture or a PDF dropped on a page of a note from the tablet is placed where it was
        // dropped (#264); a note dropped here opens in its own window, as on the window.
        .dropDestination(for: URL.self) { urls, location in drop(urls, at: location) }
        .accessibilityElement()
        .accessibilityLabel(Copy.selectedCount(items.count))
        .accessibilityHidden(items.isEmpty)
        .accessibilityActions {
            if let editor, editable {
                ForEach(SelectionChange.allCases, id: \.self) { change in
                    Button(change.title) { change.apply(to: items, page: index, editor: editor) }
                }
            }
        }
    }

    /// The selection's changes on their way, and the one under the pointer in place of its own.
    private func changes(_ items: [Selectable]) -> [LiftedChange] {
        var changes = editor?.liftedChanges(on: index) ?? []
        let records = Set(items.map(\.record))
        let pointer: PageMatrix? =
            live?.matrix
            ?? dragged.map { PageMatrix(a: 1, b: 0, c: 0, d: 1, tx: Double($0.dx), ty: Double($0.dy)) }
        guard let pointer, !items.isEmpty else { return changes }
        let earlier = changes.first { $0.records == records }
        changes.removeAll { $0.records == records }
        if let ink = earlier?.lifted ?? lifted {
            changes.append(
                LiftedChange(records: records, lifted: ink, matrix: (earlier?.matrix ?? .identity).then(pointer)))
        }
        return changes
    }

    /// The eight resize handles and the rotation knob of the frame `box`, on screen (#326).
    private func handles(
        _ box: CGRect, items: [Selectable], elements: [MovedElement], editor: NoteEditor
    ) -> some View {
        Group {
            ForEach(ResizeHandle.allCases, id: \.self) { handle in
                let at = Self.point(of: handle, in: box)
                Color.clear
                    .contentShape(.rect)
                    .frame(width: 2 * Self.handle, height: 2 * Self.handle)
                    .offset(x: at.x - Self.handle, y: at.y - Self.handle)
                    .gesture(resize(handle, items: items, elements: elements, editor: editor))
                    .accessibilityLabel(Copy.resizeHandle(handle))
            }
            let knob = Self.knobPoint(of: box)
            Color.clear
                .contentShape(.rect)
                .frame(width: 2 * Self.handle, height: 2 * Self.handle)
                .offset(x: knob.x - Self.handle, y: knob.y - Self.handle)
                .gesture(rotate(items: items, elements: elements, editor: editor))
                .accessibilityLabel(Copy.rotateFreely)
        }
    }

    /// A drag on a handle: the frame follows the pointer, the opposite side staying, Shift keeping
    /// the proportion; the release hands the resize to the editor.
    private func resize(
        _ handle: ResizeHandle, items: [Selectable], elements: [MovedElement], editor: NoteEditor
    ) -> some Gesture {
        DragGesture(minimumDistance: 1)
            .onChanged { value in
                let frame = ElementTransform(page: index, elements: elements, matrix: .identity).frame
                let anchor = Self.point(of: handle, in: frame)
                let to = CGPoint(
                    x: anchor.x + value.translation.width * pixels, y: anchor.y + value.translation.height * pixels)
                let rect = ElementTransform.resized(
                    frame, handle: handle, to: to, keepRatio: NSEvent.modifierFlags.contains(.shift))
                live = ElementTransform.resize(page: index, elements: elements, to: rect)
                liftOnce(items)
            }
            .onEnded { _ in endLive(items, editor: editor) }
    }

    /// A drag on the knob: the selection turns about its centre with the pointer, by 15° with Shift.
    private func rotate(items: [Selectable], elements: [MovedElement], editor: NoteEditor) -> some Gesture {
        DragGesture(minimumDistance: 1, coordinateSpace: .named(Self.space))
            .onChanged { value in
                let frame = ElementTransform(page: index, elements: elements, matrix: .identity).frame
                let centre = CGPoint(x: frame.midX / pixels, y: frame.midY / pixels)
                var angle =
                    atan2(value.location.y - centre.y, value.location.x - centre.x)
                    - atan2(value.startLocation.y - centre.y, value.startLocation.x - centre.x)
                if NSEvent.modifierFlags.contains(.shift) { angle = (angle / Self.snap).rounded() * Self.snap }
                live = ElementTransform.rotation(page: index, elements: elements, radians: Double(angle))
                liftOnce(items)
            }
            .onEnded { _ in endLive(items, editor: editor) }
    }

    /// Lifts the selection's ink once, for drawing a change under the pointer.
    private func liftOnce(_ items: [Selectable]) {
        guard lifted == nil else { return }
        let note = pages.note
        Task { lifted = await LiftedInk.make(note, page: index, items: items) }
    }

    /// The release of a handle or the knob: the change goes to the editor, drawn at once.
    private func endLive(_ items: [Selectable], editor: NoteEditor) {
        if let change = live, !change.isEmpty {
            Task { await editor.transform(items, page: index) { _ in change } }
        }
        live = nil
        lifted = nil
    }

    /// Opens dropped notes, and asks to place a dropped picture on a note from the tablet.
    private func drop(_ urls: [URL], at location: CGPoint) -> Bool {
        let notes = urls.filter { TabletListing.isNote($0.lastPathComponent) }
        for url in notes {
            Task { try? await openDocument(at: url) }
        }
        guard let editor, editor.canEdit,
            let picture = urls.first(where: { url in
                PictureImport.types.contains { UTType(filenameExtension: url.pathExtension)?.conforms(to: $0) == true }
            })
        else { return !notes.isEmpty }
        InsertActions.request(editor: editor, page: index, centre: page(location)) {
            try PictureImport.image(at: picture)
        }
        return true
    }

    /// A drag on the selection: it lifts the selection's ink, follows the pointer within the page,
    /// and on release hands the move to the editor (#325).
    private func move(_ items: [Selectable], _ elements: [MovedElement], editor: NoteEditor) -> some Gesture {
        DragGesture(minimumDistance: 1)
            .onChanged { value in
                let size = pixelSize
                dragged = ElementMove(
                    page: index, elements: elements, dx: Int(value.translation.width * pixels),
                    dy: Int(value.translation.height * pixels)
                )
                .clamped(width: Int(size.width), height: Int(size.height))
                liftOnce(items)
            }
            .onEnded { _ in
                // The ink was lifted at the copy's place: it is the move's own only with no
                // change of the selection on its way.
                let earlier = editor.liftedChanges(on: index).contains { $0.records == Set(items.map(\.record)) }
                if let dragged, !dragged.isEmpty { editor.moveElements(dragged, lifted: earlier ? nil : lifted) }
                dragged = nil
                lifted = nil
            }
    }

    /// How far the selection's frame is drawn from where the changes on their way put it, in
    /// points: the drag under the pointer.
    private func offset() -> CGSize {
        CGSize(width: CGFloat(dragged?.dx ?? 0) / pixels, height: CGFloat(dragged?.dy ?? 0) / pixels)
    }

    /// The frame around the selected `items` on screen, its handles on its edge, or `nil`.
    private func frame(_ items: [Selectable]) -> CGRect? {
        items.map(\.bounds).reduce(nil) { ($0 ?? $1).union($1) }
            .map { points($0).insetBy(dx: -Self.handle, dy: -Self.handle) }
    }

    /// Ends a click or a drag: the elements it found replace the selection, or with Shift add to
    /// it. A drag that starts on a selected element never gets here: it takes the selection out
    /// to another app (#323). A click on a page whose elements are still being read applies once they are.
    private func finish(_ value: DragGesture.Value) {
        let adding = NSEvent.modifierFlags.contains(.shift)
        let moved = hypot(value.translation.width, value.translation.height) >= Self.reach
        let selected = viewer.selection.page == index ? viewer.selection.ids : []
        let shown = (pages.selectable(index) ?? []).filter { selected.contains($0.id) }
        let placed = editor?.chain(shown, page: index).elements.map(\.selectable) ?? shown
        if moved, let box = frame(placed),
            box.insetBy(dx: -Self.handle, dy: -Self.handle - Self.knob).contains(value.startLocation)
        {
            return
        }
        let start = page(value.startLocation)
        let end = page(value.location)
        let lasso = path.map(page)
        let tool = viewer.tool
        let tolerance = Self.reach * pixels
        let apply = { (items: [Selectable]) in
            if !moved {
                viewer.selection.click(HitTest.click(end, in: items, tolerance: tolerance), page: index, adding: adding)
            } else if tool == .lasso {
                viewer.selection.take(HitTest.lasso(lasso, in: items), page: index, adding: adding)
            } else {
                viewer.selection.take(HitTest.rectangle(Self.rect(start, end), in: items), page: index, adding: adding)
            }
        }
        if let items = pages.selectable(index) {
            apply(items)
        } else {
            Task {
                await pages.loadElements(index)
                if let items = pages.selectable(index) { apply(items) }
            }
        }
    }

    /// A point on screen in the page's pixels.
    private func page(_ point: CGPoint) -> CGPoint {
        CGPoint(x: point.x * pixels, y: point.y * pixels)
    }

    /// A box in the page's pixels on screen.
    private func points(_ rect: CGRect) -> CGRect {
        CGRect(x: rect.minX / pixels, y: rect.minY / pixels, width: rect.width / pixels, height: rect.height / pixels)
    }

    static func rect(_ start: CGPoint, _ end: CGPoint) -> CGRect {
        CGRect(
            x: min(start.x, end.x), y: min(start.y, end.y), width: abs(end.x - start.x), height: abs(end.y - start.y))
    }

    /// Where `handle` sits on `box`: a corner or the middle of a side.
    static func point(of handle: ResizeHandle, in box: CGRect) -> CGPoint {
        let x: CGFloat =
            switch handle {
            case .topLeft, .left, .bottomLeft: box.minX
            case .top, .bottom: box.midX
            case .topRight, .right, .bottomRight: box.maxX
            }
        let y: CGFloat =
            switch handle {
            case .topLeft, .top, .topRight: box.minY
            case .left, .right: box.midY
            case .bottomLeft, .bottom, .bottomRight: box.maxY
            }
        return CGPoint(x: x, y: y)
    }

    /// Where the rotation knob sits above `box`.
    static func knobPoint(of box: CGRect) -> CGPoint {
        CGPoint(x: box.midX, y: box.minY - knob)
    }
}

/// Rotate Left and Right and Flip Horizontal and Vertical of a selection, from the Tools menu and
/// VoiceOver's actions, as Preview's Tools menu names them (#326).
enum SelectionChange: CaseIterable {
    case rotateLeft, rotateRight, flipHorizontal, flipVertical

    var title: String {
        switch self {
        case .rotateLeft: Copy.rotateLeft
        case .rotateRight: Copy.rotateRight
        case .flipHorizontal: Copy.flipHorizontal
        case .flipVertical: Copy.flipVertical
        }
    }

    /// Preview's shortcuts for its rotations; the flips have none there.
    var shortcut: KeyboardShortcut? {
        switch self {
        case .rotateLeft: KeyboardShortcut("l")
        case .rotateRight: KeyboardShortcut("r")
        case .flipHorizontal, .flipVertical: nil
        }
    }

    func transform(page: Int, elements: [MovedElement]) -> ElementTransform {
        switch self {
        case .rotateLeft: .quarterTurn(page: page, elements: elements, clockwise: false)
        case .rotateRight: .quarterTurn(page: page, elements: elements, clockwise: true)
        case .flipHorizontal: .flip(page: page, elements: elements, horizontal: true)
        case .flipVertical: .flip(page: page, elements: elements, horizontal: false)
        }
    }

    /// Changes the selected `items` of `page`, drawn at once and sent in the background.
    @MainActor
    func apply(to items: [Selectable], page: Int, editor: NoteEditor) {
        Task { await editor.transform(items, page: page) { transform(page: page, elements: $0) } }
    }
}
