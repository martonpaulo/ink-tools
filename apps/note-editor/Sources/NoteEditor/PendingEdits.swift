import NoteEditorKit
import SwiftUI

/// The element edits on their way to the tablet, drawn over a page or its thumbnail as the page
/// will look once the tablet applies them (#314, #476): each moved or transformed selection's ink
/// at its new place and the template where it was, each delete's template, each insert's picture
/// or text at its box.
enum PendingEdits {
    /// Draws `changes`, then `deletions`, then `insertions` in `context`, whose points are
    /// `pixels` page pixels each.
    static func draw(
        changes: [LiftedChange], deletions: [LiftedInk], insertions: [(rect: EditRect, image: CGImage)],
        pixels: CGFloat, in context: inout GraphicsContext
    ) {
        let points = { (rect: CGRect) in
            CGRect(
                x: rect.minX / pixels, y: rect.minY / pixels, width: rect.width / pixels, height: rect.height / pixels)
        }
        for change in changes {
            context.draw(Image(decorative: change.lifted.hole, scale: 1), in: points(change.lifted.frame))
            var mapped = context
            mapped.scaleBy(x: 1 / pixels, y: 1 / pixels)
            mapped.concatenate(change.matrix.affine)
            mapped.draw(Image(decorative: change.lifted.ink, scale: 1), in: change.lifted.frame)
        }
        for lifted in deletions {
            context.draw(Image(decorative: lifted.hole, scale: 1), in: points(lifted.frame))
        }
        for (rect, image) in insertions {
            let box = CGRect(x: rect.left, y: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top)
            context.draw(Image(decorative: image, scale: 1), in: points(box))
        }
    }
}

/// The edits on their way to page `index`, over its thumbnail (#476); nothing without an editor or
/// with nothing on its way. When the tablet's copy returns or an edit is refused, the editor drops
/// the edit and the thumbnail is the tablet's drawing again.
struct PendingEditsOverlay: View {
    let index: Int
    /// The page's size in pixels, and its drawn size in points.
    let pixelSize: CGSize
    let size: CGSize
    @Environment(NoteEditor.self) private var editor: NoteEditor?

    var body: some View {
        if let editor, !editor.pending.isEmpty {
            let pixels = size.width > 0 ? pixelSize.width / size.width : 1
            Canvas { context, _ in
                PendingEdits.draw(
                    changes: editor.liftedChanges(on: index), deletions: editor.deletions(on: index),
                    insertions: editor.insertions(on: index), pixels: pixels,
                    in: &context)
            }
            .frame(width: size.width, height: size.height)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }
}

extension View {
    /// The edits on their way to page `index` over this thumbnail, once its `drawn` state is ready.
    func pendingEdits(_ index: Int, pixelSize: CGSize, size: CGSize, drawn: PageImages.State) -> some View {
        overlay {
            if case .ready = drawn {
                PendingEditsOverlay(index: index, pixelSize: pixelSize, size: size)
            }
        }
    }
}
