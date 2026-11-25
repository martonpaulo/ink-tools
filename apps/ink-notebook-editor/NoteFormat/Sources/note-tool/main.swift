// note-tool: the measurements of #263. `diff` compares two notes page by page; `move`,
// `picture` and `text` write an edited copy through NoteWriter, the Mac route.
import Foundation
import NoteFormat

let usage = """
    usage: note-tool diff BEFORE AFTER
           note-tool move FILE --from N --to M --out FILE
           note-tool picture FILE --page N --image PNG --rect X,Y,W,H --out FILE
           note-tool text FILE --page N --text TEXT --rect X,Y,W,H [--size PX] --out FILE
    Pages count from 1, as the tablet shows them. `diff` finds each page of BEFORE in AFTER by its
    PAGEID and says which of its blocks kept their bytes; it never prints their content.
    Exit codes: 0 done, 2 usage, 3 unreadable file, 4 the edit was refused.
    """

enum Exit: Int32 {
    case done = 0, usage = 2, unreadable = 3, refused = 4
}

func fail(_ message: String, _ code: Exit) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(code.rawValue)
}

func read(_ path: String) -> NoteFile {
    do {
        return try NoteFile(data: try Data(contentsOf: URL(fileURLWithPath: path)))
    } catch {
        fail("\(path): \(error)", .unreadable)
    }
}

/// The page blocks `diff` compares besides the layers: the strokes and elements, the recognised
/// text and its file, and the text boxes.
let pageBlocks = ["TOTALPATH", "RECOGNTEXT", "RECOGNFILE", "PAGETEXTBOX"]
let footerPrefixes = ["TITLE_", "KEYWORD_", "LINKO_", "LINKI_"]

func blockBytes(_ file: NoteFile, _ address: Int?) -> ArraySlice<UInt8>? {
    guard let address, address != 0 else { return nil }
    return try? file.block(at: address)
}

func compare(_ name: String, _ before: ArraySlice<UInt8>?, _ after: ArraySlice<UInt8>?) -> String {
    switch (before, after) {
    case (nil, nil): return "\(name) absent"
    case (nil, let new?): return "\(name) added (\(new.count) bytes)"
    case (_?, nil): return "\(name) removed"
    case (let old?, let new?):
        return old == new ? "\(name) equal" : "\(name) changed (\(old.count) -> \(new.count) bytes)"
    }
}

func diff(_ beforePath: String, _ afterPath: String) {
    let before = read(beforePath), after = read(afterPath)
    print("pages: \(before.pages.count) -> \(after.pages.count)")
    let afterIndex = Dictionary(
        after.pages.enumerated().compactMap { entry in entry.element.metadata["PAGEID"].map { ($0, entry.offset) } },
        uniquingKeysWith: { first, _ in first })
    for (index, page) in before.pages.enumerated() {
        guard let id = page.metadata["PAGEID"], let found = afterIndex[id] else {
            print("page \(index + 1): not found in AFTER")
            continue
        }
        let other = after.pages[found]
        var parts = [page.metadata == other.metadata ? "metadata equal" : "metadata changed"]
        for key in NoteFile.layerKeys {
            let old = page.layers.first { $0.key == key }, new = other.layers.first { $0.key == key }
            parts.append(compare(key, blockBytes(before, old?.bitmapAddress), blockBytes(after, new?.bitmapAddress)))
        }
        for key in pageBlocks {
            parts.append(compare(key, blockBytes(before, page.metadata.address(key)),
                                 blockBytes(after, other.metadata.address(key))))
        }
        print("page \(index + 1) -> \(found + 1): " + parts.joined(separator: ", "))
    }
    for prefix in footerPrefixes {
        let old = before.footer.pairs.filter { $0.key.hasPrefix(prefix) }
        let new = after.footer.pairs.filter { $0.key.hasPrefix(prefix) }
        guard !old.isEmpty || !new.isEmpty else { continue }
        print("footer \(prefix): \(old.count) -> \(new.count), values \(old.map(\.value) == new.map(\.value) ? "equal" : "changed")")
    }
}

/// The command, its positional arguments and its `--key value` options.
func parse(_ given: [String]) -> (String, [String], [String: String]) {
    var arguments = given
    guard let command = arguments.first else { fail(usage, .usage) }
    arguments.removeFirst()
    var positional: [String] = []
    var options: [String: String] = [:]
    while let argument = arguments.first {
        arguments.removeFirst()
        if argument.hasPrefix("--") {
            guard let value = arguments.first else { fail(usage, .usage) }
            options[String(argument.dropFirst(2))] = value
            arguments.removeFirst()
        } else {
            positional.append(argument)
        }
    }
    return (command, positional, options)
}

let (command, positional, options) = parse(Array(CommandLine.arguments.dropFirst()))

func number(_ key: String) -> Int {
    guard let text = options[key], let value = Int(text), value >= 1 else { fail(usage, .usage) }
    return value - 1
}

func rect() -> PageRect {
    let parts = (options["rect"] ?? "").split(separator: ",").compactMap { Int($0) }
    guard parts.count == 4, parts[2] > 0, parts[3] > 0 else { fail(usage, .usage) }
    return PageRect(x: parts[0], y: parts[1], width: parts[2], height: parts[3])
}

func write(_ edit: () throws -> [UInt8]) {
    guard let out = options["out"] else { fail(usage, .usage) }
    do {
        try Data(try edit()).write(to: URL(fileURLWithPath: out))
    } catch {
        fail("refused: \(error)", .refused)
    }
}

switch command {
case "diff":
    guard positional.count == 2 else { fail(usage, .usage) }
    diff(positional[0], positional[1])
case "move":
    guard positional.count == 1 else { fail(usage, .usage) }
    let file = read(positional[0])
    let (from, to) = (number("from"), number("to"))
    write { try NoteWriter.movePage(file, from: from, to: to) }
case "picture":
    guard positional.count == 1, let image = options["image"] else { fail(usage, .usage) }
    let file = read(positional[0])
    let (page, area) = (number("page"), rect())
    guard let data = FileManager.default.contents(atPath: image) else { fail("\(image): unreadable", .unreadable) }
    write { try NoteWriter.drawPicture(file, page: page, imageData: data, in: area) }
case "text":
    guard positional.count == 1, let text = options["text"] else { fail(usage, .usage) }
    let file = read(positional[0])
    let (page, area) = (number("page"), rect())
    let size = Double(options["size"] ?? "48") ?? 48
    write { try NoteWriter.drawText(file, page: page, text: text, in: area, fontSize: size) }
default:
    fail(usage, .usage)
}
