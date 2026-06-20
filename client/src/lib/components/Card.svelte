<script lang="ts">
  import type { CardData, CardState } from '$lib/types';

  let {
    card,
    owner,
    isDon = false,
    isSelected = false,
    cardAction,
    cardBg,
    cssT,
    onContextMenu,
    onDoubleClick,
    onClick
  } = $props();

  // เคลียร์ flag dropAnim เองหลัง animation จบ กันค้าง (เผื่อ animationend ไม่ยิง เช่น element ถูกถอดระหว่างเล่น)
  function onDropAnimEnd() {
    card.dropAnim = false;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div 
  use:cardAction={card.cid}
  class="{isDon ? 'don-card' : 'card'} {owner==='opp'?'theirs':'mine'} {isSelected?'selected':''} {card.dropAnim?'card-drop-flip':''}"
  style:left="{card.x}px"
  style:top="{card.y}px"
  style:transform="rotate({card.rotation + (card.tapped ? 90 : 0) + (owner === 'opp' ? 180 : 0)}deg)"
  data-cid={card.cid}
  data-is-don={isDon || undefined}
  oncontextmenu={onContextMenu}
  ondblclick={onDoubleClick}
  onclick={onClick}
  onanimationend={onDropAnimEnd}
>
  {#if isDon}
    <div class="card-flipper" class:flipped={card.faceDown || card.spawning}>
      <div class="card-front don-card-front"></div>
      <div class="card-back-face don-card-back"></div>
    </div>
  {:else}
    <div class="card-flipper" class:flipped={card.faceDown}>
      <div class="card-front">
        <div class="card-face-bg" style={cardBg(card.data)}></div>
        {#if card.counter}
          <div class="card-counter-badge" class:neg={card.counter < 0}>
            {card.counter > 0 ? '+' : ''}{card.counter}
          </div>
        {/if}
        <div class="card-rarity-strip r-{cssT(card.data.rarity)}"></div>
      </div>
      <div class="card-back-face">
        <div class="card-back-design"><div class="anchor"></div></div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Styles are managed globally in +page.svelte to avoid conflicts */
</style>
