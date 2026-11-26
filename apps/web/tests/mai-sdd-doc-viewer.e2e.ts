// Keyless assembled-browser coverage for the local SDD document viewer plugin:
// one deterministic workspace, the real right Sidebar guide entry, and the
// plugin's own read-only panel. No overlay, no model call, no API key.
//
// The plugin reads `mai-specs` through `remote.workspaceFiles.list`/`read` only,
// so every mutation below is a plain file write to the scaffold's temp
// workspace; the page observes it through the plugin's own Reload control.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Locator } from 'playwright'
import { expect, it, onTestFailed } from 'vitest'
import { launchWebScaffold, seedSession, watchConsole, type WebScaffold } from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const PLUGIN_DIR = fileURLToPath(new URL('../../../plugins/mai-sdd-doc-viewer', import.meta.url))
const PLUGIN_NAME = '@local/mai-sdd-doc-viewer'
/** Guide entry and tab kind the plugin registers. */
const GUIDE_ENTRY = 'mai-sdd-documents'
const SESSION_SEED = fileURLToPath(new URL('../../../snapshots/web/seeded-history/session.v3.jsonl', import.meta.url))
const SESSION_ID = 'session-c4421b66-252e-44c0-80ed-6e320abeba25'
const SESSION_TITLE = 'SDD documents session'

const PRD_PATH = 'mai-specs/999-alpha/spec/PRD.md'
const TECH_DESIGN_PATH = 'mai-specs/998-beta/design/TECH_DESIGN.md'
const ADDED_PATH = 'mai-specs/998-beta/design/RISKS.md'
const DOCUMENT_ORDER = ['mai-specs/998-beta/design/TECH_DESIGN.md', 'mai-specs/999-alpha/BRIEF.md', PRD_PATH]
const EMPTY_FEATURE_COPY = 'No Markdown documents were found.'
const MISSING_DOCUMENT_COPY = 'The selected document no longer exists. Select another document.'

/**
 * Write the deterministic `mai-specs` tree: three previewable documents, an
 * empty feature, and root-level or non-feature entries the plugin must skip.
 * @param root - the scaffold workspace directory.
 */
async function writeWorkspace(root: string): Promise<void> {
  const specs = join(root, 'mai-specs')
  await mkdir(join(specs, '999-alpha', 'spec'), { recursive: true })
  await mkdir(join(specs, '998-beta', 'design'), { recursive: true })
  await mkdir(join(specs, '997-empty'), { recursive: true })
  await mkdir(join(specs, '_templates'), { recursive: true })
  await mkdir(join(specs, 'notes'), { recursive: true })
  await writeFile(join(specs, 'README.md'), '# Specs\n\nWorkspace index.\n')
  await writeFile(join(specs, 'ROADMAP.md'), '# Roadmap\n\n- 999 alpha\n')
  await writeFile(join(specs, '_templates', 'PRD.tmpl.md'), '# Template PRD\n\nTemplate body.\n')
  await writeFile(join(specs, 'notes', 'STYLE.md'), '# Style guide\n\nNot a feature.\n')
  await writeFile(join(specs, '999-alpha', 'BRIEF.md'), '# Alpha brief\n\nAlpha brief body.\n')
  await writeFile(join(specs, '999-alpha', 'spec', 'PRD.md'), '# Alpha product requirements\n\nAlpha requirement body.\n')
  await writeFile(join(specs, '998-beta', 'design', 'TECH_DESIGN.md'), '# Beta technical design\n\nBeta design body.\n')
  await writeFile(join(specs, '998-beta', 'notes.txt'), 'not a document\n')
}

/**
 * Bring the guide page forward, whether it is already the active page or the
 * strip offers its add control instead.
 * @param column - the right Sidebar column.
 */
async function showGuide(column: Locator): Promise<void> {
  const guide = column.locator('[data-sidebar-right-guide]')
  if (await guide.count() > 0) return
  const add = column.locator('[data-dockkit-add-tab]').first()
  await expect.poll(async () => await guide.count() > 0 || await add.count() > 0, { timeout: 20_000 }).toBe(true)
  if (await guide.count() === 0) await add.click()
  await expect.poll(() => guide.count(), { timeout: 10_000 }).toBeGreaterThan(0)
}

/**
 * Return the plugin's guide entry after making the guide page visible.
 * @param column - the right Sidebar column.
 * @returns the guide entry locator.
 */
async function guideEntry(column: Locator): Promise<Locator> {
  await showGuide(column)
  const entry = column.locator(`[data-sidebar-right-guide-entry="${GUIDE_ENTRY}"]`)
  await expect.poll(() => entry.count(), { timeout: 20_000 }).toBe(1)
  return entry
}

