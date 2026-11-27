import NoteEditorKit
import SwiftUI

/// The element edits on their way to the tablet, drawn over a page or its thumbnail as the page
/// will look once the tablet applies them (#314, #476): the template where each moved, transformed
/// or deleted selection was, each moved or transformed selection's ink at its new place, each
/// insert's picture or text at its box.
enum PendingEdits {
    /// Draws the holes of `changes` and `deletions`, then the ink of `changes`, then `insertions`
    /// in `context`, whose points are `pixels` page pixels each.
    static func draw(
        changes: [LiftedChange], deletions: [LiftedInk], insertions: [(rect: EditRect, image: CGImage)],
        pixels: CGFloat, in context: inout GraphicsContext
    ) {
        let points = { (rect: CGRect) in
            CGRect(
                x: rect.minX / pixels, y: rect.minY / pixels, width: rect.width / pixels, height: rect.height / pixels)
        }
        // Every hole first, so a hole never covers another selection's ink at its new place.
        for lifted in changes.map(\.lifted) + deletions {
            hole(lifted, pixels: pixels, in: context)
        }
        for change in changes {
            var mapped = context
            mapped.scaleBy(x: 1 / pixels, y: 1 / pixels)
            mapped.concatenate(change.matrix.affine)
            mapped.draw(Image(decorative: change.lifted.ink, scale: 1), in: change.lifted.frame)
        }
        for (rect, image) in insertions {
            let box = CGRect(x: rect.left, y: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top)
            context.draw(Image(decorative: image, scale: 1), in: points(box))
        }
    }

    /// How far a hole reaches past the element's ink, in points: the page under it is smoothed when
    /// drawn small, so its edge spreads past the ink by a display pixel or more (#478).
    static let holeMargin: CGFloat = 2

    /// The template where `lifted` was, cut by its elements' shapes widened by `holeMargin`.
    /// shortcut: a neighbour's ink within that margin of a lifted element is covered too; it shows
    /// only until the tablet's copy comes back.
    static func hole(_ lifted: LiftedInk, pixels: CGFloat, in context: GraphicsContext) {
        var page = context
        page.scaleBy(x: 1 / pixels, y: 1 / pixels)
        let widened = min(holeMargin * pixels, LiftedInk.reach - LiftedInk.edge)
        page.clipToLayer { mask in
            for item in lifted.items {
                let (path, width) = LiftedInk.shape(item, widened: widened)
                if let width {
                    mask.stroke(
                        Path(path), with: .color(.black),
                        style: StrokeStyle(lineWidth: width, lineCap: .round, lineJoin: .round))
                } else {
                    mask.fill(Path(path), with: .color(.black))
                }
            }
        }
        page.draw(Image(decorative: lifted.template, scale: 1), in: lifted.templateFrame)
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
