<script lang="ts">
  import type { CardData } from '$lib/types';

  let {
    dbOpen = $bindable(),
    dbSearch = $bindable(),
    dbFilterType = $bindable(),
    dbFilterColor = $bindable(),
    dbLeader = $bindable(),
    dbCards = $bindable(),
    dbDonCount = $bindable(10),
    dbPage = $bindable(),
    CARD_DB,
    dbLoaded,
    CARD_MAP,
    lobbyDeckSummary = $bindable(),
    clearDB,
    saveDB,
    dbAddCard,
    dbRemCard,
    clearDBLeader,
    cardBg,
    lazyLoad,
    dbTotal,
    dbSearchTerm,
    dbPageSize = 25,
    deckSaving = false,
    deckSaveMsg = '',
    deckSaveMsgType = 'ok',
    activeDeckId = null
  } = $props();

  // ── COLOR / RARITY ──
  const COLOR_HEX: Record<string,string> = {
    Red:'#c0392b', Green:'#27ae60', Blue:'#2471a3',
    Purple:'#7d3c98', Black:'#555', Yellow:'#b7950b', Multicolor:'#7f8c8d'
  };
  const COLORS = ['Red','Green','Blue','Purple','Black','Yellow'];
  const COLOR_TH: Record<string,string> = {Red:'Red',Green:'Green',Blue:'Blue',Purple:'Purple',Black:'Black',Yellow:'Yellow'};
  const RARITIES = ['L','C','UC','R','SR','SEC','P','SP'];
  const RARITY_FULL: Record<string,string> = {L:'L - Leader',C:'C - Common',UC:'UC - Uncommon',R:'R - Rare',SR:'SR - Super Rare',SEC:'SEC - Secret Rare',P:'P - Promotional',SP:'SP CARD - Special'};
  const TYPES = ['Leader','Character','Event','Stage'];
  const KEYWORDS = ['Rush','Blocker','Double Attack','On Play','Activate','When Attacking','Trigger','Counter'];

  // ── LOCAL FILTER STATE ──
  let filterColors = $state<Set<string>>(new Set());
  let filterRarities = $state<Set<string>>(new Set());
  let filterTypes = $state<Set<string>>(new Set());
  let filterKeywords = $state<Set<string>>(new Set());
  let filterCardSets = $state<Set<string>>(new Set());
  let cardSetSearch = $state('');
  let costMin = $state(0);
  let costMax = $state(10);
  let powerMin = $state(0);
  let powerMax = $state(13000);

  // collapsible section state
  let openSections = $state<Record<string,boolean>>({
    cardSet: true, rarity: true, color: true, type: false, cost: false, power: false, keyword: false
  });
  function toggleSection(k: string) {
    openSections = { ...openSections, [k]: !openSections[k] };
  }

  function toggleSet(set: Set<string>, val: string): Set<string> {
    const n = new Set(set);
    if (n.has(val)) n.delete(val); else n.add(val);
    return n;
  }

  // Natural sort, descending: splits into text/number chunks so "[OP-15]" sorts
  // above "[OP-12]" and "[PRB-02]" above "[PRB-01]" without hardcoding set codes.
  function naturalKey(s: string): (string|number)[] {
    return String(s||'').match(/\d+|\D+/g)?.map(p => /^\d+$/.test(p) ? parseInt(p) : p) || [s];
  }
  function naturalCompareDesc(a: string, b: string): number {
    const ka = naturalKey(a), kb = naturalKey(b);
    const len = Math.max(ka.length, kb.length);
    for (let i = 0; i < len; i++) {
      const x = ka[i], y = kb[i];
      if (x === undefined) return 1;
      if (y === undefined) return -1;
      if (typeof x === 'number' && typeof y === 'number') {
        if (x !== y) return y - x;
      } else {
        const sx = String(x), sy = String(y);
        if (sx !== sy) return sx < sy ? 1 : -1;
      }
    }
    return 0;
  }

  const allCardSets = $derived.by(() => {
    const set = new Set<string>();
    for (const c of CARD_DB as CardData[]) {
      if (c.card_set) set.add(c.card_set);
    }
    return [...set].sort(naturalCompareDesc);
  });

  const visibleCardSets = $derived(
    cardSetSearch
      ? allCardSets.filter((s: string) => s.toLowerCase().includes(cardSetSearch.toLowerCase()))
      : allCardSets
  );

  function resetFilters() {
    filterColors = new Set(); filterRarities = new Set();
    filterTypes = new Set(); filterKeywords = new Set();
    filterCardSets = new Set(); cardSetSearch = '';
    costMin = 0; costMax = 10; powerMin = 0; powerMax = 13000;
    dbFilterType = ''; dbFilterColor = '';
    dbPage = 1;
  }

  const hasActiveFilters = $derived(
    filterColors.size > 0 || filterRarities.size > 0 || filterTypes.size > 0 ||
    filterKeywords.size > 0 || filterCardSets.size > 0 ||
    costMin > 0 || costMax < 10 || powerMin > 0 || powerMax < 13000
  );

  // โควตาต่อ card_id: 4 ใบ (นับรวมทุก parallel art ของรหัสเดียวกัน)
  function maxCopy(_c: CardData): number { return 4; }

  // นับจำนวนการ์ดในเด็คที่มี card_id เดียวกัน (รวม parallel)
  function cardIdQuotaUsed(cardId: string, excludeUid?: string): number {
    return Object.entries(dbCards as Record<string, number>).reduce((sum, [uid, cnt]) => {
      if (uid === excludeUid) return sum;
      const d = CARD_MAP[uid];
      return d?.cardId === cardId ? sum + cnt : sum;
    }, 0);
  }

  const filteredPool = $derived(CARD_DB.filter((c: CardData) => {
    const sq = dbSearchTerm;
    if (sq && !c.name.toLowerCase().includes(sq) && !(c.id||'').toLowerCase().includes(sq)) return false;
    if (filterTypes.size > 0 && !filterTypes.has(c.type)) return false;
    if (filterColors.size > 0) {
      const cardColors = String(c.color||'').split('/').map((s: string) => s.trim());
      if (!cardColors.some((col: string) => filterColors.has(col))) return false;
    }
    if (filterRarities.size > 0 && !filterRarities.has(c.rarity)) return false;
    if (filterCardSets.size > 0 && !filterCardSets.has(c.card_set||'')) return false;
    if (c.type !== 'Leader') {
      if (c.cost < costMin || c.cost > costMax) return false;
      if (c.power > 0 && (c.power < powerMin || c.power > powerMax)) return false;
    }
    if (filterKeywords.size > 0) {
      const eff = (c.effect||'').toLowerCase();
      if (![...filterKeywords].some(kw => eff.includes(kw.toLowerCase()))) return false;
    }
    return true;
  }));

  const totalPages = $derived(Math.max(1, Math.ceil(filteredPool.length / dbPageSize)));
  const pagedPool = $derived(filteredPool.slice((dbPage - 1) * dbPageSize, dbPage * dbPageSize));

  const sortedList = $derived(
    Object.entries(dbCards as Record<string,number>)
      .map(([id, cnt]) => ({ d: CARD_MAP[id], cnt }))
      .filter(e => e.d)
      .sort((a, b) => {
        const o: Record<string,number> = { Character: 0, Event: 1, Stage: 2 };
        return (o[a.d.type] ?? 9) - (o[b.d.type] ?? 9) || (a.d.cost||0) - (b.d.cost||0);
      })
  );

  const deckColorCounts = $derived(
    sortedList.reduce((acc: Record<string,number>, { d, cnt }) => {
      acc[d.color] = (acc[d.color]||0) + cnt; return acc;
    }, {})
  );

  const pct = $derived(Math.round((dbTotal() / 50) * 100));

  // ── VALIDATION ──────────────────────────────────
  // 1) Color Identity: สีที่ Leader อนุญาต
  const leaderColors = $derived.by((): Set<string> => {
    if (!dbLeader) return new Set();
    const cols = String(dbLeader.color || '').split('/').map((s: string) => s.trim()).filter(Boolean);
    return new Set(cols);
  });

  // 2) การ์ดในเด็คที่สีไม่ตรง Leader (ยกเว้น Multicolor/— ถือว่าผ่าน)
  const colorViolations = $derived.by((): { name: string; color: string }[] => {
    if (!dbLeader || leaderColors.size === 0) return [];
    const out: { name: string; color: string }[] = [];
    for (const [id] of Object.entries(dbCards as Record<string, number>)) {
      const d = CARD_MAP[id];
      if (!d) continue;
      const cardCols = String(d.color || '').split('/').map((s: string) => s.trim()).filter(Boolean);
      if (cardCols.length === 0) continue; // ไม่มีสี → ผ่าน
      const ok = cardCols.some((c: string) =>
        leaderColors.has(c) || c === 'Multicolor' || c === ''
      );
      if (!ok) out.push({ name: d.name, color: d.color });
    }
    return out;
  });

  // 3) การ์ดซ้ำเกินกฎ — นับโดยใช้ card_id (รวม parallel art ทุกใบ)
  const duplicateViolations = $derived.by((): { name: string; cnt: number; max: number }[] => {
    const quotaMap: Record<string, {count: number; name: string}> = {};
    for (const [uid, cnt] of Object.entries(dbCards as Record<string, number>)) {
      const d = CARD_MAP[uid]; if (!d) continue;
      const key = d.cardId || d.id;
      if (!quotaMap[key]) quotaMap[key] = { count: 0, name: d.name };
      quotaMap[key].count += cnt;
    }
    const out: { name: string; cnt: number; max: number }[] = [];
    for (const { count, name } of Object.values(quotaMap)) {
      if (count > 4) out.push({ name, cnt: count, max: 4 });
    }
    return out;
  });

  // รวม errors ทั้งหมดสำหรับแสดงใน footer + ปุ่ม save
  const deckErrors = $derived.by((): string[] => {
    const errs: string[] = [];
    const total = dbTotal();
    if (total !== 50) errs.push(`กองหลักต้องครบ 50 ใบ (ปัจจุบัน ${total} ใบ)`);
    // DON!! deck คงที่ 10 ใบเสมอใน OPTCG — แจ้งให้รู้ว่าจะถูก set อัตโนมัติ
    if (!dbLeader) errs.push('ยังไม่ได้เลือก Leader');
    if (dbDonCount < 1 || dbDonCount > 20) errs.push(`DON!! ต้องใส่ 1–20 ใบ (ปัจจุบัน ${dbDonCount})`);
    colorViolations.forEach(v => errs.push(`"${v.name}" (${v.color}) สีไม่ตรง Leader`));
    duplicateViolations.forEach(v => errs.push(`"${v.name}" มี ${v.cnt} ใบ (สูงสุด ${v.max})`));
    return errs;
  });

  // life จาก Leader card — One Piece TCG เก็บ life ใน field 'cost' (life field = '-')
  const leaderLife = $derived.by((): number => {
    if (!dbLeader) return 5;
    const lifeField = parseInt(String(dbLeader.life ?? ''));
    if (lifeField >= 1 && lifeField <= 8) return lifeField;
    const costField = parseInt(String(dbLeader.cost ?? ''));
    if (costField >= 1 && costField <= 8) return costField;
    return 5;
  });

  const deckReady = $derived(deckErrors.length === 0);

  function goPage(p: number) { dbPage = p; }

  // ── TOAST NOTIFICATIONS (bottom-right) ──
  let toasts = $state<{ id: number; name: string; img: string; ok: boolean; msg: string }[]>([]);
  let toastSeq = 0;
  function pushToast(d: CardData, ok: boolean) {
    const id = ++toastSeq;
    const imgUrl = d.imageUrl || (d as any).image_url || '';
    const msg = ok ? 'เพิ่มเข้าเด็คแล้ว' : 'ไม่สามารถเพิ่มได้ (ครบโควตา/เด็คเต็ม)';
    toasts = [...toasts, { id, name: d.name, img: imgUrl, ok, msg }];
    setTimeout(() => { toasts = toasts.filter(t => t.id !== id); }, 2600);
  }
  function dismissToast(id: number) {
    toasts = toasts.filter(t => t.id !== id);
  }
  // ใช้แทน dbAddCard ตรง ๆ ทุกจุดที่ผู้ใช้กดเพิ่มการ์ด เพื่อโชว์ toast แจ้งเตือน
  function addCardWithToast(d: CardData) {
    const before = dbTotal();
    const beforeQuota = cardIdQuotaUsed(d.cardId);
    dbAddCard(d);
    const added = dbTotal() > before || cardIdQuotaUsed(d.cardId) > beforeQuota;
    pushToast(d, added);
  }

  // CARD DETAIL POPUP
  let popupCard = $state<CardData|null>(null);
  function openPopup(c: CardData) { popupCard = c; }
  function closePopup() { popupCard = null; }

  const popupAddInfo = $derived.by(() => {
    const c = popupCard;
    if (!c) return null;
    const isLeader = c.type === 'Leader';
    const cnt = isLeader ? (dbLeader?.id === c.id ? 1 : 0) : cardIdQuotaUsed(c.cardId);
    const mx = maxCopy(c);
    const maxed = cnt >= mx || (!isLeader && dbTotal() >= 50);
    let label = '+ เพิ่มเข้าเด็ค';
    if (isLeader) label = (dbLeader?.id === c.id) ? 'นำลีดเดอร์นี้ออก' : '+ เลือกเป็นลีดเดอร์';
    else if (maxed) label = cnt >= mx ? 'ใส่ครบจำนวนแล้ว' : 'เด็คครบ 50 ใบแล้ว';
    return { cnt, mx, maxed: isLeader ? false : maxed, label, isLeader };
  });

  function handleClick(c: CardData) {
    if (c.type === 'Leader') {
      if (dbLeader?.id === c.id) clearDBLeader(); else dbLeader = c;
    } else { addCardWithToast(c); }
  }

  function pagesAround(cur: number, total: number): (number|'...')[] {
    const s = new Set<number>();
    s.add(1); s.add(total);
    for (let i = Math.max(1, cur-2); i <= Math.min(total, cur+2); i++) s.add(i);
    const sorted = [...s].sort((a,b)=>a-b);
    const result: (number|'...')[] = [];
    let prev = 0;
    for (const p of sorted) {
      if (prev && p - prev > 1) result.push('...');
      result.push(p); prev = p;
    }
    return result;
  }