it('browses SDD Markdown documents from the right Sidebar and survives a plugin reload', async () => {
  const savedKey = process.env.DEEPSEEK_API_KEY
  delete process.env.DEEPSEEK_API_KEY
  let scaffold: WebScaffold | undefined
  let browser: Browser | undefined
  try {
    scaffold = await launchWebScaffold({ extraInstallAnchors: [join(PLUGIN_DIR, 'package.json')] })
    await writeWorkspace(scaffold.workspaceCwd)
    const workspace = await scaffold.ctx.workspaceRegistry.create(scaffold.workspaceCwd)
    const sessionId = await seedSession(scaffold, await readFile(SESSION_SEED, 'utf8'), SESSION_ID)
    await workspace.attachSession(sessionId)
    await scaffold.ctx.sessionController.rename({ sessionId, title: SESSION_TITLE })
    let entryId = await scaffold.ctx.loader.create({ name: PLUGIN_NAME })

    browser = await chromium.launch()
    const page = await newEnglishPage(browser)
    const console = watchConsole(page)
    const consoleLines: string[] = []
    page.on('console', (message) => { consoleLines.push(message.text()) })
    onTestFailed(() => saveFailureShot(page, 'web-e2e-mai-sdd-doc-viewer'))
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })

    // Keyless lane: the seeded Session and its workspace open with no API-key
    // prompt, and the composer is usable without one.
    await expect.poll(() => page.getByRole('dialog').count(), { timeout: 10_000 }).toBe(0)
    expect(await page.getByText(/API key/iu).filter({ visible: true }).count()).toBe(0)

    const row = page.getByRole('treeitem').filter({ has: page.getByText(SESSION_TITLE, { exact: true }) })
    await row.waitFor({ timeout: 20_000 })
    await row.click()
    await page.locator('[data-sidebar-right-expand]').waitFor({ timeout: 20_000 })
    await page.locator('[data-sidebar-right-expand]').click()

    const column = page.locator('[data-rightbar-col]')
    const entry = await guideEntry(column)
    expect(await entry.innerText()).toContain('SDD documents')
    await entry.click()

    const panel = page.locator('[data-mai-sdd-doc-viewer]')
    await panel.waitFor({ timeout: 20_000 })
    expect(await panel.getByText('SDD documents', { exact: true }).count()).toBe(1)
    expect(await panel.getByRole('button', { name: 'Reload', exact: true }).count()).toBe(1)

    const tree = panel.locator('[data-mai-sdd-tree]')
    const preview = panel.locator('[data-mai-sdd-preview]')
    await expect.poll(() => tree.getByRole('button', { name: '999-alpha', exact: true }).count(), { timeout: 20_000 })
      .toBe(1)

    // Features are expanded by default, in numeric feature order, and the
    // empty feature renders the English empty copy while keeping its node.
    for (const feature of ['997-empty', '998-beta', '999-alpha']) {
      await expect.poll(() => tree.getByRole('button', { name: feature, exact: true }).getAttribute('aria-expanded'),
        { timeout: 10_000 }).toBe('true')
    }
    const expandedLabels = await tree.locator('button[aria-expanded]').evaluateAll(nodes => nodes.map(node =>
      (node.textContent ?? '').replace(/[▾▸]/gu, '').trim()))
    expect(expandedLabels.filter(label => /^(997|998|999)-/u.test(label))).toEqual(['997-empty', '998-beta', '999-alpha'])
    await expect.poll(() => tree.getByText(EMPTY_FEATURE_COPY, { exact: true }).count(), { timeout: 10_000 }).toBe(1)

    // Directories start collapsed; expanding each one reveals its documents.
    for (const directory of ['design', 'spec']) {
      await expect.poll(() => tree.getByRole('button', { name: directory, exact: true }).getAttribute('aria-expanded'),
        { timeout: 10_000 }).toBe('false')
    }
    for (const hidden of [PRD_PATH, TECH_DESIGN_PATH]) {
      expect(await tree.getByRole('button', { name: hidden, exact: true }).count()).toBe(0)
    }
    await tree.getByRole('button', { name: 'design', exact: true }).click()
    await tree.getByRole('button', { name: 'spec', exact: true }).click()

    const documentButtons = tree.locator('button[aria-label]')
    await expect.poll(() => documentButtons.count(), { timeout: 15_000 }).toBe(3)
    const documents = await documentButtons.evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label') ?? ''))
    expect([...documents].sort()).toEqual([...DOCUMENT_ORDER].sort())
    for (const excluded of ['README.md', 'ROADMAP.md', 'PRD.tmpl.md', 'notes.txt', 'STYLE.md', '_templates', 'notes']) {
      expect(await tree.getByText(excluded, { exact: true }).count()).toBe(0)
    }

    // Selecting a document shows its full relative path and rendered heading,
    // and marks only that row as current.
    await tree.getByRole('button', { name: PRD_PATH, exact: true }).click()
    await expect.poll(() => preview.getByText(PRD_PATH, { exact: true }).count(), { timeout: 15_000 }).toBe(1)
    await expect.poll(() => preview.getByRole('heading', { name: 'Alpha product requirements', exact: true }).count(),
      { timeout: 15_000 }).toBe(1)
    await expect.poll(() => tree.getByRole('button', { name: PRD_PATH, exact: true }).getAttribute('aria-current'),
      { timeout: 15_000 }).toBe('page')

    // A second document replaces the path, the rendered content, and the
    // current row.
    await tree.getByRole('button', { name: TECH_DESIGN_PATH, exact: true }).click()
    await expect.poll(() => preview.getByText(TECH_DESIGN_PATH, { exact: true }).count(), { timeout: 15_000 }).toBe(1)
    await expect.poll(() => preview.getByRole('heading', { name: 'Beta technical design', exact: true }).count(),
      { timeout: 15_000 }).toBe(1)
    await expect.poll(() => preview.getByRole('heading', { name: 'Alpha product requirements', exact: true }).count(),
      { timeout: 15_000 }).toBe(0)
    await expect.poll(() => tree.getByRole('button', { name: TECH_DESIGN_PATH, exact: true }).getAttribute('aria-current'),
      { timeout: 15_000 }).toBe('page')
    expect(await tree.getByRole('button', { name: PRD_PATH, exact: true }).getAttribute('aria-current')).toBe(null)

    const reload = panel.getByRole('button', { name: 'Reload', exact: true })

    // Reloading after an external edit of the selected document updates the
    // preview in place.
    await writeFile(join(scaffold.workspaceCwd, TECH_DESIGN_PATH), '# Beta technical design (revised)\n\nRevised beta design body.\n')
    await reload.click()
    await expect.poll(() => preview.getByRole('heading', { name: 'Beta technical design (revised)', exact: true }).count(),
      { timeout: 15_000 }).toBe(1)
    await expect.poll(() => preview.getByText('Revised beta design body.', { exact: true }).count(), { timeout: 15_000 }).toBe(1)

    // Reloading after adding a document lists it and keeps the expanded tree.
    await writeFile(join(scaffold.workspaceCwd, ADDED_PATH), '# Beta risks\n\nRisk body.\n')
    await reload.click()
    const added = tree.getByRole('button', { name: ADDED_PATH, exact: true })
    await expect.poll(() => added.count(), { timeout: 15_000 }).toBe(1)
    await expect.poll(() => added.isVisible(), { timeout: 15_000 }).toBe(true)
    await expect.poll(() => preview.getByText(TECH_DESIGN_PATH, { exact: true }).count(), { timeout: 15_000 }).toBe(1)

    // Deleting a directory externally refreshes the tree to the new listing and
    // reports the vanished selection explicitly instead of keeping a stale row.
    await rm(join(scaffold.workspaceCwd, 'mai-specs', '998-beta', 'design'), { recursive: true, force: true })
    await reload.click()
    await expect.poll(() => tree.getByRole('button', { name: TECH_DESIGN_PATH, exact: true }).count(),
      { timeout: 15_000 }).toBe(0)
    await expect.poll(() => preview.getByText(MISSING_DOCUMENT_COPY, { exact: true }).count(),
      { timeout: 15_000 }).toBe(1)
    await expect.poll(() => tree.getByRole('alert').count(), { timeout: 15_000 }).toBe(0)
    await expect.poll(() => tree.getByRole('button', { name: '999-alpha', exact: true }).count(),
      { timeout: 15_000 }).toBe(1)
    expect(await tree.getByText('No mai-specs directory was found in this workspace.', { exact: true }).count()).toBe(0)

    // Disabling removes the page and its guide entry; enabling again restores
    // both without a second registration of the same id or kind.
    scaffold.ctx.loader.remove(entryId)
    await expect.poll(() => panel.count(), { timeout: 15_000 }).toBe(0)
    // The guide entry is gone from the guide page, not merely unrendered
    // because the plugin's own page is in front.
    await showGuide(column)
    expect(await column.locator(`[data-sidebar-right-guide-entry="${GUIDE_ENTRY}"]`).count()).toBe(0)
    entryId = await scaffold.ctx.loader.create({ name: PLUGIN_NAME })
    const restored = await guideEntry(column)
    await restored.click()
    await expect.poll(() => panel.count(), { timeout: 15_000 }).toBe(1)
    await expect.poll(() => panel.locator('[data-mai-sdd-reload]').count(), { timeout: 15_000 }).toBe(1)
    expect(consoleLines.filter(line => /duplicate|already (?:registered|exists)/iu.test(line))).toEqual([])
    expect(console.pageErrors).toEqual([])
  } finally {
    await browser?.close()
    await scaffold?.close()
    if (savedKey === undefined) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = savedKey
  }
}, 180_000)
