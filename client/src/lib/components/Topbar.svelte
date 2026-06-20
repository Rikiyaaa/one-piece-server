<script lang="ts">
  let {
    confirmNewGame,
    leaveRoom,
    isHost,
    boardScale = $bindable(1),
    onRollDice = () => {},
    diceRolling = false,
    onUndo = () => {},
    mulliganAvailable = false,
    onMulligan = () => {},
    onActivePhase = () => {},
    onPeekLife = () => {},
    onSearchTrash = () => {},
    onReturnAllDon = () => {},
  }: {
    confirmNewGame: () => void;
    leaveRoom: () => void;
    isHost: boolean;
    boardScale: number;
    onRollDice?: () => void;
    diceRolling?: boolean;
    onUndo?: () => void;
    mulliganAvailable?: boolean;
    onMulligan?: () => void;
    onActivePhase?: () => void;
    onPeekLife?: () => void;
    onSearchTrash?: () => void;
    onReturnAllDon?: () => void;
  } = $props();

  function zoom(delta: number) {
    boardScale = Math.min(Math.max(0.5, boardScale + delta), 2);
  }

  function handleMulligan() {
    if (!confirm('สับมือ 5 ใบกลับกองแล้วจั่วใหม่? (ทำได้รอบเดียว)')) return;
    onMulligan();
  }
</script>

