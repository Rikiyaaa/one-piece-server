<script lang="ts">
  import type { Zone } from '$lib/types';

  let {
    zone,
    getZoneStyle
  } = $props();
</script>

<div class="zone" data-zone-id={zone.id} data-side={zone.side} style={getZoneStyle(zone)}>
  <div class="zone-label">{zone.label}</div>
</div>

<style>
  :global(.zone){position:absolute;border:1px dashed rgba(255,255,255,.12);border-radius:8px;background:rgba(0,0,0,0);transition:background .2s,border-color .2s;display:flex;align-items:center;justify-content:center;flex-direction:column;pointer-events:none;z-index:2;opacity:.32}
  :global(.zone[data-side="you"]){border-color:rgba(56,139,253,.22)}
  :global(.zone[data-side="opp"]){border-color:rgba(218,54,51,.2)}
  :global(.zone.drag-over){background:rgba(56,139,253,.15);border-color:rgba(56,139,253,.72);opacity:1}
  :global(.zone-label){font-size:8px;font-weight:700;letter-spacing:1px;color:rgba(255,255,255,.36);text-transform:uppercase;pointer-events:none;position:absolute;bottom:4px;text-shadow:0 1px 3px rgba(0,0,0,.9)}
</style>
