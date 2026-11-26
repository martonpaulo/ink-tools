import AppKit
import InkNotebookEditorKit
import SwiftUI

/// The selection on one page (#324): a click, a drag of the rectangle or the lasso, Shift to add
/// or remove, and the selection drawn as each element's box and a dashed frame with handles
/// around them all. Read-only: it names elements and changes nothing in the note.
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
    @Environment(NoteText.self) private var text: NoteText?

    /// Page pixels per point.
    private var pixels: CGFloat {
        size.width > 0 ? pages.size(of: index).width / size.width : 1
    }

    var body: some View {
        let selected = viewer.selection.page == index ? viewer.selection.ids : []
        let items = (pages.selectable(index) ?? []).filter { selected.contains($0.id) }
        Canvas { context, _ in
            let accent = GraphicsContext.Shading.color(.accentColor)
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
            if let text {
                ForEach(items, id: \.id) { item in
                    let box = points(item.bounds)
                    Color.clear
                        .contentShape(.rect)
                        .frame(width: max(box.width, Self.handle), height: max(box.height, Self.handle))
                        .offset(x: box.minX, y: box.minY)
                        .onDrag { text.provider(of: pages.note, page: index, selected: items) }
                }
            }
        }
        .accessibilityElement()
        .accessibilityLabel(Copy.selectedCount(items.count))
        .accessibilityHidden(items.isEmpty)
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
