/**
 * Lasso Actions downloads the language packs (#503): it holds the `INTERNET` permission, and
 * Handwriting Language, with none, only reads the store. This module turns the shared
 * `@ink-tools/pack-store` flow into what the person sees: the question with the size first, and
 * each missing requirement or failure as ui-kit's Needs or Error problem, never a silent no-op.
 */
import {
  PACK_CONFIG,
  PackErrorCode,
  PackFailure,
  PackQuestion,
  PackRequirement,
} from '@ink-tools/pack-store';
import type {Problem} from '@ink-tools/ui-kit';
import {packCopy} from './copy';

const MEGABYTE = 1024 * 1024;
/** Sizes from this many megabytes show whole; smaller ones show one decimal, the tenths below. */
const WHOLE_FROM = 10;
const TENTHS = 10;
const SMALLEST = 1 / TENTHS;

/** A size as the person reads it: whole megabytes from 10 MB, one decimal below, at least 0.1 MB. */
export function sizeText(bytes: number): string {
  const megabytes = bytes / MEGABYTE;
  const shown =
    megabytes >= WHOLE_FROM
      ? Math.round(megabytes)
      : Math.max(SMALLEST, Math.round(megabytes * TENTHS) / TENTHS);
  return `${shown} MB`;
}

/** The question before a download: the size first, again for a new version, and the metered warning. */
export function packQuestionText(question: PackQuestion, languageName: string): string {
  const size = sizeText(question.bytes);
  const ask = question.replaces
    ? packCopy.askUpdate(languageName, size, question.replaces)
    : packCopy.ask(languageName, size);
  return question.metered ? `${packCopy.metered} ${ask}` : ask;
}

function needLine(requirement: PackRequirement, bytes: number): {what: string; step: string} {
  switch (requirement) {
    case 'network':
      return {what: packCopy['needs.network'], step: packCopy['needs.networkFix']};
    case 'shared-folder':
      return {what: packCopy['needs.sharedFolder'], step: packCopy['needs.sharedFolderFix']};
    case 'free-space':
      return {
        what: packCopy['needs.freeSpace'],
        step: packCopy['needs.freeSpaceFix'](sizeText(bytes + PACK_CONFIG.freeSpaceMarginBytes)),
      };
  }
}

/** The Needs problem of a download: each missing piece and the one step that fixes it. */
export function packNeedsProblem(missing: readonly PackRequirement[], bytes: number): Problem {
  const lines = missing.map(requirement => needLine(requirement, bytes));
  return {
    what: packCopy['needs.what'],
    reason: lines.map(line => line.what).join(' '),
    fix: {steps: lines.map(line => line.step)},
  };
}

const FAILURE_TEXT: Record<PackErrorCode, string> = {
  HASH_MISMATCH: packCopy['error.hash'],
  SIZE_MISMATCH: packCopy['error.size'],
  TOO_LARGE: packCopy['error.tooLarge'],
  BAD_CATALOG: packCopy['error.catalog'],
  NOT_INSTALLED: packCopy['error.notInstalled'],
  HOST: packCopy['error.host'],
};

/** The Error problem of a failed download; the failure's own message goes to the log, not the view. */
export function packFailureProblem(failure: PackFailure): Problem {
  return {what: packCopy['error.what'], reason: FAILURE_TEXT[failure.code]};
}
