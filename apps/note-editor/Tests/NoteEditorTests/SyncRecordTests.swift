import Foundation
import NoteEditorKit
import Testing

/// The editor's one sync record (#448): the status and the list derived from what both paths
/// report.
@Suite struct SyncRecordTests {
    static let start = Date(timeIntervalSinceReferenceDate: 800_000_000)
    static let unplugged = SyncProblem(message: "no tablet answered", action: .connectTablet)
    static let stale = SyncProblem(message: "the note changed on the tablet", action: .retry)

    static func at(_ seconds: Double) -> Date { start.addingTimeInterval(seconds) }

    @Test func nothingKnownHasNoStatus() {
        #expect(SyncRecord().status == nil)
    }

    @Test func theFirstPullIsReceivingNeverSynced() {
        var record = SyncRecord()
        record.began(.received, note: "Diary", page: nil, at: Self.at(0))
        #expect(record.status == .receiving)
    }

    @Test func aSendInProgressWinsOverAPull() {
        var record = SyncRecord()
        record.began(.received, note: "Diary", page: nil, at: Self.at(0))
        record.began(.sent, note: "Diary", page: 2, at: Self.at(1))
        #expect(record.status == .sending)
    }

    @Test func doneBothWaysIsUpToDateAtTheNewest() {
        var record = SyncRecord()
        let pull = record.began(.received, note: "Diary", page: nil, at: Self.at(0))
        record.ended(pull, at: Self.at(2))
        let send = record.began(.sent, note: "Diary", page: 2, at: Self.at(5))
        record.ended(send, at: Self.at(7))
        #expect(record.status == .upToDate(Self.at(7)))
        record.confirmed(at: Self.at(9))
        #expect(record.status == .upToDate(Self.at(9)))
    }

    @Test func theListIsNewestFirstWithEachEventsFields() {
        var record = SyncRecord()
        let pull = record.began(.received, note: "Diary", page: nil, at: Self.at(0))
        record.ended(pull, at: Self.at(1))
        let send = record.began(.sent, note: "Diary", page: 3, at: Self.at(2))
        record.failed(send, Self.stale, at: Self.at(3))
        let newest = record.events[0]
        #expect(newest.direction == .sent)
        #expect(newest.note == "Diary")
        #expect(newest.page == 3)
        #expect(newest.time == Self.at(3))
        #expect(newest.result == .failed(Self.stale))
        #expect(record.events[1].direction == .received)
        #expect(record.events[1].page == nil)
        #expect(record.events[1].result == .done)
    }

    @Test func aRefusedSendStaysAProblemAfterAGoodPull() {
        var record = SyncRecord()
        let send = record.began(.sent, note: "Diary", page: 1, at: Self.at(0))
        record.failed(send, Self.stale, at: Self.at(1))
        let pull = record.began(.received, note: "Diary", page: nil, at: Self.at(2))
        record.ended(pull, at: Self.at(3))
        record.confirmed(at: Self.at(5))
        #expect(record.status == .problem(.sent, Self.stale))
        let again = record.began(.sent, note: "Diary", page: 1, at: Self.at(6))
        record.ended(again, at: Self.at(7))
        #expect(record.status == .upToDate(Self.at(7)))
    }

    @Test func aFailedLookClearsOnceALaterLookEndsWell() {
        var record = SyncRecord()
        record.failed(.received, note: "Diary", page: nil, Self.unplugged, at: Self.at(0))
        #expect(record.status == .problem(.received, Self.unplugged))
        record.confirmed(at: Self.at(2))
        #expect(record.status == .upToDate(Self.at(2)))
    }

    @Test func aConfirmBeforeTheFailureDoesNotClearIt() {
        var record = SyncRecord()
        record.confirmed(at: Self.at(0))
        record.failed(.received, note: "Diary", page: nil, Self.unplugged, at: Self.at(2))
        #expect(record.status == .problem(.received, Self.unplugged))
    }

    @Test func aTabletLeftUnpluggedFillsOneRow() {
        var record = SyncRecord()
        for look in 0..<1800 {
            record.failed(.received, note: "Diary", page: nil, Self.unplugged, at: Self.at(Double(look) * 2))
        }
        #expect(record.events.count == 1)
        #expect(record.events[0].time == Self.at(3598))
    }

    @Test func aDifferentFailureGetsItsOwnRow() {
        var record = SyncRecord()
        record.failed(.received, note: "Diary", page: nil, Self.unplugged, at: Self.at(0))
        record.failed(.received, note: "Diary", page: nil, Self.stale, at: Self.at(2))
        #expect(record.events.count == 2)
    }

    @Test func theRecordKeepsTheTenNewest() {
        var record = SyncRecord()
        for send in 0..<15 {
            let id = record.began(.sent, note: "Diary", page: send, at: Self.at(Double(send)))
            record.ended(id, at: Self.at(Double(send) + 0.5))
        }
        #expect(record.events.count == SyncRecord.shown)
        #expect(record.events.map(\.page) == Array((5..<15).reversed()))
    }

    @Test func tenSendsDuringAPullKeepThePull() {
        var record = SyncRecord()
        let pull = record.began(.received, note: "Diary", page: nil, at: Self.at(0))
        for send in 1...12 {
            let id = record.began(.sent, note: "Diary", page: send, at: Self.at(Double(send)))
            record.ended(id, at: Self.at(Double(send) + 0.5))
        }
        #expect(record.events.count == SyncRecord.shown)
        #expect(record.events.contains { $0.id == pull })
        #expect(record.status == .receiving)
        record.ended(pull, at: Self.at(20))
        #expect(record.events[0].id == pull)
        #expect(record.status == .upToDate(Self.at(20)))
    }

    @Test func anUnknownIDChangesNothing() {
        var record = SyncRecord()
        let send = record.began(.sent, note: "Diary", page: 0, at: Self.at(0))
        let before = record
        record.ended(send + 40, at: Self.at(1))
        record.failed(send + 41, Self.stale, at: Self.at(1))
        #expect(record == before)
    }

    @Test func eachFailureOffersItsOneAction() {
        #expect(InkctlFailure.notConnected("x").syncAction == .connectTablet)
        #expect(InkctlFailure.failed("x").syncAction == .retry)
        #expect(InkctlFailure.notFound("x").syncAction == .retry)
        #expect(InkctlFailure.missing.syncAction == nil)
        #expect(InkctlFailure.cancelled.syncAction == nil)
        #expect(WriteFailure.tablet(.notConnected("x")).syncAction == .connectTablet)
        #expect(WriteFailure.staleBase.syncAction == .retry)
        #expect(WriteFailure.openOnTablet.syncAction == .retry)
        #expect(WriteFailure.untouchedPagesChanged([2]).syncAction == nil)
        #expect(WriteFailure.conflict("/Note/a conflict.note").syncAction == nil)
        #expect(WriteFailure.restoreConflict("/Note/a conflict.note").syncAction == nil)
        #expect(WriteFailure.conflictNotApplied("/Note/a conflict.note", reason: "x").syncAction == nil)
    }
}
