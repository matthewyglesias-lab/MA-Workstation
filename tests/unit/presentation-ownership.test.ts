import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

describe('presentation ownership boundaries', () => {
  it('does not reinstall private global dismissal handlers in migrated components', () => {
    for (const path of ['shell/MenuButton.tsx','shell/PatientSearch.tsx','shell/SectionRail.tsx',
      'lightfully/ActionShelf.tsx','lightfully/WorkspaceTools.tsx','workflows/ClinicalRegister.tsx']) {
      expect(read('src/presentation/' + path), path).not.toMatch(/(?:document|window)\.addEventListener/);
    }
  });
  it('removes the old command deck rather than hiding a second interactive surface', () => {
    expect(existsSync(root + 'src/presentation/TebraChrome.tsx')).toBe(false);
    const shell = read('src/presentation/ClinicalDesktopShell.tsx');
    expect(shell).not.toMatch(/PowerCommandMenu|<aside[^>]*tebra-context-rail/);
    expect(shell.match(/window\.addEventListener\("keydown"/g)).toHaveLength(1);
    expect(read('src/presentation/Panel.tsx')).not.toContain('cd2004-window-titlebar');
  });
  it('keeps the pre-refinement print blocks byte-identical during screen cleanup', () => {
    // Hash of the @media print blocks at main 50f9937. Do not approve a screen
    // change by silently refreshing this print contract.
    const blocks: string[] = [];
    postcss.parse(read('src/presentation/clinical-desktop.css')).walkAtRules('media', rule => {
      if (/\bprint\b/.test(rule.params)) blocks.push(rule.toString());
    });
    expect(createHash('sha256').update(blocks.join('\n')).digest('hex'))
      .toBe('d0fee23b568827ee6895802c72f95207c030722bf92eaa961e593a416b8d3251');
  });
});
