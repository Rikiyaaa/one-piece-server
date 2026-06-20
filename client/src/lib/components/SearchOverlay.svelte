<script lang="ts">
  let {
    searchVisible = $bindable(),
    searchCount,
    searchCards = $bindable(),
    pickFromSearch,
    resolveSearch,
    cardBg
  } = $props();
</script>

{#if searchVisible}
<div id="search-overlay">
  <div id="search-panel">
    <div class="search-header">
      <span>🔍 Search {searchCount} — เลือกการ์ดเข้ามือ (เห็นแค่เราคนเดียว)</span>
    </div>
    <div class="search-grid">
      {#each searchCards as item, i (item.uid)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="search-item" onclick={()=>pickFromSearch(item.uid)} title="{item.data.name} (คลิกเพื่อเข้ามือ)">
          <div class="search-img" style={cardBg(item.data)}></div>
          <div class="search-name">{item.data.name}</div>
          {#if i===0}<div class="search-top-badge">บนสุด</div>{/if}
        </div>
      {/each}
      {#if searchCards.length===0}
        <div class="search-empty">เลือกครบทุกใบแล้ว</div>
      {/if}
    </div>
    <div class="search-footer">
      <span class="search-hint">คลิกการ์ดเพื่อหยิบเข้ามือ ที่เหลือ {searchCards.length} ใบ จัดการได้ที่นี่:</span>
      <div class="search-footer-btns">
        <button class="search-btn bottom-btn" onclick={()=>resolveSearch('bottom')}>📥 Put Back (ใต้กอง)</button>
        <button class="search-btn trash-btn" onclick={()=>resolveSearch('trash')}>🗑 ทิ้งที่เหลือลงสุสาน</button>
      </div>
    </div>
  </div>
</div>
{/if}

<style>
  /* Managed globally or locally */
</style>
