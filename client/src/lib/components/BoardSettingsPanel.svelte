<script lang="ts">
  /**
   * Board Settings Panel — overlay for editing zone positions / sizes / default
   * spawn mapping.  Edits are pushed live to boardSystem so the user sees the
   * board change in real time behind the panel.
   *
   * State flows through boardSettingsSystem (single source of truth):
   *   - workingZones / workingDefaultZoneMap are the editable copies
   *   - Save → persist() + close
   *   - Cancel → restore snapshot + close
   */
  import { boardSettingsSystem } from '$lib/systems/BoardSettingsSystem.svelte';
  import { boardSystem, DEFAULT_BOARD_ZONES } from '$lib/systems/BoardSystem.svelte';
  import type { Zone } from '$lib/types';

  // Aliases for template brevity
  const workingZones = $derived(boardSettingsSystem.workingZones);
  const workingDefaultZoneMap = $derived(boardSettingsSystem.workingDefaultZoneMap);
  const dirty = $derived(boardSettingsSystem.dirty);

  const builtinIds = new Set(DEFAULT_BOARD_ZONES.map(z => z.id));

  // Search filter
  let search = $state('');
  let filterSide = $state<'' | 'you' | 'opp'>('');

  const filteredZones = $derived(
    workingZones.filter(z => {
      if (filterSide && z.side !== filterSide) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!z.id.toLowerCase().includes(q) && !z.label.toLowerCase().includes(q)) return false;
      }
      return true;
    })
  );

  // Track expanded zone (for showing cols/rows only when snap is 'grid')
  function updateField(zone: Zone, field: keyof Zone, value: any) {
    boardSettingsSystem.updateZone(zone.id, field, value);
  }

  function addZoneYou() { boardSettingsSystem.addZone('you'); }
  function addZoneOpp() { boardSettingsSystem.addZone('opp'); }
  function deleteZone(id: string) { boardSettingsSystem.deleteZone(id); }

  function save() { boardSettingsSystem.save(); }
  function cancel() { boardSettingsSystem.cancel(); }
  function resetDefaults() { boardSettingsSystem.resetDefaults(); }

  // Export / import
  let showImportBox = $state(false);
  let importText = $state('');
  let importMsg = $state('');

  function doExport() {
    const json = boardSettingsSystem.exportJSON();
    // Copy to clipboard
    navigator.clipboard.writeText(json).then(
      () => { importMsg = 'คัดลอก JSON ไปยังคลิปบอร์ดแล้ว'; },
      () => { importMsg = 'ไม่สามารถคัดลอกได้ — เปิดกล่องนำเข้าเพื่อดู JSON'; showImportBox = true; importText = json; }
    );
  }

  function doImport() {
    if (!importText.trim()) { importMsg = 'วาง JSON ก่อนกดนำเข้า'; return; }
    const ok = boardSettingsSystem.importJSON(importText);
    if (ok) {
      importMsg = 'นำเข้าสำเร็จ — อย่าลืมกด Save';
      // Refresh working copy from boardSystem (which now holds the imported state)
      boardSettingsSystem.open();
      // Re-open without snapshotting the imported state (we just opened so snapshot is fine)
    } else {
      importMsg = 'JSON ไม่ถูกต้อง';
    }
  }

  const cardTypes = ['Leader', 'Stage', 'Event', 'Character'];
</script>

