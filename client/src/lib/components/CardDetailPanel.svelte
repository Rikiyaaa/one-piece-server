<script lang="ts">
  let { detailData = $bindable(), cardBg } = $props<{
    detailData: any;
    cardBg: (d: any) => string;
  }>();
</script>

{#if detailData}
<div id="card-detail-panel">
  <div class="detail-card-area">
    <div class="detail-img-wrap">
      <div class="detail-img" style={cardBg(detailData)}></div>
    </div>
    <button class="detail-close-x" onclick={()=>detailData=null} aria-label="close">✕</button>
  </div>
  <div class="detail-info">
    <div class="detail-name">{detailData.name}</div>
    <div class="detail-type">{detailData.color} · {detailData.type}</div>
    <div class="detail-tags">
      {#if detailData.cost>0}<span class="tag">Cost {detailData.cost}</span>{/if}
      {#if detailData.power>0}<span class="tag">{detailData.power/1000}k Power</span>{/if}
      <span class="tag" style="color:var(--gold)">{detailData.rarity}</span>
    </div>
    <div class="detail-effect">{detailData.effect||'—'}</div>
  </div>
</div>
{/if}
