<script lang="ts">
  let {
    deckSearchVisible = $bindable(),
    deckSearchPickCount = $bindable(),
    deckSearchCards = $bindable(),
    deckSearchQuery = $bindable(),
    deckSearchSelected = $bindable(),
    myDeckCount,
    closeDeckSearch,
    confirmDeckSearch,
    toggleDeckSearchCard,
    getDeckSearchFiltered,
    cardBg
  } = $props();
</script>

{#if deckSearchVisible}
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div id="deck-search-overlay" onclick={closeDeckSearch}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div id="deck-search-panel" onclick={(e:MouseEvent)=>e.stopPropagation()}>

    <!-- HEADER -->
    <div class="ds-header">
      <span class="ds-title">🃏 Search Deck — เลือก {deckSearchPickCount} ใบ</span>
      <div class="ds-header-controls">
        <div class="ds-pick-ctrl">
          <span class="ds-pick-label">เลือก:</span>
          <button class="ds-pick-btn" onclick={()=>{ if(deckSearchPickCount>1) deckSearchPickCount--; }}>−</button>
          <span class="ds-pick-num">{deckSearchPickCount}</span>
          <button class="ds-pick-btn" onclick={()=>{ if(deckSearchPickCount<myDeckCount) deckSearchPickCount++; }}>+</button>
          <span class="ds-pick-label">ใบ</span>
        </div>
        <button class="ds-close-btn" onclick={closeDeckSearch} aria-label="close">✕</button>
      </div>
    </div>

    <!-- SEARCH BAR -->
    <div class="ds-search-bar">
      <input
        class="ds-search-input"
        type="text"
        placeholder="🔍 ค้นชื่อ / สี / ประเภท..."
        bind:value={deckSearchQuery}
      />
      <span class="ds-count-badge">{getDeckSearchFiltered().length} / {deckSearchCards.length} ใบ</span>
    </div>

    <!-- CARD GRID -->
    <div class="ds-grid">
      {#each getDeckSearchFiltered() as item (item.uid)}
        {@const isSelected = deckSearchSelected.has(item.uid)}
        {@const selIdx = isSelected ? [...deckSearchSelected].indexOf(item.uid) + 1 : 0}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="ds-item"
          class:ds-selected={isSelected}
          onclick={()=>toggleDeckSearchCard(item.uid)}
          title="{item.data.name} — {item.data.color} {item.data.type}{item.data.cost?` · Cost ${item.data.cost}`:''}  (คลิกเพื่อ{isSelected?'ยกเลิก':'เลือก'})"
        >
          <div class="ds-img" style={cardBg(item.data)}></div>
          {#if isSelected}
            <div class="ds-sel-badge">{selIdx}</div>
          {/if}
          <div class="ds-name">{item.data.name}</div>
          <div class="ds-meta">{item.data.color} · {item.data.type}</div>
        </div>
      {/each}
      {#if getDeckSearchFiltered().length === 0}
        <div class="ds-empty">ไม่พบการ์ดที่ค้นหา</div>
      {/if}
    </div>

    <!-- FOOTER -->
    <div class="ds-footer">
      <span class="ds-sel-hint">
        เลือกแล้ว {deckSearchSelected.size} / {deckSearchPickCount} ใบ
        {#if deckSearchSelected.size > 0}
          — {deckSearchCards.filter((c: any)=>deckSearchSelected.has(c.uid)).map((c: any)=>c.data.name).join(', ')}
        {/if}
      </span>
      <div class="ds-footer-btns">
        <button class="ds-btn ds-cancel-btn" onclick={closeDeckSearch}>ยกเลิก</button>
        <button
          class="ds-btn ds-confirm-btn"
          class:ds-btn-ready={deckSearchSelected.size > 0}
          onclick={confirmDeckSearch}
          disabled={deckSearchSelected.size === 0}
        >
          ✅ หยิบเข้ามือ ({deckSearchSelected.size} ใบ) + สับกอง
        </button>
      </div>
    </div>

  </div>
</div>
{/if}

<style>
  /* Managed globally */
</style>
