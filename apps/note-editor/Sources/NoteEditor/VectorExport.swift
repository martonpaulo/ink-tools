import AppKit
import CoreGraphics
import CoreText
import Foundation
import ImageIO
import NoteEditorKit
import NoteFormat
import SwiftUI
import UniformTypeIdentifiers

/// A note's ink as vectors (#365): each stroke the outline the tablet fills, as a PDF of the note or
/// an SVG of one page, sharp at any zoom. The template stays the raster the reader draws, under the
/// ink, since a template is a bitmap in the file; a picture stays its image, a text box its text.
nonisolated enum VectorExport {
    /// One stroke's ink: its path in page pixels, filled, and its pen tone's grey.
    struct Ink {
        let path: CGPath
        let grey: UInt8
    }

    /// The ink of `elements`, one path per stroke, in record order; pictures and text boxes have
    /// none.
    static func ink(_ elements: [PageElement]) -> [Ink] {
        elements.compactMap { element in
            guard case .stroke(let penColor, _) = element.content else { return nil }
            // shortcut: only black (0) is measured on a fixture, as `PageElement.Content` says; a
            // record colour that is no pen tone draws black. Upgrade with the device round of #327.
            let grey = UInt8((PenTone(rawValue: penColor) ?? .black).rawValue)
            if let rings = element.outline {
                let path = CGMutablePath()
                for ring in rings {
                    path.addLines(between: ring)
                    path.closeSubpath()
                }
                return Ink(path: path, grey: grey)
            }
            let line = CGMutablePath()
            line.addLines(between: element.points)
            // A stroke whose outline does not read is drawn along its points, as thin as a lifted
            // stroke whose box gives no width.
            return Ink(
                path: line.copy(
                    strokingWithWidth: LiftedInk.thinnestStroke, lineCap: .round, lineJoin: .round, miterLimit: 1),
                grey: grey)
        }
    }

    /// The elements of page `index` on a layer the page shows, as the page view draws them.
    static func shownElements(of note: NoteFile, page index: Int) throws -> [PageElement] {
        let visibility = note.pages[index].visibility
        return try note.elements(page: index).filter { element in
            let name = element.layer == 0 ? "MAINLAYER" : "LAYER\(element.layer)"
            return visibility.isEmpty || (visibility[name] ?? (name == "MAINLAYER"))
        }
    }

    /// The whole note as a PDF, one page per note page, each as large as the page on paper.
    static func pdf(note: NoteFile) throws -> Data {
        let data = NSMutableData()
        guard let consumer = CGDataConsumer(data: data), let context = CGContext(consumer: consumer, mediaBox: nil, nil)
        else { throw PageExport.ExportError.noImage }
        let scale = PageExport.pointsPerInch / PageExport.dotsPerInch
        for index in note.pages.indices {
            let template = try PageExport.template(of: note, page: index)
            let size = CGSize(width: template.width, height: template.height)
            var box = CGRect(x: 0, y: 0, width: size.width * scale, height: size.height * scale)
            let info = [kCGPDFContextMediaBox as String: Data(bytes: &box, count: MemoryLayout<CGRect>.size)]
            context.beginPDFPage(info as CFDictionary)
            context.scaleBy(x: scale, y: scale)
            // Page pixels from the top left, as the reader stores them.
            context.translateBy(x: 0, y: size.height)
            context.scaleBy(x: 1, y: -1)
            context.interpolationQuality = .high
            draw(template, in: CGRect(origin: .zero, size: size), on: context)
            for element in try shownElements(of: note, page: index) {
                switch element.content {
                case .stroke:
                    for ink in ink([element]) {
                        context.setFillColor(gray: CGFloat(ink.grey) / CGFloat(UInt8.max), alpha: 1)
                        context.addPath(ink.path)
                        context.fillPath(using: .winding)
                    }
                case .picture(let png):
                    if let image = image(png) { draw(image, in: element.bounds, on: context) }
                case .textBox(let text, let fontSize):
                    drawText(text, fontSize: fontSize, in: element.bounds, on: context)
                }
            }
            context.endPDFPage()
        }
        context.closePDF()
        return data as Data
    }

    /// Page `index` as an SVG document in page pixels.
    static func svg(note: NoteFile, page index: Int) throws -> String {
        let template = try PageExport.template(of: note, page: index)
        let (width, height) = (template.width, template.height)
        var body = [
            #"<svg xmlns="http://www.w3.org/2000/svg" width="\#(width)" height="\#(height)" viewBox="0 0 \#(width) \#(height)">"#,
            image(png: try PageExport.png(template), in: CGRect(x: 0, y: 0, width: width, height: height)),
        ]
        for element in try shownElements(of: note, page: index) {
            switch element.content {
            case .stroke:
                for ink in ink([element]) {
                    let grey = String(format: "#%02X%02X%02X", ink.grey, ink.grey, ink.grey)
                    body.append(#"<path fill="\#(grey)" fill-rule="nonzero" d="\#(pathData(ink.path))"/>"#)
                }
            case .picture(let png):
                body.append(image(png: png, in: element.bounds))
            case .textBox(let text, let fontSize):
                let box = element.bounds
                let lines = text.split(separator: "\n", omittingEmptySubsequences: false).enumerated().map {
                    #"<tspan x="\#(number(box.minX))" dy="\#($0.offset == 0 ? "1em" : "1.2em")">\#(escaped(String($0.element)))</tspan>"#
                }
                body.append(
                    #"<text x="\#(number(box.minX))" y="\#(number(box.minY))" font-family="sans-serif" font-size="\#(number(fontSize))">\#(lines.joined())</text>"#
                )
            }
        }
        body.append("</svg>")
        return body.joined(separator: "\n") + "\n"
    }

    // MARK: Drawing

    /// Draws `image` upright in `rect` of a context whose y axis runs down.
    private static func draw(_ image: CGImage, in rect: CGRect, on context: CGContext) {
        context.saveGState()
        context.translateBy(x: rect.minX, y: rect.maxY)
        context.scaleBy(x: 1, y: -1)
        context.draw(image, in: CGRect(origin: .zero, size: rect.size))
        context.restoreGState()
    }

    /// Draws `text` in black, wrapped in `rect`, of a context whose y axis runs down.
    private static func drawText(_ text: String, fontSize: Double, in rect: CGRect, on context: CGContext) {
        let font = CTFontCreateUIFontForLanguage(.system, fontSize, nil)
        let attributes: [NSAttributedString.Key: Any] = [
            NSAttributedString.Key(kCTFontAttributeName as String): font as Any,
            NSAttributedString.Key(kCTForegroundColorAttributeName as String): CGColor(gray: 0, alpha: 1),
        ]
        let setter = CTFramesetterCreateWithAttributedString(NSAttributedString(string: text, attributes: attributes))
        // The frame may need more height than the box holds; the text stays readable below it.
        let height = max(
            rect.height,
            CTFramesetterSuggestFrameSizeWithConstraints(
                setter, CFRange(), nil, CGSize(width: rect.width, height: .greatestFiniteMagnitude), nil
            ).height)
        let frame = CTFramesetterCreateFrame(
            setter, CFRange(), CGPath(rect: CGRect(x: 0, y: 0, width: rect.width, height: height), transform: nil), nil)
        context.saveGState()
        context.translateBy(x: rect.minX, y: rect.minY + height)
        context.scaleBy(x: 1, y: -1)
        context.textMatrix = .identity
        CTFrameDraw(frame, context)
        context.restoreGState()
    }

    private static func image(_ png: Data) -> CGImage? {
        CGImageSourceCreateWithData(png as CFData, nil).flatMap { CGImageSourceCreateImageAtIndex($0, 0, nil) }
    }

    // MARK: SVG text

    private static func image(png: Data, in rect: CGRect) -> String {
        #"<image x="\#(number(rect.minX))" y="\#(number(rect.minY))" width="\#(number(rect.width))" height="\#(number(rect.height))" preserveAspectRatio="none" href="data:image/png;base64,\#(png.base64EncodedString())"/>"#
    }

    /// The SVG path data of `path`: moves, lines and closes, as the outlines and the strokes'
    /// widened lines hold, and curves for the round caps.
    static func pathData(_ path: CGPath) -> String {
        var parts: [String] = []
        path.applyWithBlock { element in
            let points = element.pointee.points
            let pair = { (point: CGPoint) in "\(number(point.x)) \(number(point.y))" }
            switch element.pointee.type {
            case .moveToPoint: parts.append("M" + pair(points[0]))
            case .addLineToPoint: parts.append("L" + pair(points[0]))
            case .addQuadCurveToPoint: parts.append("Q" + pair(points[0]) + " " + pair(points[1]))
            case .addCurveToPoint:
                parts.append("C" + pair(points[0]) + " " + pair(points[1]) + " " + pair(points[2]))
            case .closeSubpath: parts.append("Z")
            @unknown default: break
            }
        }
        return parts.joined()
    }

    /// A coordinate with at most two decimals, the precision of a 300 dpi pixel's hundredth.
    static func number(_ value: CGFloat) -> String {
        let rounded = (value * 100).rounded() / 100
        return rounded == rounded.rounded() ? String(Int(rounded)) : String(format: "%.2f", rounded)
    }

    static func escaped(_ text: String) -> String {
        text.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
    }
}

/// File › Export as Vector PDF… (the note) and Export Page as SVG… (the page in view; an SVG holds
/// one page), each to a file the save panel names after the note (#365).
struct ExportCommands: View {
    @FocusedValue(\.pageImages) private var pages
    @FocusedValue(\.pageNavigator) private var navigator
    @FocusedValue(\.noteText) private var text

    /// The note's file name, which the exported file takes.
    private var name: String {
        text.map { $0.name.isEmpty ? Copy.untitledNote : $0.name } ?? Copy.untitledNote
    }

    var body: some View {
        let page = navigator?.wrappedValue.index
        Button(Copy.exportVectorPDF) {
            guard let note = pages?.note else { return }
            Self.save(name: name, type: .pdf) { try VectorExport.pdf(note: note) }
        }
        .disabled(pages == nil)
        .help(Copy.exportVectorHelp)
        Button(Copy.exportPageSVG) {
            guard let note = pages?.note, let page else { return }
            Self.save(name: PageExport.name(note: name, page: page), type: .svg) {
                Data(try VectorExport.svg(note: note, page: page).utf8)
            }
        }
        .disabled(pages == nil || page == nil)
        .help(Copy.exportVectorHelp)
    }

    /// Asks where to save, then writes what `make` gives; a failure says why in an alert.
    static func save(name: String, type: UTType, make: () throws -> Data) {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [type]
        panel.nameFieldStringValue = name
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            try make().write(to: url, options: .atomic)
        } catch {
            let alert = NSAlert()
            alert.messageText = Copy.exportFailed
            alert.informativeText = error.localizedDescription
            alert.runModal()
        }
    }
}
