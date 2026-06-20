<script lang="ts">
  let {
    trashSearchVisible = $bindable(),
    trashSearchQuery = $bindable(),
    closeTrashSearch,
    pickFromTrashSearch,
    getTrashSearchFiltered,
    getTrashSearchEntries,
    cardBg
  } = $props();
</script>

{#if trashSearchVisible}
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div id="deck-search-overlay" onclick={closeTrashSearch}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div id="deck-search-panel" onclick={(e:MouseEvent)=>e.stopPropagation()}>

    <!-- HEADER -->
    <div class="ds-header">
      <span class="ds-title">🗑 Search Trash — เลือกการ์ดเข้ามือ</span>
      <div class="ds-header-controls">
        <button class="ds-close-btn" onclick={closeTrashSearch} aria-label="close">✕</button>
      </div>
    </div>

    <!-- SEARCH BAR -->
    <div class="ds-search-bar">
      <input
        class="ds-search-input"
        type="text"
        placeholder="🔍 ค้นชื่อ / สี / ประเภท..."
        bind:value={trashSearchQuery}
      />
      <span class="ds-count-badge">{getTrashSearchFiltered().length} / {getTrashSearchEntries().length} ใบ</span>
    </div>

    <!-- CARD GRID -->
    <div class="ds-grid">
      {#each getTrashSearchFiltered() as item (item.cid)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="ds-item"
          onclick={()=>pickFromTrashSearch(item.cid, item.cardId)}
          title="{item.data.name} — {item.data.color} {item.data.type}{item.data.cost?` · Cost ${item.data.cost}`:''}  (คลิกเพื่อหยิบเข้ามือ)"
        >
          <div class="ds-img" style={cardBg(item.data)}></div>
          <div class="ds-name">{item.data.name}</div>
          <div class="ds-meta">{item.data.color} · {item.data.type}</div>
        </div>
      {/each}
      {#if getTrashSearchFiltered().length === 0}
        <div class="ds-empty">{getTrashSearchEntries().length===0 ? 'สุสานยังไม่มีการ์ด' : 'ไม่พบการ์ดที่ค้นหา'}</div>
      {/if}
    </div>

    <!-- FOOTER -->
    <div class="ds-footer">
      <span class="ds-sel-hint">คลิกการ์ดเพื่อหยิบเข้ามือทันที (หยิบได้หลายใบต่อเนื่อง)</span>
      <div class="ds-footer-btns">
        <button class="ds-btn ds-cancel-btn" onclick={closeTrashSearch}>ปิด</button>
      </div>
    </div>

  </div>
</div>
{/if}

<style>
  /* Managed globally */
</style>
