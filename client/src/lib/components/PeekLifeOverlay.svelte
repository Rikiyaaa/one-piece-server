<script lang="ts">
  import type { CardState } from '$lib/types';

  let { peekLifeVisible = $bindable(), peekLifeCards = [], detailData = $bindable(), cardBg } = $props<{
    peekLifeVisible: boolean;
    peekLifeCards: CardState[];
    detailData: any;
    cardBg: (d: any) => string;
  }>();
</script>

{#if peekLifeVisible}
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div id="peek-life-overlay" onclick={()=>peekLifeVisible=false}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div id="peek-life-panel" onclick={(e:MouseEvent)=>e.stopPropagation()}>
    <div class="peek-life-header">
      <span>👁 Peek Life — เห็นแค่เราคนเดียว ({peekLifeCards.length} ใบ)</span>
      <button class="peek-life-close" onclick={()=>peekLifeVisible=false} aria-label="close">✕</button>
    </div>
    <div class="peek-life-grid">
      {#each peekLifeCards as c, i (c.cid)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="peek-life-item" onclick={()=>detailData=c.data} title={c.data.name}>
          <div class="peek-life-img" style={cardBg(c.data)}></div>
          <div class="peek-life-name">{c.data.name}</div>
          {#if i===0}<div class="peek-life-top-badge">บนสุด</div>{/if}
        </div>
      {/each}
      {#if peekLifeCards.length===0}
        <div class="peek-life-empty">ไม่มีการ์ดเหลือใน Life Zone แล้ว</div>
      {/if}
    </div>
  </div>
</div>
{/if}
