<script lang="ts">
  let {
    scryVisible = $bindable(),
    scryCount,
    scryCards = $bindable(),
    scryDragIdx = $bindable(),
    scryDropIdx = $bindable(),
    closeScry,
    confirmScry,
    scryDragStart,
    scryDragEnter,
    scryDragEnd,
    scryMove,
    scryToBottom,
    cardBg
  } = $props();
</script>

{#if scryVisible}
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div id="scry-overlay" onclick={closeScry}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div id="scry-panel" onclick={(e:MouseEvent)=>e.stopPropagation()}>

    <!-- HEADER -->
    <div class="scry-header">
      <div class="scry-header-left">
        <span class="scry-title">🔮 Scry {scryCount}</span>
        <span class="scry-subtitle">ลากสลับตำแหน่งได้ — [0] = ใบบนสุดของกอง</span>
      </div>
      <button class="scry-close" onclick={closeScry} aria-label="close">✕</button>
    </div>

    <!-- CARD STRIP (draggable) -->
    <div class="scry-strip">
      {#each scryCards as item, i (item.uid)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="scry-card-wrap"
          class:scry-dragging={scryDragIdx===i}
          class:scry-drop-target={scryDropIdx===i && scryDragIdx!==i}
          draggable={true}
          ondragstart={()=>scryDragStart(i)}
          ondragenter={(e)=>{ e.preventDefault(); scryDragEnter(i); }}
          ondragover={(e)=>e.preventDefault()}
          ondragend={scryDragEnd}
          title="{item.data.name} — ลากเพื่อสลับตำแหน่ง"
        >
          <!-- position badge -->
          <div class="scry-pos-badge" class:scry-top={i===0}>
            {#if i===0}TOP{:else}{i+1}{/if}
          </div>

          <!-- card art -->
          <div class="scry-card-img" style={cardBg(item.data)}></div>

          <!-- card info -->
          <div class="scry-card-info">
            <div class="scry-card-name">{item.data.name}</div>
            <div class="scry-card-meta">{item.data.color} · {item.data.type}</div>
            {#if item.data.cost > 0}
              <div class="scry-card-cost">Cost {item.data.cost}</div>
            {/if}
          </div>

          <!-- move arrows -->
          <div class="scry-arrows">
            <button
              class="scry-arrow-btn"
              onclick={()=>scryMove(i,-1)}
              disabled={i===0}
              title="ขึ้น (ใกล้บนกองมากขึ้น)"
            >◀</button>
            <button
              class="scry-arrow-btn"
              onclick={()=>scryMove(i,1)}
              disabled={i===scryCards.length-1}
              title="ลง (ใกล้ล่างกองมากขึ้น)"
            >▶</button>
            <button
              class="scry-arrow-btn scry-tobottom-btn"
              onclick={()=>scryToBottom(i)}
              disabled={i===scryCards.length-1}
              title="ส่งไปล่างสุดของกลุ่ม"
            >⇥</button>
          </div>
        </div>
      {/each}
    </div>

    <!-- FOOTER -->
    <div class="scry-footer">
      <span class="scry-order-hint">
        ลำดับจากซ้าย → ขวา: บนสุด → ล่างสุด · ลากสลับ หรือกดลูกศร ◀ ▶
      </span>
      <div class="scry-footer-btns">
        <button class="scry-btn-cancel" onclick={closeScry}>↩ ใส่คืนตามเดิม</button>
        <button class="scry-btn-confirm" onclick={confirmScry}>✅ ยืนยันลำดับนี้</button>
      </div>
    </div>

  </div>
</div>
{/if}

<style>
  /* Managed globally */
</style>
