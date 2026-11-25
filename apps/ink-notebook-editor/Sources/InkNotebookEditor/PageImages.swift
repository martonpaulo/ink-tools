import Accelerate
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
    /// The style of each drawn page whose template could not be drawn (#308).
    private(set) var missingTemplates: [Int: String] = [:]
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
        let (state, missing) = await Self.draw(note, index, thumbnailPixels: nil, logger: logger)
        pages[index] = state
        missingTemplates[index] = missing
    }

    /// Draws one thumbnail, as many pixels as the box shows on a display of `scale`.
    func loadThumbnail(_ index: Int, scale: CGFloat) async {
        guard thumbnails[index] == nil else { return }
        thumbnails[index] = .loading
        let points = PageFit.fitted(page: size(of: index), in: Self.thumbnailBox)
        let pixels = PageFit.pixels(for: points, scale: scale)
        let (state, missing) = await Self.draw(note, index, thumbnailPixels: pixels, logger: logger)
        thumbnails[index] = state
        missingTemplates[index] = missing
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
    ) async -> (State, missingTemplate: String?) {
        do {
            let bitmap = try note.render(page: index)
            let missing = bitmap.templateFailure
            if let missing {
                logger.error(
                    "page \(index + 1, privacy: .public): template \(missing.style, privacy: .public) not drawn: \(String(describing: missing.reason), privacy: .public)"
                )
            }
            guard let image = bitmap.cgImage() else { return (.failed(Copy.pageHasNoImage), missing?.style) }
            guard let pixels = thumbnailPixels else { return (.ready(image), missing?.style) }
            return (scaled(image, to: pixels).map(State.ready) ?? .failed(Copy.pageHasNoImage), missing?.style)
        } catch {
            logger.error("page \(index + 1, privacy: .public) failed: \(String(describing: error), privacy: .public)")
            return (.failed(String(describing: error)), nil)
        }
    }

    /// The page raster resampled to the pixels it is drawn at. SwiftUI's own downscaling of a full
    /// page skips lines of a fine grid and thin strokes; Core Graphics' high-quality resampling
    /// keeps them, and `darkened` keeps them dark.
    @concurrent
    static func fit(_ image: CGImage, to pixels: (width: Int, height: Int)) async -> CGImage? {
        scaled(image, to: pixels)
    }

    nonisolated static func scaled(_ image: CGImage, to pixels: (width: Int, height: Int)) -> CGImage? {
        guard pixels.width > 0, pixels.height > 0,
            let image = darkened(image, by: darkening(from: image.height, to: pixels.height)),
            let context = CGContext(
                data: nil, width: pixels.width, height: pixels.height, bitsPerComponent: 8, bytesPerRow: 0,
                space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)
        else { return nil }
        context.interpolationQuality = .high
        context.draw(image, in: CGRect(x: 0, y: 0, width: pixels.width, height: pixels.height))
        return context.makeImage()
    }

    /// The side of the darkening square for a page drawn at `toHeight` pixels from `fromHeight`:
    /// none under a third of the size, else the largest odd number up to half the page pixels in
    /// one drawn pixel, at least 3. Half keeps a thumbnail's dots and lines a light texture, as on
    /// paper, rather than a dark one.
    nonisolated static func darkening(from fromHeight: Int, to toHeight: Int) -> Int {
        guard toHeight > 0, fromHeight / toHeight >= smallestDarkening else { return 1 }
        let half = fromHeight / toHeight / 2
        return max(half.isMultiple(of: 2) ? half - 1 : half, smallestDarkening)
    }

    /// The smallest darkening square, and the scale from which a page is darkened.
    nonisolated static let smallestDarkening = 3

    /// Each pixel takes the darkest grey of the `side` x `side` square around it. A page drawn at a
    /// third of its size or less averages a template's dots and thin lines away: on a 1x display a
    /// 5 mm dot grid drew at grey 190 in the page and vanished from the thumbnails, while the
    /// tablet shows it black (#308). Darkening first keeps the marks visible, as a PDF viewer
    /// keeps a hairline one device pixel wide; the ink grows by less than one drawn pixel.
    nonisolated static func darkened(_ image: CGImage, by side: Int) -> CGImage? {
        guard side > 1 else { return image }
        let format = vImage_CGImageFormat(
            bitsPerComponent: 8, bitsPerPixel: 8, colorSpace: CGColorSpaceCreateDeviceGray(),
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue))
        guard let format, var source = try? vImage_Buffer(cgImage: image, format: format) else { return nil }
        defer { source.free() }
        guard
            var target = try? vImage_Buffer(
                width: Int(source.width), height: Int(source.height), bitsPerPixel: format.bitsPerPixel)
        else { return nil }
        defer { target.free() }
        let kernel = vImagePixelCount(side)
        guard
            vImageMin_Planar8(&source, &target, nil, 0, 0, kernel, kernel, vImage_Flags(kvImageEdgeExtend))
                == kvImageNoError
        else { return nil }
        return try? target.createCGImage(format: format)
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
