import Foundation

// The adapters of `TabletRoute`, one per route of Settings › Tablet (owner, 2026-11-27, #496). A
// route not built yet declares what it will need and allow, and reads off; its issue fills it in.

/// A `.note` file already on this Mac: read and made here; an edit saved here waits for #362.
public struct FileRoute: TabletRoute {
    public let id = "file"
    public let capabilities: Set<RouteCapability> = [.read, .create, .saveOnMac]
    public let requirements: [RouteRequirement] = [.noteFileOnMac]
    public let registryItems = ["notefile.format-versions"]
    public let speed = RouteSpeed.instant
    public let folders: [URL]

    /// `index`: the folder of the text index of every note read.
    public init(index: URL) {
        folders = [index]
    }

    /// Saving an edit on the Mac waits for the Mac's writer (#362).
    public func status(for capability: RouteCapability) -> RouteStatus {
        capability == .saveOnMac ? .notBuilt(issue: 362) : .available
    }
}

/// Advanced mode as it runs today: adb by USB or Wi-Fi through the developer tool `inkctl`, and
/// the helper inside Device Link for edits; #498 builds it into the app.
public struct InkctlRoute: TabletRoute {
    public let id = "advancedAdb"
    public let capabilities: Set<RouteCapability> = [.read, .create, .sendToTablet, .sendToMac, .saveOnTablet]
    public let requirements: [RouteRequirement] = [.sideloadingOn, .deviceLinkPlugin, .cableOrWiFi]
    public let registryItems = ["notefile.format-versions", "storage.helper-channel"]
    public let speed = RouteSpeed.cableOrWiFi
    public let folders: [URL]
    private let inkctl: @Sendable () -> Bool

    /// `copies`: the copies from the tablet and their backups; `inkctlFound` looks for inkctl now.
    public init(copies: [URL], inkctlFound: @escaping @Sendable () -> Bool) {
        folders = copies
        inkctl = inkctlFound
    }

    public func status(for capability: RouteCapability) -> RouteStatus {
        inkctl() ? .available : .notBuilt(issue: 498)
    }
}

/// The tablet's own Browse & Access over Wi-Fi (#497): nothing installed on the tablet.
public struct BrowseAccessRoute: TabletRoute {
    public let id = "browseAccess"
    public let capabilities: Set<RouteCapability> = [.read, .create, .sendToTablet, .sendToMac]
    public let requirements: [RouteRequirement] = [.sameWiFi, .browseAndAccessOn]
    public let registryItems: [String] = []
    public let speed = RouteSpeed.wiFi
    public let folders: [URL] = []

    public init() {}

    public func status(for capability: RouteCapability) -> RouteStatus { .notBuilt(issue: 497) }
}

/// The Device Link plugin, which Note Editor reaches with the LocalSend protocol itself (#493).
public struct DeviceLinkRoute: TabletRoute {
    public let id = "deviceLink"
    public let capabilities: Set<RouteCapability> = [.read, .create, .sendToTablet, .sendToMac, .saveOnTablet]
    public let requirements: [RouteRequirement] = [.deviceLinkPlugin, .sameWiFi]
    public let registryItems: [String] = []
    public let speed = RouteSpeed.wiFi
    public let folders: [URL] = []

    public init() {}

    public func status(for capability: RouteCapability) -> RouteStatus { .notBuilt(issue: 493) }
}

/// The person's Supernote Cloud account (#363), which applies an edit on the tablet's behalf.
public struct SupernoteCloudRoute: TabletRoute {
    public let id = "supernoteCloud"
    public let capabilities: Set<RouteCapability> = [.read, .sendToMac, .saveInCloud]
    public let requirements: [RouteRequirement] = [.cloudAccount]
    public let registryItems: [String] = []
    public let speed = RouteSpeed.internet
    public let folders: [URL] = []

    public init() {}

    public func status(for capability: RouteCapability) -> RouteStatus { .notBuilt(issue: 363) }
}
