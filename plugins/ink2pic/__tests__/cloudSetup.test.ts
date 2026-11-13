import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCRIPT = path.join(__dirname, '..', 'scripts', 'cloud-setup.sh');

// Git reads neither the real user config nor a hook's GIT_DIR (#116).
const ISOLATED = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  SKILL_DECK: '',
};
for (const name of Object.keys(ISOLATED)) {
  if (name.startsWith('GIT_') && !name.startsWith('GIT_CONFIG')) {
    delete (ISOLATED as Record<string, unknown>)[name];
  }
}

/** A folder beside the project with a fake engine that prints where it was found. */
function sibling(home: string, folder: string, origin: string) {
  const dir = path.join(home, folder);
  const engine = path.join(dir, 'skills', 'project-setup', 'scripts');
  fs.mkdirSync(engine, {recursive: true});
  fs.writeFileSync(path.join(engine, 'cloud_setup.py'), `print("engine ${folder}")\n`);
  execFileSync('git', ['init', '-q', dir], {env: ISOLATED});
  execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', origin], {env: ISOLATED});
}

function runIn(home: string, env: Record<string, string> = {}) {
  const project = path.join(home, 'ink2pic', 'scripts');
  fs.mkdirSync(project, {recursive: true});
  fs.copyFileSync(SCRIPT, path.join(project, 'cloud-setup.sh'));
  return execFileSync('bash', [path.join(project, 'cloud-setup.sh'), '--dry-run'], {
    env: {...ISOLATED, ...env},
    encoding: 'utf8',
  });
}

describe('scripts/cloud-setup.sh finds Workbench (#116)', () => {
  let home: string;
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'ink2pic-cloud-'));
  });
  afterEach(() => {
    fs.rmSync(home, {recursive: true, force: true});
  });

  it('uses the folder whose origin is martonpaulo/workbench, whatever its name', () => {
    sibling(home, 'other', 'https://github.com/acme/other.git');
    sibling(home, 'workbench', 'https://github.com/martonpaulo/workbench');
    expect(runIn(home)).toContain('engine workbench');
  });

  it('still finds a checkout whose origin keeps the old skill-deck name', () => {
    sibling(home, 'deck', 'git@github.com:martonpaulo/skill-deck.git');
    expect(runIn(home)).toContain('engine deck');
  });

  it('falls back to the old skill-deck folder when no origin matches', () => {
    sibling(home, 'skill-deck', 'https://github.com/acme/other.git');
    expect(runIn(home)).toContain('engine skill-deck');
  });

  it('honours SKILL_DECK when set', () => {
    sibling(home, 'workbench', 'https://github.com/martonpaulo/workbench');
    sibling(home, 'mine', 'https://github.com/acme/other.git');
    expect(runIn(home, {SKILL_DECK: path.join(home, 'mine')})).toContain('engine mine');
  });
});
