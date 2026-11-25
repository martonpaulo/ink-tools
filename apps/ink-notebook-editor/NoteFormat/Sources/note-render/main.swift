// note-render: draw one page of a `.note` file to PNG, or compare it with a reference PNG such
// as the tablet's own rendering (#261).
import Foundation
import NoteFormat

let usage = """
    usage: note-render FILE --page N --out PNG
           note-render FILE --page N --compare REF.png [--tolerance PERCENT] [--threshold GREY]
    N counts from 1, as the tablet shows it. --compare prints the share of pixels whose grey
    differs by more than GREY (default 16) and exits 1 above PERCENT (default 0.5).
    Exit codes: 0 done or within the tolerance, 1 above the tolerance, 2 usage, 3 unreadable file.
    """

enum Exit: Int32 {
    case done = 0, differs = 1, usage = 2, unreadable = 3
}

func fail(_ message: String, _ code: Exit) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(code.rawValue)
}

var arguments = Array(CommandLine.arguments.dropFirst())
guard let file = arguments.first, !file.hasPrefix("-") else { fail(usage, .usage) }
arguments.removeFirst()
var options: [String: String] = [:]
while arguments.count >= 2, arguments[0].hasPrefix("--") {
    options[String(arguments[0].dropFirst(2))] = arguments[1]
    arguments.removeFirst(2)
}
let known: Set<String> = ["page", "out", "compare", "tolerance", "threshold"]
guard arguments.isEmpty, Set(options.keys).isSubset(of: known),
      let pageText = options["page"], let page = Int(pageText), page >= 1,
      (options["out"] == nil) != (options["compare"] == nil),
      let tolerance = Double(options["tolerance"] ?? "0.5"),
      let threshold = Int(options["threshold"] ?? "16")
else { fail(usage, .usage) }

let bitmap: PageBitmap
do {
    let note = try NoteFile(data: try Data(contentsOf: URL(fileURLWithPath: file)))
    bitmap = try note.render(page: page - 1)
} catch {
    fail("\(file): \(error)", .unreadable)
}

if let out = options["out"] {
    guard let png = bitmap.pngData() else { fail("could not encode the PNG", .unreadable) }
    do {
        try png.write(to: URL(fileURLWithPath: out))
    } catch {
        fail("\(out): \(error.localizedDescription)", .unreadable)
    }
    print("page \(page): \(bitmap.width) x \(bitmap.height) -> \(out)")
} else if let reference = options["compare"] {
    let other: PageBitmap
    do {
        other = try PageBitmap(imageData: try Data(contentsOf: URL(fileURLWithPath: reference)))
    } catch {
        fail("\(reference): \(error)", .unreadable)
    }
    guard let share = bitmap.differingShare(from: other, threshold: threshold) else {
        print("page \(page): size \(bitmap.width) x \(bitmap.height), reference \(other.width) x \(other.height)")
        exit(Exit.differs.rawValue)
    }
    let percent = share * 100
    print(String(format: "page %d: %.3f %% of pixels differ by more than %d", page, percent, threshold))
    exit(percent > tolerance ? Exit.differs.rawValue : Exit.done.rawValue)
}