{#if boardSettingsSystem.isOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="bsp-overlay" onclick={(e) => { if (e.target === e.currentTarget) cancel(); }}>
    <div class="bsp-panel">
      <header class="bsp-header">
        <h2>⚙️ Board Settings</h2>
        <div class="bsp-subtitle">ปรับตำแหน่ง / ขนาด Zone และ Spawn ต่างๆ — เปลี่ยนแล้วเห็นผลทันทีบนบอร์ด</div>
        <button class="bsp-close" onclick={cancel} title="ปิด (ยกเลิก)">✕</button>
      </header>

      <div class="bsp-body">
        <!-- ═════ DEFAULT SPAWN MAPPING ═════ -->
        <section class="bsp-section">
          <h3>🎯 ตำแหน่ง Spawn เริ่มต้น (Default Zone per Card Type)</h3>
          <p class="bsp-hint">เลือก zone ที่การ์ดแต่ละประเภทจะลงเมื่อ spawn (Leader / Stage / Event / Character)</p>
          <div class="bsp-spawn-grid">
            {#each cardTypes as ct}
              <label class="bsp-spawn-row">
                <span class="bsp-spawn-label">{ct}</span>
                <select
                  value={workingDefaultZoneMap[ct] || 'you-character'}
                  onchange={(e) => boardSettingsSystem.updateDefaultZone(ct, (e.target as HTMLSelectElement).value)}
                >
                  {#each workingZones.filter(z => z.side === 'you') as z}
                    <option value={z.id}>{z.label} ({z.id})</option>
                  {/each}
                </select>
              </label>
            {/each}
          </div>
        </section>

        <!-- ═════ ZONES LIST ═════ -->
        <section class="bsp-section">
          <div class="bsp-section-head">
            <h3>📐 Zone Layout ({workingZones.length} zones)</h3>
            <div class="bsp-section-actions">
              <input class="bsp-search" placeholder="ค้นหา..." bind:value={search} />
              <select class="bsp-filter" bind:value={filterSide}>
                <option value="">ทั้งหมด</option>
                <option value="you">ฝั่งคุณ</option>
                <option value="opp">ฝั่งคู่ต่อสู้</option>
              </select>
              <button class="bsp-btn small" onclick={addZoneYou} title="เพิ่ม zone ฝั่งคุณ">+ Zone (You)</button>
              <button class="bsp-btn small" onclick={addZoneOpp} title="เพิ่ม zone ฝั่งคู่ต่อสู้">+ Zone (Opp)</button>
            </div>
          </div>

          <div class="bsp-zones-list">
            <div class="bsp-zone-row bsp-zone-header">
              <div class="bsp-col-id">ID / Label</div>
              <div class="bsp-col-side">Side</div>
              <div class="bsp-col-num">X</div>
              <div class="bsp-col-num">Y</div>
              <div class="bsp-col-num">W</div>
              <div class="bsp-col-num">H</div>
              <div class="bsp-col-snap">Snap</div>
              <div class="bsp-col-num">Cols</div>
              <div class="bsp-col-num">Rows</div>
              <div class="bsp-col-act">Actions</div>
            </div>

            {#each filteredZones as zone (zone.id)}
              <div class="bsp-zone-row" class:builtin={builtinIds.has(zone.id)} class:custom={!builtinIds.has(zone.id)}>
                <div class="bsp-col-id">
                  <input
                    class="bsp-input id-input"
                    value={zone.label}
                    onchange={(e) => updateField(zone, 'label', (e.target as HTMLInputElement).value)}
                    title="Label ที่แสดงบนบอร์ด"
                  />
                  <div class="bsp-id-text" title={zone.id}>{zone.id}</div>
                </div>
                <div class="bsp-col-side">
                  <select
                    value={zone.side}
                    onchange={(e) => updateField(zone, 'side', (e.target as HTMLSelectElement).value)}
                  >
                    <option value="you">you</option>
                    <option value="opp">opp</option>
                  </select>
                </div>
                <div class="bsp-col-num">
                  <input class="bsp-input num" type="number" value={zone.x} onchange={(e) => updateField(zone, 'x', (e.target as HTMLInputElement).value)} />
                </div>
                <div class="bsp-col-num">
                  <input class="bsp-input num" type="number" value={zone.y} onchange={(e) => updateField(zone, 'y', (e.target as HTMLInputElement).value)} />
                </div>
                <div class="bsp-col-num">
                  <input class="bsp-input num" type="number" value={zone.w} onchange={(e) => updateField(zone, 'w', (e.target as HTMLInputElement).value)} />
                </div>
                <div class="bsp-col-num">
                  <input class="bsp-input num" type="number" value={zone.h} onchange={(e) => updateField(zone, 'h', (e.target as HTMLInputElement).value)} />
                </div>
                <div class="bsp-col-snap">
                  <select
                    value={zone.snap}
                    onchange={(e) => updateField(zone, 'snap', (e.target as HTMLSelectElement).value)}
                  >
                    <option value="center">center</option>
                    <option value="grid">grid</option>
                  </select>
                </div>
                <div class="bsp-col-num">
                  <input
                    class="bsp-input num"
                    type="number"
                    value={zone.cols || 1}
                    disabled={zone.snap !== 'grid'}
                    onchange={(e) => updateField(zone, 'cols', (e.target as HTMLInputElement).value)}
                  />
                </div>
                <div class="bsp-col-num">
                  <input
                    class="bsp-input num"
                    type="number"
                    value={zone.rows || 1}
                    disabled={zone.snap !== 'grid'}
                    onchange={(e) => updateField(zone, 'rows', (e.target as HTMLInputElement).value)}
                  />
                </div>
                <div class="bsp-col-act">
                  {#if !builtinIds.has(zone.id)}
                    <button class="bsp-btn danger small" onclick={() => deleteZone(zone.id)} title="ลบ zone นี้">🗑</button>
                  {:else}
                    <span class="bsp-locked" title="zone เริ่มต้น — ลบไม่ได้ แต่แก้พิกัดได้">🔒</span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </section>

        <!-- ═════ ADVANCED ═════ -->
        <section class="bsp-section">
          <h3>🔧 ขั้นสูง — Backup / Restore</h3>
          <div class="bsp-adv-row">
            <button class="bsp-btn" onclick={doExport}>📥 Export (คัดลอก JSON)</button>
            <button class="bsp-btn" onclick={() => { showImportBox = !showImportBox; importMsg = ''; }}>📤 Import</button>
            <button class="bsp-btn danger" onclick={resetDefaults}>♻️ Reset เป็นค่าเริ่มต้น</button>
          </div>
          {#if showImportBox}
            <div class="bsp-import-box">
              <textarea
                bind:value={importText}
                placeholder="วาง JSON ที่ export ไว้ที่นี่..."
                rows="6"
              ></textarea>
              <div class="bsp-import-actions">
                <button class="bsp-btn" onclick={doImport}>นำเข้า</button>
                <button class="bsp-btn ghost" onclick={() => { showImportBox = false; importText = ''; importMsg = ''; }}>ปิด</button>
                <span class="bsp-import-msg">{importMsg}</span>
              </div>
            </div>
          {/if}
        </section>
      </div>

      <footer class="bsp-footer">
        <div class="bsp-status" class:dirty={dirty}>
          {dirty ? '● มีการเปลี่ยนแปลง — กด Save เพื่อบันทึก' : '✓ ไม่มีการเปลี่ยนแปลง'}
        </div>
        <div class="bsp-footer-actions">
          <button class="bsp-btn ghost" onclick={cancel}>ยกเลิก</button>
          <button class="bsp-btn primary" onclick={save} disabled={!dirty}>💾 Save</button>
        </div>
      </footer>
    </div>
  </div>
{/if}

<style>
  /* ── Overlay ── */
  .bsp-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .bsp-panel {
    width: min(1100px, 96vw);
    max-height: 92vh;
    background: var(--surface, #161b22);
    border: 1px solid var(--border2, #484f58);
    border-radius: 10px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── Header ── */
  .bsp-header {
    position: relative;
    padding: 16px 20px 12px;
    border-bottom: 1px solid var(--border, #30363d);
    background: linear-gradient(180deg, rgba(56, 139, 253, 0.06), transparent);
  }
  .bsp-header h2 {
    margin: 0;
    font-size: 18px;
    color: var(--text, #e6edf3);
    font-weight: 700;
  }
  .bsp-subtitle {
    font-size: 12px;
    color: var(--text2, #8b949e);
    margin-top: 4px;
  }
  .bsp-close {
    position: absolute;
    top: 12px;
    right: 14px;
    width: 28px;
    height: 28px;
    border: 1px solid var(--border, #30363d);
    background: var(--surface2, #21262d);
    color: var(--text2, #8b949e);
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
  }
  .bsp-close:hover {
    background: var(--red, #da3633);
    color: #fff;
    border-color: var(--red, #da3633);
  }

  /* ── Body ── */
  .bsp-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
  }
  .bsp-section {
    margin-bottom: 22px;
    background: rgba(0, 0, 0, 0.18);
    border: 1px solid var(--border, #30363d);
    border-radius: 8px;
    padding: 12px 14px;
  }
  .bsp-section h3 {
    margin: 0 0 6px;
    font-size: 13px;
    color: var(--text, #e6edf3);
    font-weight: 700;
    letter-spacing: 0.2px;
  }
  .bsp-hint {
    font-size: 11px;
    color: var(--text3, #6e7681);
    margin: 0 0 10px;
  }
  .bsp-section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 10px;
  }
  .bsp-section-head h3 { margin: 0; }
  .bsp-section-actions {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }

  /* ── Spawn mapping grid ── */
  .bsp-spawn-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 8px;
  }
  .bsp-spawn-row {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--surface2, #21262d);
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid var(--border, #30363d);
  }
  .bsp-spawn-label {
    font-size: 11px;
    font-weight: 700;
    color: var(--blue2, #388bfd);
    min-width: 70px;
    letter-spacing: 0.3px;
  }
  .bsp-spawn-row select {
    flex: 1;
    height: 26px;
    background: var(--surface, #161b22);
    color: var(--text, #e6edf3);
    border: 1px solid var(--border2, #484f58);
    border-radius: 4px;
    font-size: 11px;
    padding: 0 6px;
  }

  /* ── Zones list ── */
  .bsp-search, .bsp-filter {
    height: 26px;
    background: var(--surface, #161b22);
    color: var(--text, #e6edf3);
    border: 1px solid var(--border2, #484f58);
    border-radius: 4px;
    font-size: 11px;
    padding: 0 8px;
  }
  .bsp-search { width: 120px; }
  .bsp-filter { width: 100px; }

  .bsp-zones-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 480px;
    overflow-y: auto;
    border: 1px solid var(--border, #30363d);
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.25);
  }
  .bsp-zone-row {
    display: grid;
    grid-template-columns: 1.5fr 0.7fr 0.6fr 0.6fr 0.6fr 0.6fr 0.7fr 0.5fr 0.5fr 0.5fr;
    gap: 4px;
    padding: 4px 6px;
    align-items: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    font-size: 11px;
  }
  .bsp-zone-row:last-child { border-bottom: none; }
  .bsp-zone-row.bsp-zone-header {
    background: var(--surface2, #21262d);
    font-weight: 700;
    color: var(--text3, #6e7681);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: 10px;
    position: sticky;
    top: 0;
    z-index: 1;
  }
  .bsp-zone-row.builtin { background: rgba(56, 139, 253, 0.04); }
  .bsp-zone-row.custom { background: rgba(210, 153, 34, 0.06); }

  .bsp-col-id { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .bsp-id-text {
    font-size: 9px;
    color: var(--text3, #6e7681);
    font-family: 'Menlo', 'Consolas', monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bsp-col-num { display: flex; }
  .bsp-col-side, .bsp-col-snap, .bsp-col-act { display: flex; }

  .bsp-input {
    width: 100%;
    height: 24px;
    background: var(--surface, #161b22);
    color: var(--text, #e6edf3);
    border: 1px solid var(--border, #30363d);
    border-radius: 4px;
    font-size: 11px;
    padding: 0 5px;
    font-family: inherit;
  }
  .bsp-input.id-input { font-weight: 700; }
  .bsp-input.num { text-align: right; font-family: 'Menlo', 'Consolas', monospace; }
  .bsp-input:disabled { opacity: 0.4; cursor: not-allowed; }
  .bsp-input:focus {
    outline: none;
    border-color: var(--blue, #1f6feb);
    background: var(--surface2, #21262d);
  }

  .bsp-zone-row select {
    width: 100%;
    height: 24px;
    background: var(--surface, #161b22);
    color: var(--text, #e6edf3);
    border: 1px solid var(--border, #30363d);
    border-radius: 4px;
    font-size: 11px;
    padding: 0 4px;
  }

  .bsp-locked {
    font-size: 12px;
    opacity: 0.5;
    text-align: center;
    width: 100%;
  }

  /* ── Buttons ── */
  .bsp-btn {
    height: 28px;
    padding: 0 12px;
    border-radius: 5px;
    border: 1px solid var(--border2, #484f58);
    background: var(--surface2, #21262d);
    color: var(--text, #e6edf3);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }
  .bsp-btn:hover { background: var(--surface3, #30363d); border-color: var(--blue2, #388bfd); color: #fff; }
  .bsp-btn.small { height: 24px; padding: 0 8px; font-size: 10px; }
  .bsp-btn.primary {
    background: var(--blue, #1f6feb);
    border-color: var(--blue, #1f6feb);
    color: #fff;
  }
  .bsp-btn.primary:hover { background: var(--blue2, #388bfd); border-color: var(--blue2, #388bfd); }
  .bsp-btn.primary:disabled {
    background: var(--surface2, #21262d);
    border-color: var(--border, #30363d);
    color: var(--text3, #6e7681);
    cursor: not-allowed;
  }
  .bsp-btn.danger { color: var(--red, #da3633); border-color: rgba(218, 54, 51, 0.4); }
  .bsp-btn.danger:hover { background: var(--red, #da3633); color: #fff; border-color: var(--red, #da3633); }
  .bsp-btn.ghost { background: transparent; }
  .bsp-btn.ghost:hover { background: var(--surface3, #30363d); }

  /* ── Advanced ── */
  .bsp-adv-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .bsp-import-box {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .bsp-import-box textarea {
    width: 100%;
    background: var(--surface, #161b22);
    color: var(--text, #e6edf3);
    border: 1px solid var(--border2, #484f58);
    border-radius: 4px;
    padding: 8px;
    font-size: 10px;
    font-family: 'Menlo', 'Consolas', monospace;
    resize: vertical;
  }
  .bsp-import-actions { display: flex; gap: 8px; align-items: center; }
  .bsp-import-msg { font-size: 11px; color: var(--text2, #8b949e); }

  /* ── Footer ── */
  .bsp-footer {
    padding: 12px 20px;
    border-top: 1px solid var(--border, #30363d);
    background: var(--surface2, #21262d);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .bsp-status {
    font-size: 11px;
    color: var(--text3, #6e7681);
  }
  .bsp-status.dirty {
    color: var(--gold, #d29922);
    font-weight: 600;
  }
  .bsp-footer-actions { display: flex; gap: 8px; }

  /* ── Scrollbar ── */
  .bsp-body::-webkit-scrollbar, .bsp-zones-list::-webkit-scrollbar { width: 8px; }
  .bsp-body::-webkit-scrollbar-track, .bsp-zones-list::-webkit-scrollbar-track { background: transparent; }
  .bsp-body::-webkit-scrollbar-thumb, .bsp-zones-list::-webkit-scrollbar-thumb {
    background: var(--border2, #484f58);
    border-radius: 4px;
  }
  .bsp-body::-webkit-scrollbar-thumb:hover, .bsp-zones-list::-webkit-scrollbar-thumb:hover {
    background: var(--text3, #6e7681);
  }

  /* ── Responsive ── */
  @media (max-width: 900px) {
    .bsp-zone-row {
      grid-template-columns: 1.4fr 0.6fr 0.5fr 0.5fr 0.5fr 0.5fr 0.6fr 0.4fr 0.4fr 0.4fr;
      font-size: 10px;
    }
    .bsp-input, .bsp-zone-row select { font-size: 10px; }
  }
  @media (max-width: 700px) {
    .bsp-zone-row {
      grid-template-columns: 1fr 0.5fr 0.5fr 0.5fr 0.5fr 0.5fr;
      grid-template-areas:
        "id id id side side snap"
        "x y w h cols rows";
      gap: 3px;
    }
    .bsp-zone-header { display: none; }
    .bsp-col-id { grid-area: id; }
    .bsp-col-side { grid-area: side; }
    .bsp-col-snap { grid-area: snap; }
    .bsp-col-num:nth-child(3) { grid-area: x; }
    .bsp-col-num:nth-child(4) { grid-area: y; }
    .bsp-col-num:nth-child(5) { grid-area: w; }
    .bsp-col-num:nth-child(6) { grid-area: h; }
    .bsp-col-num:nth-child(8) { grid-area: cols; }
    .bsp-col-num:nth-child(9) { grid-area: rows; }
    .bsp-col-act { display: none; }
  }
</style>
