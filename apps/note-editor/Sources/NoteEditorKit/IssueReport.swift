// Help › Report an Issue… (bench-apple-app-shell system-integration.md): the repository's bug form,
// with the app's version, build, release date and macOS version filled in and nothing personal.
import Foundation

public enum IssueReport {
    /// The repository's new-issue form for a bug (`.github/ISSUE_TEMPLATE/bug_report.yml`); its field
    /// ids `tool` and `version` must stay as the form declares them.
    public static func url(version: String, build: String, releaseDate: String?, macOS: String) -> URL? {
        var parts = URLComponents(string: "https://github.com/martonpaulo/ink-tools/issues/new")
        let released = releaseDate.map { ", released \($0)" } ?? ""
        parts?.queryItems = [
            URLQueryItem(name: "template", value: "bug_report.yml"),
            URLQueryItem(name: "tool", value: toolOption),
            URLQueryItem(name: "version", value: "\(version) (\(build))\(released), macOS \(macOS)"),
        ]
        return parts?.url
    }

    /// The form's dropdown option for this app.
    public static let toolOption = "Note Editor (Mac app)"
}