</script>

<div class="db-root">
  <!-- TOP BAR -->
  <div class="db-topbar">
    <div class="db-logo">ONE PIECE TCG <span>DECK BUILDER</span></div>
    <div class="db-sep"></div>
    <div class="db-counter">
      <b>{dbTotal()}</b> / 50 ใบ
      {#if deckErrors.length > 0}
        <span class="topbar-err-badge">{deckErrors.length} ข้อผิดพลาด</span>
      {/if}
    </div>
    <div class="db-top-btns">
      <button class="tb-btn danger" onclick={clearDB}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        ล้าง
      </button>
      <button class="tb-btn" onclick={() => dbOpen = false}>ยกเลิก</button>
      {#if deckSaveMsg}
        <span class="deck-save-msg {deckSaveMsgType}">{deckSaveMsg}</span>
      {/if}
      <button class="tb-btn primary" disabled={!deckReady || deckSaving} onclick={saveDB}>
        {#if deckSaving}
          <span class="db-spinner"></span> กำลังบันทึก...
        {:else}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          {activeDeckId ? 'อัปเดตเด็ค' : 'บันทึกเด็คใหม่'}
        {/if}
      </button>
    </div>
  </div>

  <!-- BODY -->
  <div class="db-body">

    <!-- FILTER SIDEBAR -->
    <div class="db-sidebar">
      <!-- search + type quick buttons -->
      <div class="sb-top">
        <div class="sb-search-wrap">
          <svg class="sb-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input class="sb-search" type="text" placeholder="Search by name or serial ID (OP03-001)..." bind:value={dbSearch} />
        </div>
        <div class="sb-type-row">
          {#each TYPES as type}
            <button
              class="sb-type-btn {filterTypes.has(type) ? 'active' : ''}"
              onclick={() => { filterTypes = toggleSet(filterTypes, type); dbPage = 1; }}>
              {type.toUpperCase()}
            </button>
          {/each}
        </div>
        {#if hasActiveFilters}
          <button class="sb-reset" onclick={resetFilters}>× ล้าง filter ทั้งหมด</button>
        {/if}
      </div>

      <!-- SCROLLABLE FILTER SECTIONS -->
      <div class="sb-sections">

        <!-- CARD SET -->
        <div class="sb-section">
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="sb-section-head" onclick={() => toggleSection('cardSet')}>
            <span class="sb-section-label">CARD SET</span>
            <svg class="sb-chevron {openSections.cardSet ? 'open' : ''}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          {#if openSections.cardSet}
            <div class="sb-section-body">
              <div class="sb-subsearch-wrap">
                <svg class="sb-subsearch-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input class="sb-subsearch" type="text" placeholder="ค้นหาชุดการ์ด..." bind:value={cardSetSearch} />
              </div>
              <div class="sb-checkbox-list">
                {#each visibleCardSets as cs}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="sb-checkbox-row" onclick={() => { filterCardSets = toggleSet(filterCardSets, cs); dbPage = 1; }}>
                    <div class="sb-checkbox {filterCardSets.has(cs) ? 'checked' : ''}">
                      {#if filterCardSets.has(cs)}<svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="2.5"><polyline points="2 6 5 9 10 3"/></svg>{/if}
                    </div>
                    <span class="sb-checkbox-label">{cs}</span>
                  </div>
                {/each}
                {#if visibleCardSets.length === 0}
                  <div class="sb-empty-note">ไม่พบชุดการ์ดที่ตรงกับคำค้นหา</div>
                {/if}
              </div>
            </div>
          {/if}
        </div>

        <!-- RARITY -->
        <div class="sb-section">
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="sb-section-head" onclick={() => toggleSection('rarity')}>
            <span class="sb-section-label">RARITY</span>
            <svg class="sb-chevron {openSections.rarity ? 'open' : ''}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          {#if openSections.rarity}
            <div class="sb-section-body">
              {#each RARITIES as r}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="sb-checkbox-row" onclick={() => { filterRarities = toggleSet(filterRarities, r); dbPage = 1; }}>
                  <div class="sb-checkbox {filterRarities.has(r) ? 'checked' : ''}">
                    {#if filterRarities.has(r)}<svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="2.5"><polyline points="2 6 5 9 10 3"/></svg>{/if}
                  </div>
                  <span class="sb-checkbox-label">{RARITY_FULL[r]}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- COLOR -->
        <div class="sb-section">
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="sb-section-head" onclick={() => toggleSection('color')}>
            <span class="sb-section-label">COLOR</span>
            <svg class="sb-chevron {openSections.color ? 'open' : ''}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          {#if openSections.color}
            <div class="sb-section-body">
              {#each COLORS as color}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="sb-checkbox-row" onclick={() => { filterColors = toggleSet(filterColors, color); dbPage = 1; }}>
                  <div class="sb-checkbox {filterColors.has(color) ? 'checked' : ''}" style={filterColors.has(color) ? `background:${COLOR_HEX[color]};border-color:${COLOR_HEX[color]}` : ''}>
                    {#if filterColors.has(color)}<svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="2.5"><polyline points="2 6 5 9 10 3"/></svg>{/if}
                  </div>
                  <span class="color-swatch" style="background:{COLOR_HEX[color]}"></span>
                  <span class="sb-checkbox-label">{COLOR_TH[color]}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- COST SLIDER -->
        <div class="sb-section">
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="sb-section-head" onclick={() => toggleSection('cost')}>
            <span class="sb-section-label">COST</span>
            <svg class="sb-chevron {openSections.cost ? 'open' : ''}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          {#if openSections.cost}
            <div class="sb-section-body sb-slider-body">
              <div class="slider-row">
                <span class="slider-val">{costMin}</span>
                <div class="slider-track">
                  <input class="sb-range" type="range" min="0" max="10" step="1"
                    bind:value={costMin}
                    oninput={() => { if (costMin > costMax) costMax = costMin; dbPage = 1; }} />
                  <input class="sb-range" type="range" min="0" max="10" step="1"
                    bind:value={costMax}
                    oninput={() => { if (costMax < costMin) costMin = costMax; dbPage = 1; }} />
                  <div class="slider-fill"
                    style="left:{costMin*10}%;right:{(10-costMax)*10}%">
                  </div>
                </div>
                <span class="slider-val">{costMax}</span>
              </div>
            </div>
          {/if}
        </div>

        <!-- POWER SLIDER -->
        <div class="sb-section">
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="sb-section-head" onclick={() => toggleSection('power')}>
            <span class="sb-section-label">POWER</span>
            <svg class="sb-chevron {openSections.power ? 'open' : ''}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          {#if openSections.power}
            <div class="sb-section-body sb-slider-body">
              <div class="slider-row">
                <span class="slider-val">{powerMin}</span>
                <div class="slider-track">
                  <input class="sb-range" type="range" min="0" max="13000" step="1000"
                    bind:value={powerMin}
                    oninput={() => { if (powerMin > powerMax) powerMax = powerMin; dbPage = 1; }} />
                  <input class="sb-range" type="range" min="0" max="13000" step="1000"
                    bind:value={powerMax}
                    oninput={() => { if (powerMax < powerMin) powerMin = powerMax; dbPage = 1; }} />
                  <div class="slider-fill"
                    style="left:{(powerMin/13000)*100}%;right:{((13000-powerMax)/13000)*100}%">
                  </div>
                </div>
                <span class="slider-val">{powerMax.toLocaleString()}</span>
              </div>
            </div>
          {/if}
        </div>

        <!-- KEYWORD -->
        <div class="sb-section">
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="sb-section-head" onclick={() => toggleSection('keyword')}>
            <span class="sb-section-label">KEYWORD</span>
            <svg class="sb-chevron {openSections.keyword ? 'open' : ''}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          {#if openSections.keyword}
            <div class="sb-section-body">
              {#each KEYWORDS as kw}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="sb-checkbox-row" onclick={() => { filterKeywords = toggleSet(filterKeywords, kw); dbPage = 1; }}>
                  <div class="sb-checkbox {filterKeywords.has(kw) ? 'checked' : ''}">
                    {#if filterKeywords.has(kw)}<svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="2.5"><polyline points="2 6 5 9 10 3"/></svg>{/if}
                  </div>
                  <span class="sb-checkbox-label">{kw}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>


      </div><!-- end sb-sections -->
    </div><!-- end db-sidebar -->

    <!-- CENTER: CARD POOL -->
    <div class="db-center">
      <div class="pool-meta">
        {filteredPool.length} ผลลัพธ์
        {#if totalPages > 1}· หน้า {dbPage} / {totalPages}{/if}
      </div>

      <!-- PAGINATION TOP -->
      {#if totalPages > 1}
        <div class="db-pagination top">
          <button class="pg-btn" disabled={dbPage <= 1} onclick={() => goPage(dbPage - 1)}>PREV</button>
          {#each pagesAround(dbPage, totalPages) as p}
            {#if p === '...'}
              <span class="pg-ellipsis">…</span>
            {:else}
              <button class="pg-btn {dbPage === p ? 'active' : ''}" onclick={() => goPage(p as number)}>{p}</button>
            {/if}
          {/each}
          <button class="pg-btn" disabled={dbPage >= totalPages} onclick={() => goPage(dbPage + 1)}>NEXT</button>
        </div>
      {/if}

      <!-- CARD GRID -->
      <div class="db-grid">
        {#if !dbLoaded}
          {#each Array(dbPageSize) as _}
            <div class="card-thumb skeleton"></div>
          {/each}
        {:else}
          {#each pagedPool as c (c.id)}
            {@const isLeader = c.type === 'Leader'}
            {@const cnt = isLeader ? (dbLeader?.id === c.id ? 1 : 0) : cardIdQuotaUsed(c.cardId)}
            {@const mx = maxCopy(c)}
            {@const maxed = cnt >= mx || (!isLeader && dbTotal() >= 50)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="card-thumb {cnt > 0 ? 'selected' : ''} {maxed ? 'maxed' : ''} {c.type === 'Event' || c.type === 'Stage' ? 'card-landscape' : ''}"
              onclick={() => openPopup(c)}
              title="{c.name} · {c.type} · {c.color}{c.cost > 0 ? ` · Cost ${c.cost}` : ''}">
              <div class="card-face" use:lazyLoad={c.imageUrl || ''} style={cardBg(c)}>
                {#if isLeader}<span class="leader-badge">LEADER</span>{/if}
                {#if !c.imageUrl}
                  <div class="card-face-inner">
                    <div class="card-face-name">{c.name}</div>
                    {#if c.power > 0}<div class="card-face-power">{c.power / 1000}k</div>{/if}
                    <div class="card-face-rarity">{c.rarity}</div>
                  </div>
                {/if}
              </div>
              {#if cnt > 0}
                <div class="card-count-badge">×{cnt}</div>
              {/if}
            </div>
          {/each}
        {/if}
      </div>

      <!-- PAGINATION BOTTOM -->
      {#if totalPages > 1}
        <div class="db-pagination bottom">
          <button class="pg-btn" disabled={dbPage <= 1} onclick={() => goPage(dbPage - 1)}>PREV</button>
          {#each pagesAround(dbPage, totalPages) as p}
            {#if p === '...'}
              <span class="pg-ellipsis">…</span>
            {:else}
              <button class="pg-btn {dbPage === p ? 'active' : ''}" onclick={() => goPage(p as number)}>{p}</button>
            {/if}
          {/each}
          <button class="pg-btn" disabled={dbPage >= totalPages} onclick={() => goPage(dbPage + 1)}>NEXT</button>
        </div>
      {/if}
    </div>

    <!-- RIGHT: DECK PANEL -->
    <div class="db-right">
      <div class="deck-head">
        <div class="deck-progress-row">
          <span class="deck-progress-label">เด็คของฉัน</span>
          <span class="deck-progress-count">{dbTotal()} / 50</span>
        </div>
        <div class="deck-progress-bar">
          <div class="deck-progress-fill {dbTotal() === 50 ? 'complete' : ''}" style="width:{pct}%"></div>
        </div>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="leader-slot {dbLeader ? '' : 'empty'}" onclick={() => { if (!dbLeader) { filterTypes = new Set(['Leader']); dbPage = 1; } }}>
          {#if dbLeader}
            <div class="leader-art" style={cardBg(dbLeader)}></div>
            <div class="leader-info">
              <div class="leader-name">{dbLeader.name}</div>
              <div class="leader-sub">{dbLeader.color} · {dbLeader.rarity}</div>
              <div class="leader-life-tag">❤️ Life: <b>{leaderLife}</b></div>
            </div>
            <button class="leader-remove" onclick={(e) => { e.stopPropagation(); clearDBLeader(); }}>✕</button>
          {:else}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            เลือก Leader ก่อน
          {/if}
        </div>

        <!-- DON!! Slot -->
        <div class="don-slot">
          <div class="don-slot-label">
            <span class="don-icon">⚡</span>
            DON!! Deck
            <span class="don-hint">(แยกจาก 50 ใบ)</span>
          </div>
          <div class="don-slot-controls">
            <button class="don-btn" onclick={() => { if (dbDonCount > 1) dbDonCount--; }}>−</button>
            <span class="don-count">{dbDonCount} ใบ</span>
            <button class="don-btn" onclick={() => { if (dbDonCount < 20) dbDonCount++; }}>+</button>
          </div>
          <div class="don-slot-note">ค่าเริ่มต้น OPTCG = 10 ใบ</div>
        </div>
      </div>

      <div class="deck-list">
        {#if sortedList.length === 0}
          <div class="deck-empty">ยังไม่มีการ์ด<br>คลิกการ์ดเพื่อเพิ่ม</div>
        {:else}
          {@const grouped = sortedList.reduce((acc: Record<string, typeof sortedList>, item) => {
            const t = item.d.type === 'Character' ? 'Character' : item.d.type === 'Event' ? 'Event' : 'Stage';
            if (!acc[t]) acc[t] = []; acc[t].push(item); return acc;
          }, {})}
          {#each Object.entries(grouped) as [typeName, items]}
            <div class="deck-type-header">{typeName}</div>
            <div class="deck-grid">
              {#each items as { d, cnt } (d.id)}
                {@const quotaUsed = cardIdQuotaUsed(d.cardId)}
                {@const maxAllowed = 4}
                {@const isColorWrong = dbLeader && leaderColors.size > 0 && !String(d.color||'').split('/').map((s:string)=>s.trim()).some((c:string) => leaderColors.has(c) || c === 'Multicolor' || c === '')}
                {@const isDuplWrong = quotaUsed > maxAllowed}
                <div class="deck-card {isColorWrong ? 'err-color' : ''} {isDuplWrong ? 'err-dupl' : ''} {d.type === 'Event' || d.type === 'Stage' ? 'deck-card-landscape' : ''}">
                  <button class="deck-card-rem" onclick={() => dbRemCard(d)} title="ลบ 1 ใบ">−</button>
                  <button class="deck-card-add" onclick={() => addCardWithToast(d)} title="เพิ่ม 1 ใบ">+</button>
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="deck-card-art {d.type === 'Event' || d.type === 'Stage' ? 'deck-card-art-landscape' : ''}" style={cardBg(d)} onclick={() => openPopup(d)}></div>
                  <div class="deck-card-cnt {isDuplWrong ? 'cnt-err' : ''}">×{cnt}</div>
                  {#if isColorWrong}<div class="deck-card-tag">สีผิด</div>{/if}
                  {#if isDuplWrong}<div class="deck-card-tag dupl">เกิน 4</div>{/if}
                  <div class="deck-card-name" title={d.name}>{d.name}</div>
                </div>
              {/each}
            </div>
          {/each}
        {/if}
      </div>

      <div class="deck-footer">
        <div class="deck-color-bar">
          {#each Object.entries(deckColorCounts) as [color, cnt]}
            <div class="color-seg" style="flex:{cnt};background:{COLOR_HEX[color]||'#888'}" title="{color}: {cnt}"></div>
          {/each}
        </div>
        {#if dbLeader}
          <div class="deck-info-row">
            <span class="deck-info-item life">❤️ Life: <b>{leaderLife}</b></span>
            <span class="deck-info-sep">·</span>
            <span class="deck-info-item don">⚡ DON!!: <b>{dbDonCount}</b></span>
          </div>
        {/if}
        {#if deckReady}
          <div class="deck-status ok">✓ เด็คถูกต้องและพร้อมแล้ว!</div>
        {:else}
          <div class="deck-error-list">
            {#each deckErrors as err}
              <div class="deck-error-item">⚠ {err}</div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>

{#if popupCard}
<!-- CARD DETAIL POPUP OVERLAY -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="cdp-overlay" onclick={closePopup}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="cdp-modal" onclick={(e) => e.stopPropagation()}>
    <!-- LEFT: card image -->
    <div class="cdp-img-col">
      <div class="cdp-img" style={cardBg(popupCard)}></div>
    </div>

    <!-- RIGHT: info -->
    <div class="cdp-info-col">
      <!-- header -->
      <div class="cdp-header">
        <div class="cdp-card-id">{popupCard.cardId || popupCard.id} &nbsp;|&nbsp; {popupCard.rarity} &nbsp;|&nbsp; {popupCard.type?.toUpperCase()}</div>
        <div class="cdp-name">{popupCard.name}</div>
      </div>

      <!-- stats grid -->
      <div class="cdp-stats">
        <div class="cdp-stat-row">
          <div class="cdp-stat">
            <span class="cdp-stat-label">ไลฟ์</span>
            <span class="cdp-stat-val">{popupCard.life && popupCard.life !== '-' && popupCard.life !== '' ? popupCard.life : (popupCard.cost > 0 ? popupCard.cost : '—')}</span>
          </div>
          <div class="cdp-stat">
            <span class="cdp-stat-label">คุณลักษณะ</span>
            <span class="cdp-stat-val cdp-attr">{popupCard.attribute || '—'}</span>
          </div>
        </div>
        <div class="cdp-stat-row">
          <div class="cdp-stat">
            <span class="cdp-stat-label">พาวเวอร์</span>
            <span class="cdp-stat-val">{popupCard.power > 0 ? popupCard.power.toLocaleString() : '—'}</span>
          </div>
          <div class="cdp-stat">
            <span class="cdp-stat-label">เคาน์เตอร์</span>
            <span class="cdp-stat-val">{popupCard.counter && popupCard.counter !== '-' && popupCard.counter !== '' ? popupCard.counter : '—'}</span>
          </div>
        </div>
        <div class="cdp-stat-row cdp-stat-full">
          <div class="cdp-stat">
            <span class="cdp-stat-label">ธีมสี</span>
            <span class="cdp-stat-val">
              {#each (popupCard.color || '').split('/') as col, i}
                {#if i > 0}<span class="cdp-color-sep">/</span>{/if}
                <span class="cdp-color-chip" style="background:{({'Red':'#c0392b','Green':'#27ae60','Blue':'#2471a3','Purple':'#7d3c98','Black':'#555','Yellow':'#b7950b','Multicolor':'#7f8c8d'} as Record<string,string>)[col.trim()] || '#555'}"></span>{col.trim()}
              {/each}
            </span>
          </div>
          <div class="cdp-stat">
            <span class="cdp-stat-label">ซ่อนการ์ด พิมพ์ซ้ำ</span>
            <span class="cdp-stat-val">—</span>
          </div>
        </div>
      </div>

      <!-- feature / attribute section -->
      {#if popupCard.feature}
        <div class="cdp-section">
          <div class="cdp-section-label">คุณสมบัติ</div>
          <div class="cdp-section-val">{popupCard.feature}</div>
        </div>
      {/if}

      <!-- effect -->
      <div class="cdp-section cdp-effect-section">
        <div class="cdp-section-label">ความสามารถ</div>
        <div class="cdp-section-val cdp-effect-text">{popupCard.effect || '—'}</div>
      </div>

      <!-- card set -->
      {#if popupCard.card_set}
        <div class="cdp-card-set">
          <span class="cdp-set-label">ชุดการ์ด</span>
          <span class="cdp-set-val">{popupCard.card_set}</span>
        </div>
      {/if}

      <!-- action buttons -->
      <div class="cdp-actions">
        <button
          class="cdp-btn cdp-btn-add"
          disabled={popupAddInfo?.maxed}
          onclick={() => { if (popupCard) { handleClick(popupCard); } }}>
          {popupAddInfo?.label}
        </button>
        <button class="cdp-btn cdp-btn-close" onclick={closePopup}>ปิด</button>
      </div>
    </div>
  </div>
</div>
{/if}

<!-- TOAST NOTIFICATIONS — bottom-right -->
<div class="toast-stack">
  {#each toasts as t (t.id)}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="toast {t.ok ? 'ok' : 'err'}" onclick={() => dismissToast(t.id)}>
      <div class="toast-art" style="background-image:url('{t.img}');background-color:#34495e"></div>
      <div class="toast-body">
        <div class="toast-name">{t.name}</div>
        <div class="toast-msg">{t.msg}</div>
      </div>
      <div class="toast-icon">{t.ok ? '✓' : '✕'}</div>
    </div>
  {/each}
</div>

<style>
  /* ── ROOT ── */
  .db-root {
    position: fixed; inset: 0; z-index: 10000;
    display: flex; flex-direction: column;
    background: var(--bg); color: var(--text); font-family: inherit;
  }

  /* ── TOPBAR ── */
  .db-topbar {
    height: 48px; flex-shrink: 0;
    background: #111; color: #fff;
    display: flex; align-items: center; gap: 12px; padding: 0 16px;
    border-bottom: 1px solid #2a2a2a;
  }
  .db-logo { font-size: 13px; font-weight: 700; letter-spacing: 1.5px; }
  .db-logo span { color: #c0392b; }
  .db-sep { flex: 1; }
  .db-counter { font-size: 12px; color: #aaa; }
  .db-counter b { color: #fff; font-size: 14px; font-weight: 700; }
  .db-top-btns { display: flex; gap: 6px; }
  .tb-btn {
    height: 28px; padding: 0 11px; border-radius: 5px;
    border: 1px solid #3a3a3a; background: #1e1e1e; color: #ccc;
    font-size: 12px; font-weight: 600; cursor: pointer;
    display: flex; align-items: center; gap: 5px;
  }
  .tb-btn:hover { background: #2a2a2a; }
  .tb-btn.primary { background: #c0392b; border-color: #c0392b; color: #fff; }
  .tb-btn.primary:hover { background: #a93226; }
  .tb-btn.primary:disabled { opacity: 0.4; cursor: not-allowed; }
  .tb-btn.danger:hover { color: #f47067; border-color: #f47067; }

  /* ── BODY ── */
  .db-body {
    flex: 1; min-height: 0;
    display: grid; grid-template-columns: 220px 1fr 280px;
  }

  /* ── FILTER SIDEBAR ── */
  .db-sidebar {
    display: flex; flex-direction: column;
    border-right: 1px solid var(--border);
    background: var(--surface); min-height: 0;
  }
  .sb-top {
    flex-shrink: 0; padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    display: flex; flex-direction: column; gap: 8px;
  }
  .sb-search-wrap { position: relative; }
  .sb-search-icon {
    position: absolute; left: 9px; top: 50%; transform: translateY(-50%);
    color: var(--text3); pointer-events: none;
  }
  .sb-search {
    width: 100%; height: 32px; padding: 0 9px 0 28px;
    border: 1px solid var(--border); border-radius: 5px;
    background: var(--surface2); color: var(--text);
    font-size: 11px; outline: none;
  }
  .sb-search:focus { border-color: #c0392b; }
  .sb-type-row { display: flex; flex-wrap: wrap; gap: 4px; }
  .sb-type-btn {
    height: 22px; padding: 0 8px; border-radius: 4px;
    border: 1px solid var(--border); background: var(--surface2);
    color: var(--text3); font-size: 10px; font-weight: 700;
    letter-spacing: 0.4px; cursor: pointer;
  }
  .sb-type-btn:hover { color: var(--text); border-color: #555; }
  .sb-type-btn.active { background: #333; border-color: #666; color: #fff; }
  .sb-reset {
    height: 22px; padding: 0 8px; border-radius: 4px;
    border: 1px solid #c0392b44; background: transparent;
    color: #c0392b; font-size: 10px; font-weight: 600; cursor: pointer;
    text-align: left;
  }
  .sb-reset:hover { background: rgba(192,57,43,.1); }

  /* SECTIONS */
  .sb-sections { flex: 1; min-height: 0; overflow-y: auto; }
  .sb-section { border-bottom: 1px solid var(--border); }
  .sb-section-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 9px 12px; cursor: pointer; user-select: none;
  }
  .sb-section-head:hover { background: rgba(255,255,255,.03); }
  .sb-section-label { font-size: 11px; font-weight: 700; color: var(--text); letter-spacing: 0.5px; }
  .sb-chevron { color: var(--text3); transition: transform 0.15s; flex-shrink: 0; }
  .sb-chevron.open { transform: rotate(180deg); }
  .sb-section-body { padding: 4px 12px 10px; display: flex; flex-direction: column; gap: 1px; }
  .sb-slider-body { padding: 8px 12px 12px; }

  /* CHECKBOX */
  .sb-checkbox-row {
    display: flex; align-items: center; gap: 8px;
    padding: 5px 4px; cursor: pointer; border-radius: 4px;
  }
  .sb-checkbox-row:hover { background: rgba(255,255,255,.04); }
  .sb-checkbox {
    width: 14px; height: 14px; border-radius: 3px; flex-shrink: 0;
    border: 1.5px solid var(--border); background: transparent;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.1s;
  }
  .sb-checkbox.checked { background: #5865f2; border-color: #5865f2; }
  .sb-checkbox-label { font-size: 12px; color: var(--text2); line-height: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .color-swatch { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }

  /* CARD SET sub-search + scrollable list */
  .sb-subsearch-wrap { position: relative; margin: 2px 0 6px; }
  .sb-subsearch-icon {
    position: absolute; left: 8px; top: 50%; transform: translateY(-50%);
    color: var(--text3); pointer-events: none;
  }
  .sb-subsearch {
    width: 100%; height: 28px; padding: 0 8px 0 26px;
    border: 1px solid var(--border); border-radius: 5px;
    background: var(--surface2); color: var(--text);
    font-size: 11px; outline: none;
  }
  .sb-subsearch:focus { border-color: #c0392b; }
  .sb-checkbox-list { max-height: 260px; overflow-y: auto; display: flex; flex-direction: column; gap: 1px; }
  .sb-empty-note { font-size: 11px; color: var(--text3); padding: 8px 4px; text-align: center; }

  /* RANGE SLIDER */
  .slider-row { display: flex; align-items: center; gap: 8px; }
  .slider-val { font-size: 11px; color: #5865f2; font-weight: 700; min-width: 30px; text-align: center; }
  .slider-track { flex: 1; position: relative; height: 20px; display: flex; align-items: center; }
  .slider-fill {
    position: absolute; height: 4px; background: #5865f2;
    border-radius: 2px; pointer-events: none;
  }
  .sb-range {
    position: absolute; width: 100%; height: 4px;
    -webkit-appearance: none; appearance: none;
    background: var(--border); border-radius: 2px; outline: none;
    pointer-events: none;
  }
  .sb-range::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 16px; height: 16px; border-radius: 50%;
    background: #5865f2; cursor: pointer; pointer-events: all;
    border: 2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.4);
  }
  .sb-range::-moz-range-thumb {
    width: 16px; height: 16px; border-radius: 50%;
    background: #5865f2; cursor: pointer; pointer-events: all;
    border: 2px solid #fff;
  }
  .sb-range:first-child { z-index: 1; }
  .sb-range:last-of-type { z-index: 2; background: transparent; }

  /* ── CENTER ── */
  .db-center {
    display: flex; flex-direction: column; min-height: 0;
    border-right: 1px solid var(--border);
  }
  .pool-meta {
    flex-shrink: 0; padding: 5px 12px;
    font-size: 11px; color: var(--text3); font-weight: 600;
    border-bottom: 1px solid var(--border);
  }

  /* PAGINATION */
  .db-pagination {
    flex-shrink: 0; padding: 6px 12px;
    display: flex; align-items: center; justify-content: center; gap: 3px;
  }
  .db-pagination.top { border-bottom: 1px solid var(--border); }
  .db-pagination.bottom { border-top: 1px solid var(--border); }
  .pg-btn {
    min-width: 30px; height: 28px; border-radius: 4px;
    border: 1px solid var(--border); background: var(--surface);
    color: var(--text2); font-size: 11px; font-weight: 700;
    cursor: pointer; padding: 0 8px;
  }
  .pg-btn:hover:not(:disabled) { background: var(--surface2); color: var(--text); }
  .pg-btn.active { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
  .pg-btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .pg-ellipsis { font-size: 12px; color: var(--text3); padding: 0 2px; }

  /* CARD GRID */
  .db-grid {
    flex: 1; min-height: 0; overflow-y: auto; padding: 10px 12px;
    display: grid; grid-template-columns: repeat(5, 1fr);
    gap: 8px; align-content: start;
  }
  .card-thumb {
    position: relative; cursor: pointer;
    border-radius: 6px; overflow: visible;
    border: 2px solid transparent; aspect-ratio: 2/3;
    background: var(--surface2);
    transition: border-color 0.1s;
  }
  .card-thumb > .card-face {
    border-radius: 4px; overflow: hidden;
  }
  .card-thumb:hover { border-color: #c0392b; }
  .card-thumb.selected { border-color: #27ae60; }
  .card-thumb.maxed { opacity: 0.5; }
  .card-thumb.skeleton { animation: skeleton-pulse 1.5s infinite; }
  /* Event / Stage cards are landscape (3:2) */
  .card-thumb.card-landscape { aspect-ratio: 3/2; }
  @keyframes skeleton-pulse { 0%{opacity:.6} 50%{opacity:.3} 100%{opacity:.6} }
  .card-face {
    width: 100%; height: 100%;
    background-size: cover; background-position: center;
    display: flex; flex-direction: column;
    align-items: center; justify-content: flex-end;
    padding: 4px; position: relative;
  }
  .leader-badge {
    position: absolute; top: 3px; left: 3px;
    background: #c0392b; color: #fff;
    font-size: 7px; font-weight: 700; padding: 1px 4px; border-radius: 3px;
  }
  .card-face-inner {
    width: 100%; text-align: center;
    background: rgba(0,0,0,0.6); border-radius: 3px; padding: 3px 2px;
  }
  .card-face-name { font-size: 8px; color: #fff; font-weight: 700; line-height: 1.2; }
  .card-face-power { font-size: 9px; color: #ffd; font-weight: 700; margin-top: 1px; }
  .card-face-rarity { font-size: 8px; color: #ffa; margin-top: 1px; }
  .card-count-badge {
    position: absolute; bottom: -4px; right: -4px;
    background: #c0392b; color: #fff;
    font-size: 10px; font-weight: 800; border-radius: 4px; padding: 1px 5px;
    z-index: 2; box-shadow: 0 1px 4px rgba(0,0,0,.6);
  }

  /* ── RIGHT PANEL ── */
  .db-right { display: flex; flex-direction: column; background: var(--surface); min-height: 0; }
  .deck-head { flex-shrink: 0; padding: 10px 12px; border-bottom: 1px solid var(--border); }
  .deck-progress-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  .deck-progress-label { font-size: 12px; font-weight: 700; }
  .deck-progress-count { font-size: 12px; color: var(--text3); }
  .deck-progress-bar { height: 4px; background: var(--surface2); border-radius: 2px; overflow: hidden; margin-bottom: 8px; }
  .deck-progress-fill { height: 100%; background: #c0392b; border-radius: 2px; transition: width 0.2s; }
  .deck-progress-fill.complete { background: #27ae60; }

  .leader-slot {
    display: grid; grid-template-columns: 42px 1fr auto;
    gap: 8px; padding: 7px 8px; align-items: center;
    border: 1px solid var(--border); border-radius: 8px;
    background: rgba(255,255,255,.03); cursor: pointer; min-height: 60px;
  }
  .leader-slot.empty {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    color: var(--text3); font-size: 12px; border-style: dashed;
  }
  .leader-art { width: 42px; aspect-ratio: 2/3; border-radius: 5px; background-size: cover; background-position: center; }
  .leader-info { min-width: 0; }
  .leader-name { font-size: 11px; font-weight: 700; color: var(--text); line-height: 1.3; }
  .leader-sub { font-size: 10px; color: var(--text3); margin-top: 2px; }
  .leader-remove {
    flex-shrink: 0; height: 24px; padding: 0 7px;
    border-radius: 5px; border: 1px solid var(--border);
    background: var(--surface2); color: var(--red);
    font-size: 11px; font-weight: 700; cursor: pointer;
  }
  .leader-remove:hover { background: rgba(218,54,51,.15); border-color: var(--red); }
  .leader-life-tag {
    font-size: 10px; color: #e74c3c; margin-top: 2px; font-weight: 600;
  }
  .leader-life-tag b { font-size: 12px; }

  /* DON!! SLOT */
  .don-slot {
    margin-top: 8px; border: 1px solid #f39c1244;
    background: rgba(243,156,18,.06); border-radius: 8px;
    padding: 8px 10px; display: flex; flex-direction: column; gap: 4px;
  }
  .don-slot-label {
    font-size: 11px; font-weight: 700; color: #f39c12;
    display: flex; align-items: center; gap: 5px;
  }
  .don-icon { font-size: 13px; }
  .don-hint { font-size: 10px; color: var(--text3); font-weight: 400; }
  .don-slot-controls {
    display: flex; align-items: center; justify-content: center;
    gap: 8px; margin: 2px 0;
  }
  .don-btn {
    width: 28px; height: 28px; border-radius: 6px;
    border: 1px solid #f39c1266; background: rgba(243,156,18,.12);
    color: #f39c12; font-size: 16px; font-weight: 700;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    line-height: 1;
  }
  .don-btn:hover { background: rgba(243,156,18,.25); }
  .don-count {
    font-size: 18px; font-weight: 800; color: #f39c12;
    min-width: 60px; text-align: center;
  }
  .don-slot-note {
    font-size: 10px; color: var(--text3); text-align: center;
  }

  .deck-list { flex: 1; min-height: 0; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 4px; }
  .deck-empty { text-align: center; padding: 24px 8px; color: var(--text3); font-size: 12px; line-height: 1.6; border: 1px dashed var(--border); border-radius: 8px; margin: 4px; }
  .deck-type-header { font-size: 10px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: var(--text3); padding: 6px 4px 2px; }

  /* 3-column card grid for cards in the deck */
  .deck-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 4px; }
  .deck-card {
    position: relative; border-radius: 7px; overflow: visible;
    border: 2px solid transparent; background: rgba(255,255,255,.025);
  }
  .deck-card.err-color { border-color: rgba(218,54,51,.7); }
  .deck-card.err-dupl { border-color: rgba(210,153,34,.7); }
  .deck-card-art {
    width: 100%; aspect-ratio: 2/3; border-radius: 6px;
    background-size: cover; background-position: center;
    background-color: var(--surface2); cursor: pointer;
  }
  /* Event / Stage landscape override */
  .deck-card-art.deck-card-art-landscape { aspect-ratio: 3/2; }
  /* When the card itself is landscape, make it span all 3 columns */
  .deck-card.deck-card-landscape { grid-column: 1 / -1; }
  .deck-card-name {
    font-size: 9px; font-weight: 600; color: var(--text2);
    text-align: center; padding: 2px 2px 0; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap;
  }
  .deck-card-cnt {
    position: absolute; bottom: 16px; right: 3px;
    background: rgba(0,0,0,.75); color: #fff;
    font-size: 11px; font-weight: 800; border-radius: 4px;
    padding: 1px 5px; line-height: 1.3;
    box-shadow: 0 1px 3px rgba(0,0,0,.5);
  }
  .deck-card-cnt.cnt-err { color: var(--gold); }
  .deck-card-tag {
    position: absolute; top: 3px; left: 3px;
    background: var(--red); color: #fff;
    font-size: 8px; font-weight: 700; padding: 1px 4px; border-radius: 3px;
  }
  .deck-card-tag.dupl { background: var(--gold); top: 3px; left: 3px; }
  .deck-card-tag + .deck-card-tag { top: 16px; }
  .deck-card-add, .deck-card-rem {
    position: absolute; top: 3px; z-index: 3;
    width: 18px; height: 18px; border-radius: 4px;
    border: 1px solid var(--border2); background: rgba(20,20,20,.85);
    color: #fff; font-size: 12px; font-weight: 800; line-height: 1;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    opacity: 0; transition: opacity 0.12s;
  }
  .deck-card:hover .deck-card-add, .deck-card:hover .deck-card-rem { opacity: 1; }
  .deck-card-add { right: 3px; background: rgba(39,174,96,.9); border-color: #27ae60; }
  .deck-card-rem { right: 23px; background: rgba(192,57,43,.9); border-color: #c0392b; }
  .deck-card-add:hover { background: #27ae60; }
  .deck-card-rem:hover { background: #c0392b; }

  .deck-footer { flex-shrink: 0; padding: 8px 12px; border-top: 1px solid var(--border); }
  .deck-color-bar { display: flex; gap: 2px; height: 5px; border-radius: 3px; overflow: hidden; margin-bottom: 6px; }
  .color-seg { height: 100%; min-width: 2px; transition: flex 0.3s; }
  .deck-info-row {
    display: flex; align-items: center; justify-content: center;
    gap: 8px; margin-bottom: 5px;
  }
  .deck-info-item { font-size: 11px; color: var(--text3); }
  .deck-info-item b { font-size: 13px; font-weight: 800; }
  .deck-info-item.life b { color: #e74c3c; }
  .deck-info-item.don b { color: #f39c12; }
  .deck-info-sep { color: var(--text3); font-size: 11px; }
  .deck-status { font-size: 11px; text-align: center; color: var(--text3); }
  .deck-status.ok { color: #27ae60; font-weight: 700; }
  .deck-error-list { display: flex; flex-direction: column; gap: 3px; max-height: 110px; overflow-y: auto; }
  .deck-error-item { font-size: 10px; color: var(--red); background: rgba(218,54,51,.1); border: 1px solid rgba(218,54,51,.25); border-radius: 4px; padding: 3px 7px; line-height: 1.4; }

  /* topbar error badge */
  .topbar-err-badge { background: var(--red); color: #fff; font-size: 10px; font-weight: 700; border-radius: 10px; padding: 1px 7px; margin-left: 6px; }

  /* ── CARD DETAIL POPUP ── */
  .cdp-overlay {
    position: fixed; inset: 0; z-index: 20000;
    background: rgba(0,0,0,0.75); backdrop-filter: blur(3px);
    display: flex; align-items: center; justify-content: center;
  }
  .cdp-modal {
    display: flex; flex-direction: row;
    background: #fff; color: #111;
    border-radius: 14px; overflow: hidden;
    max-width: 980px; width: 90vw; max-height: 90vh;
    box-shadow: 0 32px 100px rgba(0,0,0,.8);
    animation: cdp-in 0.18s ease;
  }
  @keyframes cdp-in {
    from { opacity: 0; transform: scale(0.95) translateY(8px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }

  /* LEFT col - card image */
  .cdp-img-col {
    flex-shrink: 0; width: 400px; background: #1a1a1a;
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
  }
  .cdp-img {
    width: 100%; aspect-ratio: 2/3;
    border-radius: 10px; background-size: cover; background-position: center;
    box-shadow: 0 8px 32px rgba(0,0,0,.6);
  }

  /* RIGHT col - info */
  .cdp-info-col {
    flex: 1; min-width: 0; padding: 24px 28px 20px;
    display: flex; flex-direction: column; gap: 14px;
    overflow-y: auto; max-height: 90vh;
  }

  .cdp-header { border-bottom: 1px solid #e5e5e5; padding-bottom: 12px; }
  .cdp-card-id {
    font-size: 12px; font-weight: 600; color: #888; letter-spacing: 0.5px;
    margin-bottom: 6px;
  }
  .cdp-name {
    font-size: 26px; font-weight: 900; color: #111; line-height: 1.2;
  }

  /* stats grid */
  .cdp-stats { display: flex; flex-direction: column; gap: 0; }
  .cdp-stat-row {
    display: grid; grid-template-columns: 1fr 1fr;
    border-bottom: 1px solid #f0f0f0;
  }
  .cdp-stat-row.cdp-stat-full { grid-template-columns: 1fr 1fr; }
  .cdp-stat {
    padding: 10px 0; display: flex; flex-direction: column; gap: 3px;
    border-right: 1px solid #f0f0f0;
  }
  .cdp-stat:last-child { border-right: none; padding-left: 14px; }
  .cdp-stat-label { font-size: 11px; font-weight: 600; color: #888; }
  .cdp-stat-val {
    font-size: 15px; font-weight: 700; color: #111;
    display: flex; align-items: center; gap: 5px; flex-wrap: wrap;
  }
  .cdp-attr {
    background: #7d3c98; color: #fff;
    font-size: 11px; padding: 2px 8px; border-radius: 20px;
    width: fit-content; font-weight: 700;
  }
  .cdp-color-chip {
    display: inline-block; width: 10px; height: 10px;
    border-radius: 50%; flex-shrink: 0;
  }
  .cdp-color-sep { color: #ccc; font-weight: 400; }

  /* sections */
  .cdp-section { display: flex; flex-direction: column; gap: 5px; }
  .cdp-section-label {
    font-size: 11px; font-weight: 800; color: #111; letter-spacing: 0.3px;
  }
  .cdp-section-val { font-size: 13px; color: #333; line-height: 1.5; }
  .cdp-effect-section { flex: 1; }
  .cdp-effect-text {
    background: #f8f8f8; border-radius: 8px; padding: 10px 12px;
    border: 1px solid #e8e8e8; font-size: 12.5px; line-height: 1.65;
    max-height: 160px; overflow-y: auto; color: #222;
    white-space: pre-wrap;
  }

  /* card set */
  .cdp-card-set {
    background: #f5f5f5; border-radius: 8px; padding: 8px 12px;
    display: flex; flex-direction: column; gap: 2px;
  }
  .cdp-set-label { font-size: 10px; font-weight: 700; color: #888; text-transform: uppercase; }
  .cdp-set-val { font-size: 12px; font-weight: 600; color: #333; }

  /* action buttons */
  .cdp-actions { display: flex; gap: 8px; margin-top: auto; padding-top: 4px; }
  .cdp-btn {
    flex: 1; height: 38px; border-radius: 8px; border: none;
    font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.15s;
  }
  .cdp-btn-add {
    background: #c0392b; color: #fff;
  }
  .cdp-btn-add:hover { background: #a93226; }
  .cdp-btn-add:disabled {
    background: #ccc; color: #888; cursor: not-allowed;
  }
  .cdp-btn-close {
    background: #f0f0f0; color: #555; flex: 0 0 80px;
  }
  .cdp-btn-close:hover { background: #e0e0e0; }

  .deck-save-msg { font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 6px; align-self: center; }
  .deck-save-msg.ok { color: var(--green2); background: rgba(63,185,80,0.12); }
  .deck-save-msg.err { color: var(--red); background: rgba(218,54,51,0.12); }
  .db-spinner { display: inline-block; width: 10px; height: 10px; border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff; border-radius: 50%; animation: spin 0.6s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── TOAST NOTIFICATIONS (bottom-right) ── */
  .toast-stack {
    position: fixed; right: 16px; bottom: 16px; z-index: 30000;
    display: flex; flex-direction: column-reverse; gap: 8px;
    pointer-events: none;
  }
  .toast {
    pointer-events: auto; cursor: pointer;
    display: flex; align-items: center; gap: 10px;
    width: 260px; padding: 8px 10px; border-radius: 10px;
    background: #1c2128; border: 1px solid var(--border2);
    box-shadow: 0 8px 28px rgba(0,0,0,.55);
    animation: toast-in 0.18s ease, toast-out 0.18s ease 2.4s forwards;
  }
  .toast.ok { border-color: rgba(46,160,67,.5); }
  .toast.err { border-color: rgba(218,54,51,.55); }
  .toast-art {
    width: 30px; aspect-ratio: 2/3; flex-shrink: 0; border-radius: 4px;
    background-size: cover; background-position: center;
  }
  .toast-body { flex: 1; min-width: 0; }
  .toast-name { font-size: 12px; font-weight: 700; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .toast-msg { font-size: 11px; color: var(--text3); margin-top: 1px; }
  .toast-icon {
    width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 800; color: #fff;
  }
  .toast.ok .toast-icon { background: var(--green2); }
  .toast.err .toast-icon { background: var(--red); }
  @keyframes toast-in { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes toast-out { to { opacity: 0; transform: translateX(24px); } }
</style>
