import CoreGraphics
import InkNotebookEditorKit
import NoteFormat
import Observation
import os

/// The drawn pages of one open notebook. Pages decode off the main actor; the window keeps a
/// thumbnail of every page it has shown and the full raster of only the last few pages, since one
/// full page is several megabytes.
@Observable
final class PageImages {
    enum State {
        case loading
        case ready(CGImage)
        case failed(String)
    }

    /// The thumbnail box of the page list, in points.
    static let thumbnailBox = CGSize(width: 112, height: 150)
    /// How many full pages stay drawn: the current one and its neighbours.
    static let keptPages = 3

    let note: NoteFile
    private(set) var pages: [Int: State] = [:]
    private(set) var thumbnails: [Int: State] = [:]
    @ObservationIgnored private var recent: [Int] = []
    private let logger = Logger(subsystem: "com.martonpaulo.inktools.notebookeditor", category: "pages")

    init(note: NoteFile) {
        self.note = note
    }

    /// The page's size in pixels, for its aspect before it is drawn.
    func size(of index: Int) -> CGSize {
        let size = note.pageSize
        return note.pages[index].isHorizontal
            ? CGSize(width: size.height, height: size.width) : CGSize(width: size.width, height: size.height)
    }

    func page(_ index: Int) -> State { pages[index] ?? .loading }
    func thumbnail(_ index: Int) -> State { thumbnails[index] ?? .loading }

    /// Draws one page at full size, unless it is drawn or being drawn.
    func loadPage(_ index: Int) async {
        touch(index)
        guard pages[index] == nil else { return }
        pages[index] = .loading
        pages[index] = await Self.draw(note, index, thumbnailPixels: nil, logger: logger)
    }

    /// Draws one thumbnail, as many pixels as the box shows on a display of `scale`.
    func loadThumbnail(_ index: Int, scale: CGFloat) async {
        guard thumbnails[index] == nil else { return }
        thumbnails[index] = .loading
        let points = PageFit.fitted(page: size(of: index), in: Self.thumbnailBox)
        let pixels = PageFit.pixels(for: points, scale: scale)
        thumbnails[index] = await Self.draw(note, index, thumbnailPixels: pixels, logger: logger)
    }

    private func touch(_ index: Int) {
        recent.removeAll { $0 == index }
        recent.append(index)
        while recent.count > Self.keptPages {
            pages[recent.removeFirst()] = nil
        }
    }

    @concurrent
    private static func draw(
        _ note: NoteFile, _ index: Int, thumbnailPixels: (width: Int, height: Int)?, logger: Logger
    ) async -> State {
        do {
            guard let image = try note.render(page: index).cgImage() else {
                return .failed(Copy.pageHasNoImage)
            }
            guard let pixels = thumbnailPixels else { return .ready(image) }
            return scaled(image, to: pixels).map(State.ready) ?? .failed(Copy.pageHasNoImage)
        } catch {
            logger.error("page \(index + 1, privacy: .public) failed: \(String(describing: error), privacy: .public)")
            return .failed(String(describing: error))
        }
    }

    /// The page raster resampled to the pixels it is drawn at. SwiftUI's own downscaling of a full
    /// page skips lines of a fine grid and thin strokes; Core Graphics' high-quality resampling
    /// keeps them.
    @concurrent
    static func fit(_ image: CGImage, to pixels: (width: Int, height: Int)) async -> CGImage? {
        scaled(image, to: pixels)
    }

    nonisolated private static func scaled(_ image: CGImage, to pixels: (width: Int, height: Int)) -> CGImage? {
        guard pixels.width > 0, pixels.height > 0,
            let context = CGContext(
                data: nil, width: pixels.width, height: pixels.height, bitsPerComponent: 8, bytesPerRow: 0,
                space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)
        else { return nil }
        context.interpolationQuality = .high
        context.draw(image, in: CGRect(x: 0, y: 0, width: pixels.width, height: pixels.height))
        return context.makeImage()
    }
}

extension PageImages.State: Equatable {
    static func == (left: Self, right: Self) -> Bool {
        switch (left, right) {
        case (.loading, .loading): true
        case (.ready(let a), .ready(let b)): a === b
        case (.failed(let a), .failed(let b)): a == b
        default: false
        }
    }
}
