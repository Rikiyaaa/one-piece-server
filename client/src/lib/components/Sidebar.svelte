<script lang="ts">
  import type { CardData } from '$lib/types';

  let {
    activeTab = $bindable(),
    logEntries,
    CARD_DB,
    CARD_MAP,
    dbCards,
    dbLeader,
    cardBg,
    lazyLoad,
    getDefaultCardPos,
    spawnCard,
    addLog,
    send,
    SERVER_URL,
    oppName
  } = $props();

  // รายการการ์ดในเด็คที่ผู้เล่นสร้างไว้จริง (ไม่ใช่การ์ดทั้งหมดในฐานข้อมูล)
  const deckCardList = $derived(
    Object.entries(dbCards || {})
      .map(([id, count]) => ({ card: (CARD_MAP || {})[id] as CardData | undefined, count: count as number }))
      .filter((x): x is { card: CardData; count: number } => !!x.card)
      .sort((a, b) => (a.card.cost - b.card.cost) || a.card.name.localeCompare(b.card.name))
  );
  const deckTotal = $derived(deckCardList.reduce((s, x) => s + x.count, 0));
</script>

<div id="sidebar">
  <div class="sidebar-tabs">
    <div class="stab {activeTab==='log'?'active':''}" onclick={()=>activeTab='log'}>Log</div>
    <div class="stab {activeTab==='deck'?'active':''}" onclick={()=>activeTab='deck'}>Cards</div>
    <div class="stab {activeTab==='help'?'active':''}" onclick={()=>activeTab='help'}>Help</div>
  </div>

  <!-- LOG TAB -->
  <div class="sidebar-content" style="display:{activeTab==='log'?'block':'none'}">
    <div id="log-list">
      {#each logEntries as entry, i}
        <div class="log-row">
          <div class="log-icon-col">
            <div class="log-icon log-icon-{entry.side}">
              {#if entry.side === 'you'}
                <!-- Sword -->
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 3l18 0L21 7 7 21l-4-4L17 3"/>
                  <line x1="3" y1="21" x2="8" y2="16"/>
                </svg>
              {:else if entry.side === 'opp'}
                <!-- Shield -->
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 3L4 7v5c0 4.4 3.4 8.5 8 9.5 4.6-1 8-5.1 8-9.5V7z"/>
                </svg>
              {:else}
                <!-- Zap / bolt -->
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9z"/>
                </svg>
              {/if}
            </div>
            {#if i < logEntries.length - 1}
              <div class="log-line"></div>
            {/if}
          </div>
          <div class="log-body">
            <div class="log-msg log-msg-{entry.side}">{entry.msg}</div>
            <div class="log-ts">{entry.time}</div>
          </div>
        </div>
      {/each}
    </div>
  </div>

  <!-- DECK TAB -->
  <div class="sidebar-content" style="display:{activeTab==='deck'?'block':'none'}">
    {#if !dbLeader && deckCardList.length === 0}
      <div style="font-size:10px;color:var(--text3)">ยังไม่ได้เลือก deck — ไปสร้างเด็คที่หน้า Lobby</div>
    {:else}
      {#if dbLeader}
        <div class="deck-section-label">LEADER</div>
        <div class="deck-leader-wrap">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="deck-leader-item" use:lazyLoad={dbLeader.imageUrl||''} style={cardBg(dbLeader, false)}>
            <div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent 40%,rgba(0,0,0,.85))"></div>
            <div style="position:absolute;bottom:4px;left:4px;right:4px;font-size:9px;color:#fff;font-weight:700;line-height:1.2">{dbLeader.name}</div>
          </div>
        </div>
      {/if}
      <div class="deck-section-label">DECK ({deckTotal} ใบ)</div>
      <div style="font-size:10px;color:var(--text3);margin-bottom:8px">รายการการ์ดในเด็ค (ดูได้เท่านั้น)</div>
      <div class="deck-card-grid">
        {#each deckCardList as item (item.card.id)}
           <!-- svelte-ignore a11y_no_static_element_interactions -->
           <div class="deck-card-item static" use:lazyLoad={item.card.imageUrl||''} style={cardBg(item.card, false)}>
              <div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent 30%,rgba(0,0,0,.85))"></div>
              <div style="position:absolute;bottom:3px;left:3px;right:3px;font-size:7.5px;color:#fff;font-weight:700;line-height:1.2">{item.card.name}</div>
              {#if item.count > 1}<div class="deck-card-count">×{item.count}</div>{/if}
           </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- HELP TAB -->
  <div class="sidebar-content" style="display:{activeTab==='help'?'block':'none'}">
    <div style="font-size:11px;color:var(--text2);line-height:1.8">
      <b style="color:var(--text)">ควบคุม</b><br/>
      🖱️ ลาก — ย้ายการ์ด<br/>
      🖱️ คลิกขวา — เมนูการ์ด<br/>
      🖱️ คลิกล้อเมาส์ค้างแล้วลาก — ยิงเส้นโจมตี (หายเองใน 5 วิ)<br/>
      🖱️ ดับเบิลคลิก — พลิกการ์ด<br/>
      🧲 ปล่อยบน zone — snap<br/>
    </div>
    <div class="key-shortcut-list">
      <div class="key-shortcut-row"><span class="key-badge lg"><span class="key-label">R</span></span><span>หมุน</span></div>
      <div class="key-shortcut-row"><span class="key-badge lg"><span class="key-label">F</span></span><span>พลิก</span></div>
      <div class="key-shortcut-row"><span class="key-badge lg"><span class="key-label">T</span></span><span>แตะ</span></div>
      <div class="key-shortcut-row"><span class="key-badge lg"><span class="key-label">C</span></span><span>ทำสำเนา</span></div>
      <div class="key-shortcut-row"><span class="key-badge lg"><span class="key-label">H</span></span><span>ไปมือ</span></div>
      <div class="key-shortcut-row"><span class="key-badge lg"><span class="key-label wide">Del</span></span><span>สุสาน</span></div>
      <div class="key-shortcut-row"><span class="key-badge lg"><span class="key-label wide">⌃Z</span></span><span>ย้อนกลับ (Undo)</span></div>
      <div class="key-shortcut-row"><span class="key-badge lg"><span class="key-label wide">Esc</span></span><span>ปิดเมนู/ยกเลิกลากเส้น</span></div>
    </div>
    <div style="font-size:11px;color:var(--text2);line-height:1.8;margin-top:10px">
      <b style="color:var(--text)">Phase</b><br/>
      Refresh→Draw→DON!!→Main→Battle→End<br/><br/>
      <b style="color:var(--text)">Colyseus</b><br/>
      Server: {SERVER_URL}<br/>
      ทุก action sync ผ่าน WebSocket<br/>
      เห็น cursor คู่ต่อสู้ real-time
    </div>
  </div>
</div>

<style>
  #sidebar{width:240px;background:var(--surface);border-left:1px solid var(--border);display:flex;flex-direction:column;flex-shrink:0}

  /* ── TABS ── */
  .sidebar-tabs{display:flex;border-bottom:1px solid var(--border)}
  .stab{flex:1;padding:10px 0;text-align:center;font-size:11px;font-weight:600;color:var(--text3);cursor:pointer;border-bottom:2px solid transparent;transition:all .15s}
  .stab.active{color:var(--blue2);border-bottom-color:var(--blue2)}

  /* ── CONTENT ── */
  .sidebar-content{flex:1;overflow-y:auto;padding:12px 10px;scrollbar-width:thin;scrollbar-color:var(--border) transparent}

  /* ── TIMELINE LOG ── */
  #log-list{display:flex;flex-direction:column}
  .log-row{display:flex;gap:10px;align-items:flex-start}
  .log-icon-col{display:flex;flex-direction:column;align-items:center;flex-shrink:0;width:32px}
  .log-icon{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;border:1.5px solid transparent;padding:7px;box-sizing:border-box}
  .log-icon svg{width:100%;height:100%;display:block}
  .log-icon-you{background:rgba(56,139,253,.15);border-color:rgba(56,139,253,.4);color:#388bfd}
  .log-icon-opp{background:rgba(218,54,51,.15);border-color:rgba(218,54,51,.4);color:#da3633}
  .log-icon-system{background:rgba(210,153,34,.12);border-color:rgba(210,153,34,.35);color:#d29922}
  .log-line{width:2px;flex:1;min-height:14px;background:var(--border);margin:4px 0 0;border-radius:1px}
  .log-body{padding-bottom:16px;min-width:0;flex:1}
  .log-msg{font-size:12px;font-weight:500;color:var(--text);line-height:1.5;word-break:break-word}
  .log-msg-system{color:var(--text2);font-style:italic}
  .log-ts{font-size:10px;color:var(--text3);margin-top:3px}

  /* ── DECK GRID ── */
  .deck-section-label{font-size:10px;color:var(--text3);letter-spacing:.5px;font-weight:700;text-align:center;margin:4px 0 8px}
  .deck-leader-wrap{display:flex;justify-content:center;margin-bottom:14px}
  .deck-leader-item{width:84px;aspect-ratio:2/3;border-radius:5px;overflow:hidden;border:1.5px solid var(--gold);position:relative;background-size:cover;background-position:center;box-shadow:0 0 0 1px rgba(210,153,34,.25)}
  .deck-card-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}
  :global(.deck-card-item){aspect-ratio:2/3;border-radius:4px;overflow:hidden;cursor:pointer;border:1px solid var(--border);position:relative;transition:transform .1s,border-color .1s;background-size:cover;background-position:center}
  :global(.deck-card-item:hover){transform:scale(1.05);border-color:var(--blue)}
  :global(.deck-card-item.static){cursor:default;user-select:none}
  :global(.deck-card-item.static:hover){transform:none;border-color:var(--border)}
  .deck-card-count{position:absolute;top:3px;right:3px;background:rgba(0,0,0,.75);color:#fff;font-size:8px;font-weight:700;padding:1px 4px;border-radius:3px;line-height:1.3}

  /* ── KEY BADGE (icon คีย์ลัด จาก key.svg) ── */
  .key-badge{width:19px;height:19px;flex-shrink:0;background-image:url('/key.svg');background-size:contain;background-repeat:no-repeat;background-position:center;display:inline-flex;align-items:center;justify-content:center;position:relative}
  .key-badge .key-label{font-size:8.5px;font-weight:800;color:#3a3a3c;line-height:1;letter-spacing:-0.3px;transform:translateY(-1px);white-space:nowrap}
  .key-badge .key-label.wide{font-size:6.5px;letter-spacing:-0.5px}
  .key-badge.lg{width:26px;height:26px}
  .key-badge.lg .key-label{font-size:10.5px;transform:translateY(-1.5px)}
  .key-badge.lg .key-label.wide{font-size:8px}
  .key-shortcut-list{display:flex;flex-direction:column;gap:7px;margin-top:6px}
  .key-shortcut-row{display:flex;align-items:center;gap:9px;font-size:11px;color:var(--text2)}
</style>
