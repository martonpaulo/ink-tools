import AppKit
import InkNotebookEditorKit
import SwiftUI

/// The selection on one page (#324): a click, a drag of the rectangle or the lasso, Shift to add
/// or remove, and the selection drawn as each element's box and a dashed frame with handles
/// around them all. On a note from the tablet a drag on the selection moves it, drawn at once
/// from its lifted ink, as are the moves still on their way (#325); elsewhere it takes the
/// selection out to another app (#323).
struct SelectionLayer: View {
    /// How far from a stroke a click still takes it, and a drag shorter than this is a click,
    /// in points.
    static let reach: CGFloat = 4
    /// The side of a handle, in points.
    static let handle: CGFloat = 7
    /// The dash of the frame around a selection and of a drag in progress, in points.
    static let dash: [CGFloat] = [4, 3]

    let index: Int
    let pages: PageImages
    let viewer: PageViewer
    /// The page's drawn size, in points.
    let size: CGSize
    /// The drag in progress, in points.
    @State private var path: [CGPoint] = []
    /// The selection's move under the pointer, and its ink lifted off the page.
    @State private var dragged: ElementMove?
    @State private var lifted: LiftedInk?
    @Environment(NoteText.self) private var text: NoteText?
    @Environment(NoteEditor.self) private var editor: NoteEditor?

    /// Page pixels per point.
    private var pixels: CGFloat {
        size.width > 0 ? pages.size(of: index).width / size.width : 1
    }

    var body: some View {
        let selected = viewer.selection.page == index ? viewer.selection.ids : []
        let items = (pages.selectable(index) ?? []).filter { selected.contains($0.id) }
        let shift = offset(of: items)
        Canvas { context, _ in
            let accent = GraphicsContext.Shading.color(.accentColor)
            // Each move on its way, then the one under the pointer: the template where the
            // selection was, and its ink at its new place.
            var moves = editor?.moves(on: index) ?? []
            if let dragged, let lifted { moves.append((dragged, lifted)) }
            for (move, lifted) in moves {
                let at = points(lifted.frame)
                context.draw(Image(decorative: lifted.hole, scale: 1), in: at)
                context.draw(
                    Image(decorative: lifted.ink, scale: 1),
                    in: at.offsetBy(dx: CGFloat(move.dx) / pixels, dy: CGFloat(move.dy) / pixels))
            }
            context.translateBy(x: shift.width, y: shift.height)
            // A picture or a text box shows its own frame; a stroke shows only in the frame around
            // the selection, so no box covers the ink.
            for item in items where item.isArea {
                context.stroke(Path(points(item.bounds)), with: accent, lineWidth: 1)
            }
            if let box = frame(items) {
                context.stroke(Path(box), with: accent, style: StrokeStyle(lineWidth: 1, dash: Self.dash))
                for corner in Self.handles(of: box) {
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
            ForEach(items, id: \.id) { item in
                let box = points(item.bounds)
                let target = Color.clear
                    .contentShape(.rect)
                    .frame(width: max(box.width, Self.handle), height: max(box.height, Self.handle))
                    .offset(x: box.minX + shift.width, y: box.minY + shift.height)
                if let editor, editor.canEdit {
                    target.gesture(move(items, editor: editor))
                } else if let text {
                    target.onDrag { text.provider(of: pages.note, page: index, selected: items) }
                }
            }
        }
        .accessibilityElement()
        .accessibilityLabel(Copy.selectedCount(items.count))
        .accessibilityHidden(items.isEmpty)
    }

    /// A drag on the selection: it lifts the selection's ink, follows the pointer within the page,
    /// and on release hands the move to the editor (#325).
    private func move(_ items: [Selectable], editor: NoteEditor) -> some Gesture {
        DragGesture(minimumDistance: 1)
            .onChanged { value in
                let size = pages.size(of: index)
                dragged = ElementMove(
                    page: index, elements: items.map(MovedElement.init), dx: Int(value.translation.width * pixels),
                    dy: Int(value.translation.height * pixels)
                )
                .clamped(width: Int(size.width), height: Int(size.height))
                if lifted == nil {
                    let note = pages.note
                    Task { lifted = await LiftedInk.make(note, page: index, items: items) }
                }
            }
            .onEnded { _ in
                if let dragged, !dragged.isEmpty { editor.moveElements(dragged, lifted: lifted) }
                dragged = nil
                lifted = nil
            }
    }

    /// How far the selection's frame is drawn from its elements' boxes, in points: the drag under
    /// the pointer, and the moves of these elements still on their way.
    private func offset(of items: [Selectable]) -> CGSize {
        let records = Set(items.map(\.record))
        var moves = (editor?.moves(on: index) ?? []).map(\.move).filter { Set($0.elements.map(\.record)) == records }
        if let dragged { moves.append(dragged) }
        return CGSize(
            width: CGFloat(moves.map(\.dx).reduce(0, +)) / pixels,
            height: CGFloat(moves.map(\.dy).reduce(0, +)) / pixels)
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
        if moved, let box = frame(shown), box.insetBy(dx: -Self.handle, dy: -Self.handle).contains(value.startLocation)
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

    /// The eight handles of a frame: its corners and the middles of its sides.
    static func handles(of box: CGRect) -> [CGPoint] {
        [box.minX, box.midX, box.maxX].flatMap { x in
            [box.minY, box.midY, box.maxY].map { CGPoint(x: x, y: $0) }
        }
        .filter { $0 != CGPoint(x: box.midX, y: box.midY) }
    }
}