<div id="topbar">
  <img src="https://s6.imgcdn.dev/YbrGfe.png" alt="CardSim" class="logo" />

  <div class="topbar-sep"></div>

  <div class="zoom-controls">
    <button class="tb-btn" onclick={() => zoom(-0.1)} title="Zoom Out">➖</button>
    <div class="zoom-val">{Math.round(boardScale * 100)}%</div>
    <button class="tb-btn" onclick={() => zoom(0.1)} title="Zoom In">➕</button>
    <button class="tb-btn" onclick={() => boardScale = 1} title="Reset Zoom">🔄</button>
  </div>

  <div class="topbar-sep"></div>

  <!-- Dice button -->
  <button
    class="tb-btn dice-btn"
    class:rolling={diceRolling}
    onclick={onRollDice}
    disabled={diceRolling}
    title="ทอยลูกเต๋า 2D6"
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="9" height="9" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/>
      <circle cx="5.5" cy="5.5" r="1.2" fill="currentColor"/>
      <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/>
      <rect x="13" y="2" width="9" height="9" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/>
      <circle cx="16" cy="5.5" r="1.2" fill="currentColor"/>
      <circle cx="19" cy="5.5" r="1.2" fill="currentColor"/>
      <circle cx="16" cy="8.5" r="1.2" fill="currentColor"/>
      <circle cx="19" cy="8.5" r="1.2" fill="currentColor"/>
      <rect x="2" y="13" width="9" height="9" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/>
      <circle cx="5.5" cy="16" r="1.2" fill="currentColor"/>
      <circle cx="8.5" cy="16" r="1.2" fill="currentColor"/>
      <circle cx="5.5" cy="19" r="1.2" fill="currentColor"/>
      <circle cx="8.5" cy="19" r="1.2" fill="currentColor"/>
      <rect x="13" y="13" width="9" height="9" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/>
      <circle cx="16" cy="16" r="1.2" fill="currentColor"/>
      <circle cx="19" cy="16" r="1.2" fill="currentColor"/>
      <circle cx="17.5" cy="19" r="1.2" fill="currentColor"/>
    </svg>
  </button>

  <div class="topbar-sep"></div>

  <button class="tb-btn" onclick={onUndo} title="ย้อนกลับ (Ctrl+Z)">↶ Undo</button>

  <div class="topbar-sep"></div>

  <button
    class="tb-btn active-phase-btn"
    onclick={onActivePhase}
    title="Active Phase (คืนสภาพ): สลับการ์ด DON!! ทั้งหมดที่ Rest (แนวนอน) กลับมาเป็น Active (แนวตั้ง)"
  >
    ♻️ Active Phase
  </button>

  <div class="topbar-sep"></div>

  <!-- Return All DON!! -->
  <button
    class="tb-btn return-don-btn"
    onclick={onReturnAllDon}
    title="Return All DON!! — ดึง DON!! ทุกใบที่กระจายอยู่บนบอร์ดกลับมารวมที่ COST Area ในสภาพ Rest (แนวนอน)"
  >
    ↩ DON!!
  </button>

  <div class="topbar-sep"></div>

  <button
    class="tb-btn peek-life-btn"
    onclick={onPeekLife}
    title="Peek Life (แอบดูการ์ดชีวิต): เห็นแค่เราคนเดียว คู่ต่อสู้ยังเห็นเป็นการ์ดคว่ำเหมือนเดิม"
  >
    👁 Peek Life
  </button>

  <div class="topbar-sep"></div>

  <!-- Mulligan: โผล่มาเฉพาะตอนยังไม่ได้ใช้สิทธิ์ -->
  {#if mulliganAvailable}
    <button class="tb-btn mulligan-btn" onclick={handleMulligan} title="สับมือ 5 ใบกลับกองแล้วจั่วใหม่ (ทำได้รอบเดียว)">
      🔁 Mulligan
    </button>
    <div class="topbar-sep"></div>
  {/if}

  <div class="spacer"></div>
  <button class="tb-btn" onclick={confirmNewGame}>🔄 เริ่มใหม่</button>
  <button class="tb-btn danger" onclick={leaveRoom}>🚪 ออกเกม</button>
</div>

<style>
  #topbar{height:44px;background:var(--surface);border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 12px;gap:8px;flex-shrink:0;z-index:100}
  .logo{height:28px;width:auto;display:block;filter:brightness(0) invert(1);object-fit:contain}
  .topbar-sep{width:1px;height:20px;background:var(--border);margin:0 4px}
  .tb-btn{height:28px;padding:0 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text2);font-size:12px;cursor:pointer;display:flex;align-items:center;gap:5px;transition:all .15s}
  .tb-btn:hover{background:var(--surface3);color:var(--text);border-color:var(--border2)}
  .tb-btn.danger:hover{background:var(--red);border-color:var(--red);color:#fff}
  .spacer{flex:1}
  .zoom-controls{display:flex;align-items:center;gap:4px;background:var(--surface2);border-radius:8px;padding:2px;border:1px solid var(--border)}
  .zoom-val{font-size:10px;font-weight:700;color:var(--text2);min-width:36px;text-align:center}

  .dice-btn { padding: 0 8px; color: var(--blue2); border-color: var(--blue); }
  .dice-btn:hover:not(:disabled) { background: var(--blue); color: #fff; border-color: var(--blue); }
  .dice-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .dice-btn.rolling { animation: dice-spin 0.4s linear infinite; opacity: 0.7; }
  @keyframes dice-spin {
    0%   { transform: rotate(0deg);   }
    25%  { transform: rotate(-8deg);  }
    75%  { transform: rotate(8deg);   }
    100% { transform: rotate(0deg);   }
  }

  /* ── ACTIVE PHASE (คืนสภาพ DON!!) ── */
  .active-phase-btn { color: var(--gold); border-color: rgba(210,153,34,.4); }
  .active-phase-btn:hover { background: var(--gold); border-color: var(--gold); color: #1a1a1a; }

  /* ── RETURN ALL DON!! ── */
  .return-don-btn {
    color: #7dd3fc;
    border-color: rgba(56,189,248,.4);
    font-weight: 700;
  }
  .return-don-btn:hover {
    background: rgba(56,189,248,.18);
    border-color: rgba(56,189,248,.8);
    color: #e0f2fe;
  }

  /* ── PEEK LIFE ── */
  .peek-life-btn { color: var(--blue2); border-color: rgba(56,139,253,.4); }
  .peek-life-btn:hover { background: var(--blue); border-color: var(--blue); color: #fff; }

  /* ── SEARCH TRASH ── */
  .search-trash-btn { color: #f97583; border-color: rgba(218,54,51,.4); }
  .search-trash-btn:hover { background: var(--red); border-color: var(--red); color: #fff; }

  /* ── MULLIGAN ── */
  .mulligan-btn {
    color: var(--gold); border-color: rgba(210,153,34,.5);
    background: rgba(210,153,34,.1); font-weight: 700;
    animation: mulligan-pulse 1.6s ease-in-out infinite;
  }
  .mulligan-btn:hover { background: var(--gold); border-color: var(--gold); color: #1a1a1a; }
  @keyframes mulligan-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(210,153,34,.35); }
    50% { box-shadow: 0 0 0 4px rgba(210,153,34,.12); }
  }
</style>
