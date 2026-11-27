// The tablet's page templates for Edit › Insert Page… (#451), as `inkctl --json note templates`
// answers them from Device Link's helper: the system templates by name, the custom ones, the PNGs
// straight in `MyStyle/`, by full path. Each is the value the helper's `insertPage` takes.
import Foundation

/// A template an added page may take.
public struct PageTemplateChoice: Sendable, Hashable, Identifiable {
    /// The name the tablet lists: a system name (`style_white`) or a custom file's name (`week`).
    public let name: String
    /// What `insertPage` takes: the system name, or the custom PNG's full path.
    public let value: String
    public let isCustom: Bool

    public var id: String { value }

    public static func system(_ name: String) -> PageTemplateChoice {
        PageTemplateChoice(name: name, value: name, isCustom: false)
    }

    public static func custom(name: String, path: String) -> PageTemplateChoice {
        PageTemplateChoice(name: name, value: path, isCustom: true)
    }

    /// The choice an edit's template value names: a full path is a custom template's.
    public static func of(value: String) -> PageTemplateChoice {
        value.hasPrefix("/")
            ? .custom(name: ((value as NSString).lastPathComponent as NSString).deletingPathExtension, path: value)
            : .system(value)
    }

    /// Whether a page of `style` (as the note file names it) is on this template. A custom page's
    /// style reads `user_<file name>` (`docs/supernote.md` › Note file format). shortcut: whether
    /// that name keeps the `.png` is not measured, so both forms match; keep one once a round reads it.
    public func matches(style: String) -> Bool {
        guard isCustom else { return PageTemplate.systemName(ofStyle: style) == value }
        let file = (value as NSString).lastPathComponent
        return style == "user_\(file)" || style == "user_\((file as NSString).deletingPathExtension)"
    }
}

public enum TabletTemplates {
    public enum ParseError: Error, Equatable { case notATemplateList }

    /// The choices of inkctl's answer, system first, in the tablet's order; an answer with no
    /// system template or an entry without its name or path is not a list.
    public static func parse(_ data: Data) throws(ParseError) -> [PageTemplateChoice] {
        struct Entry: Decodable {
            let name: String
            let path: String?
        }
        struct Answer: Decodable {
            let system: [Entry]
            let custom: [Entry]
        }
        guard let answer = try? JSONDecoder().decode(Answer.self, from: data), !answer.system.isEmpty,
            answer.system.allSatisfy({ !$0.name.isEmpty }),
            answer.custom.allSatisfy({ !$0.name.isEmpty && $0.path?.isEmpty == false })
        else { throw .notATemplateList }
        return answer.system.map { .system($0.name) }
            + answer.custom.map { .custom(name: $0.name, path: $0.path ?? "") }
    }

    /// `choices` with the template of a page of `style` first, when one matches; else unchanged.
    public static func ordered(_ choices: [PageTemplateChoice], first style: String?) -> [PageTemplateChoice] {
        guard let style, let index = choices.firstIndex(where: { $0.matches(style: style) }) else { return choices }
        var ordered = choices
        ordered.insert(ordered.remove(at: index), at: 0)
        return ordered
    }
}
