/**
 * The iPhone Shortcut «Send to Supernote» (#49): its plist source shows it in the Share Sheet for
 * text and images, converts an image to JPEG (iPhone photos are HEIC, which the note does not take)
 * and shares the result, so LocalSend can take it to the tablet. The signed file next to it is the
 * one the owner imports; `shortcuts sign` writes it from this source.
 */
import {readFileSync} from 'fs';
import {join} from 'path';

const DIR = join(__dirname, '..', 'shortcuts');
const SOURCE = readFileSync(join(DIR, 'Send to Supernote.plist'), 'utf8');

/** The `<string>` values right after each `<key>name</key>`, in document order. */
function stringsAfter(key: string): string[] {
  const pattern = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`, 'g');
  return [...SOURCE.matchAll(pattern)].map(match => match[1]);
}

/** The `<string>` items of the array under `<key>name</key>`. */
function arrayAfter(key: string): string[] {
  const block = new RegExp(`<key>${key}</key>\\s*<array>([\\s\\S]*?)</array>`).exec(SOURCE);
  return block ? [...block[1].matchAll(/<string>([^<]*)<\/string>/g)].map(m => m[1]) : [];
}

test('the shortcut is offered in the Share Sheet for text and images', () => {
  expect(arrayAfter('WFWorkflowTypes')).toEqual(['ActionExtension']);
  expect(arrayAfter('WFWorkflowInputContentItemClasses').sort()).toEqual([
    'WFImageContentItem',
    'WFStringContentItem',
  ]);
});

test('an image is converted to JPEG and shared; any other input is shared as it is', () => {
  expect(stringsAfter('WFWorkflowActionIdentifier')).toEqual([
    'is.workflow.actions.detect.images',
    'is.workflow.actions.conditional',
    'is.workflow.actions.image.convert',
    'is.workflow.actions.share',
    'is.workflow.actions.conditional',
    'is.workflow.actions.share',
    'is.workflow.actions.conditional',
  ]);
  expect(stringsAfter('WFImageFormat')).toEqual(['JPEG']);
});

test('every variable names an action output the shortcut defines, and one If owns the branches', () => {
  const defined = stringsAfter('UUID');
  const used = stringsAfter('OutputUUID');
  expect(used.length).toBeGreaterThan(0);
  used.forEach(uuid => expect(defined).toContain(uuid));
  expect(new Set(stringsAfter('GroupingIdentifier')).size).toBe(1);
});

test('the signed shortcut is an Apple Encrypted Archive, as `shortcuts sign` writes it', () => {
  const signed = readFileSync(join(DIR, 'Send to Supernote.shortcut'));
  expect(signed.subarray(0, 4).toString('latin1')).toBe('AEA1');
});
