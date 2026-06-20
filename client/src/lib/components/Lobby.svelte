<script lang="ts">
  import { fade as fadeIn } from 'svelte/transition';
  let {
    gameStarted = $bindable(),
    myName = $bindable(),
    lobbyDeckSummary,
    lobbyView = $bindable(),
    countdown,
    lobbyStatus,
    lobbyStatusCls,
    openDB,
    openNewDeck,
    joinMatchmaking,
    oppName,
    fading = false,
    dbLeader = null,
    cardBg = null,
    savedDecks = [],
    selectedDeckId = null,
    deckPickerOpen = $bindable(false),
    selectDeckToPlay,
    loadDeckIntoBuilder,
    deleteSavedDeck,
    CARD_MAP = {},
    CARD_DB = []
  } = $props();

  const canMatchmake = $derived(dbLeader !== null);

  let menuOpen = $state(false);
  function toggleMenu() { menuOpen = !menuOpen; }
  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = '/login';
  }

  // MM Transition states
  let mmPhase = $state('idle');
  let foundOpponentName = $state('');
  let leaveTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (lobbyView === 'waiting' && mmPhase === 'idle') mmPhase = 'waiting';
    const PLACEHOLDERS = ['รอคู่ต่อสู้...', 'คู่ต่อสู้', 'Player', 'Player 1', 'Player 2', ''];
    if (mmPhase === 'waiting' && oppName && !PLACEHOLDERS.includes(oppName)) {
      mmPhase = 'found';
      foundOpponentName = oppName;
      leaveTimer = setTimeout(() => { mmPhase = 'leaving'; }, 2000);
    }
  });

  $effect(() => { return () => { if (leaveTimer) clearTimeout(leaveTimer); }; });

  function cancelMatchmaking() {
    if (leaveTimer) clearTimeout(leaveTimer);
    lobbyView = 'form';
    mmPhase = 'idle';
  }

  function getDeckLeaderName(deck: any) {
    const c = CARD_DB.find((x: any) => x.id === deck.leader);
    return c?.name || deck.leader || '?';
  }
  function getDeckLeaderBg(deck: any) {
    const c = CARD_DB.find((x: any) => x.id === deck.leader);
    return c && cardBg ? cardBg(c) : 'background:#374151';
  }
  function getDeckCardCount(deck: any) { return deck.cards?.length ?? 0; }
</script>

<div id="lobby" class:is-fading={fading}>
  <div class="lobby-scroll">
    <div class="lobby-track">
      <img src="https://s6.imgcdn.dev/YbeZMn.png" alt="" />
      <img src="https://s6.imgcdn.dev/YbeZMn.png" alt="" class="flipped" />
      <img src="https://s6.imgcdn.dev/YbeZMn.png" alt="" />
      <img src="https://s6.imgcdn.dev/YbeZMn.png" alt="" class="flipped" />
    </div>
  </div>

  <div class="top-nav">
    <button class="hamburger" onclick={toggleMenu} aria-label="Menu">
      <span></span><span></span><span></span>
    </button>
  </div>

  {#if menuOpen}
    <div class="menu-overlay" onclick={toggleMenu} aria-hidden="true"></div>
    <div class="menu-panel">
      <div class="menu-header">
        <img src="https://s6.imgcdn.dev/YbrGfe.png" alt="CardSim" class="menu-logo" />
        <div class="lobby-sub">Multiplayer Online</div>
      </div>
      <div class="menu-section">
        <div class="lbl">ผู้ใช้งาน:</div>
        <div class="menu-user-name">{myName}</div>
      </div>
      <div class="menu-section">
        <div class="lbl">Deck ปัจจุบัน:</div>
        <div class="menu-deck-sub">{lobbyDeckSummary}</div>
      </div>
      <div class="menu-section">
        <div class="lbl">สถานะ:</div>
        <div class="lobby-status {lobbyStatusCls}">{lobbyStatus}</div>
      </div>
      <div class="menu-divider"></div>
      <button class="logout-btn" onclick={logout}>🚪 ออกจากระบบ</button>
    </div>
  {/if}

  {#if lobbyView === 'form'}
    <div class="lobby-box" in:fadeIn>
      <div class="action-section">

        <!-- DECK SELECTOR -->
        <div class="deck-cover-group">
          <div class="cover-label">เด็คของคุณ</div>
          <div class="cover-wrap">
            {#if dbLeader}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="cover-slot has-leader" onclick={() => deckPickerOpen = true} role="button" tabindex="0">
                {#if dbLeader.imageUrl}
                  <img src={dbLeader.imageUrl} alt={dbLeader.name} class="cover-leader-img" />
                {:else}
                  <div class="cover-leader-fallback" style={cardBg ? cardBg(dbLeader, false) : ''}></div>
                {/if}
                <div class="cover-change-badge">เปลี่ยนเด็ค ▾</div>
              </div>
            {:else}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="cover-slot is-empty" role="button" tabindex="0"
                onclick={() => deckPickerOpen = true}
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') deckPickerOpen = true; }}>
                <span class="cover-plus"></span>
              </div>
            {/if}
          </div>
        </div>

        <div class="action-bar">
          <button class="action-btn" class:disabled={!canMatchmake} onclick={joinMatchmaking} title={!canMatchmake ? 'กรุณาเลือกเด็คก่อน' : 'จับคู่'}>
            <img src="https://s6.imgcdn.dev/Ybm4Ol.png" alt="จับคู่" class:btn-disabled={!canMatchmake} />
            {#if !canMatchmake}
              <div class="no-deck-badge">เลือกเด็คก่อน</div>
            {/if}
          </button>
          <button class="action-btn" onclick={openDB}>
            <img src="https://s6.imgcdn.dev/YbmCEh.png" alt="จัดเด็ค" />
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- DECK PICKER MODAL -->
  {#if deckPickerOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="picker-overlay" onclick={() => deckPickerOpen = false} aria-hidden="true"></div>
    <div class="picker-panel" in:fadeIn>
      <div class="picker-header">
        <div class="picker-title">เลือกเด็ค <span class="picker-count">{savedDecks.length}/5</span></div>
        <button class="picker-close" onclick={() => deckPickerOpen = false}>✕</button>
      </div>

      {#if savedDecks.length === 0}
        <div class="picker-empty">
          <div class="picker-empty-icon">📦</div>
          <div class="picker-empty-text">ยังไม่มีเด็คที่บันทึกไว้</div>
          <button class="picker-new-btn" onclick={() => { deckPickerOpen = false; openNewDeck(); }}>
            + สร้างเด็คใหม่
          </button>
        </div>
      {:else}
        <div class="picker-list">
          {#each savedDecks as deck (deck._id)}
            <div class="picker-item {selectedDeckId === deck._id ? 'selected' : ''}">
              <div class="picker-item-art" style={getDeckLeaderBg(deck)}></div>
              <div class="picker-item-info">
                <div class="picker-item-name">{deck.name}</div>
                <div class="picker-item-sub">
                  Leader: {getDeckLeaderName(deck)} · {getDeckCardCount(deck)} ใบ · DON!!: {deck.donCount ?? 10}
                </div>
              </div>
              <div class="picker-item-actions">
                <button class="picker-play-btn" onclick={() => selectDeckToPlay(deck)} title="เลือกเด็คนี้เล่น">
                  {selectedDeckId === deck._id ? '✓ กำลังใช้' : 'เลือก'}
                </button>
                <button class="picker-edit-btn" onclick={() => loadDeckIntoBuilder(deck)} title="แก้ไขเด็ค">✏️</button>
                <button class="picker-del-btn" onclick={() => deleteSavedDeck(deck._id)} title="ลบเด็ค">🗑</button>
              </div>
            </div>
          {/each}
        </div>

        {#if savedDecks.length < 5}
          <button class="picker-new-btn full" onclick={() => { deckPickerOpen = false; openNewDeck(); }}>
            + สร้างเด็คใหม่ ({5 - savedDecks.length} ช่องว่าง)
          </button>
        {:else}
          <div class="picker-full-note">บันทึกได้สูงสุด 5 เด็ค — ลบเด็คเก่าก่อนสร้างใหม่</div>
        {/if}
      {/if}
    </div>
  {/if}

  <!-- Matchmaking Transition Overlay -->
  {#if mmPhase === 'waiting' || mmPhase === 'found' || mmPhase === 'leaving'}
    <div class="mm-transition-overlay">
      <div class="mm-slide-panel {mmPhase === 'leaving' ? 'is-leaving' : ''}">
        <div class="mm-reveal-mask">
          <div class="mm-bg-strip" style="background-image:url('https://49enkt7tr0.ucarecd.net/7c02f63a-1102-4b7d-bc53-9439e57f5af3/bg_recommend.png')"></div>
          <div class="mm-text-layer">
            {#if mmPhase === 'waiting'}
              <div class="mm-waiting-text" in:fadeIn>Waiting for players...</div>
            {:else}
              <div class="mm-found-text" in:fadeIn>
                <span class="vs-label">พบศัตรู:</span>
                <div class="opp-display-name">{foundOpponentName}</div>
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/if}
  
  <img src="https://s6.imgcdn.dev/Ybe9lg.png" alt="" class="lobby-decoration" />
  <img src="https://49enkt7tr0.ucarecd.net/30922c04-eaa2-4fcd-b90f-e3f59ea6cb8c/footer_illust_card01.png" alt="" class="lobby-decoration-top-right card01" />
  <img src="https://49enkt7tr0.ucarecd.net/145b975a-98bf-4a1e-955c-7479c551ed82/footer_illust_card02.png" alt="" class="lobby-decoration-top-right card02" />
  <img src="https://49enkt7tr0.ucarecd.net/b34646b4-bd77-4aa2-8554-fd9003d83a57/footer_illust_card03.png" alt="" class="lobby-decoration-top-right card03" />
  <img src="https://s6.imgcdn.dev/YbeLNL.png" alt="" class="lobby-decoration-left" />
</div>

<style>
  #lobby{position:fixed;inset:0;background:var(--bg);z-index:9999;display:flex;align-items:center;justify-content:center;background-image:url('https://s6.imgcdn.dev/Ybe7pd.png');background-size:cover;background-position:center;transition:opacity 3s ease}
  #lobby.is-fading{opacity:0;pointer-events:none}
  
  .top-nav{position:absolute;top:24px;right:24px;z-index:100}
  .hamburger{width:40px;height:40px;background:rgba(0,0,0,0.4);border:1px solid var(--border2);border-radius:8px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:5px;cursor:pointer;transition:all 0.2s}
  .hamburger:hover{background:rgba(0,0,0,0.6);border-color:var(--blue2)}
  .hamburger span{display:block;width:22px;height:2px;background:var(--text);border-radius:2px;transition:0.3s}

  .menu-overlay{position:absolute;inset:0;background:rgba(0,0,0,0.5);z-index:150}
  .menu-panel{position:absolute;top:80px;right:24px;width:280px;background:var(--surface);border:1px solid var(--border2);border-radius:16px;padding:24px;z-index:200;box-shadow:0 10px 30px rgba(0,0,0,0.5);animation:slideDown 0.3s ease-out}
  @keyframes slideDown{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}
  .menu-header{margin-bottom:24px;text-align:center}
  .menu-logo{height:36px;width:auto;margin:0 auto 12px;display:block;filter:brightness(0) invert(1)}
  .menu-section{margin-bottom:20px}
  .menu-user-name{font-size:18px;font-weight:700;color:var(--blue2)}
  .menu-deck-sub{font-size:12px;color:var(--text2);line-height:1.4}
  .menu-divider{height:1px;background:var(--border);margin:20px 0}
  .logout-btn{width:100%;padding:12px;border-radius:8px;background:rgba(218,54,51,0.1);border:1px solid rgba(218,54,51,0.3);color:var(--red);font-weight:700;cursor:pointer;transition:all 0.2s}
  .logout-btn:hover{background:var(--red);color:#fff}

  .lobby-decoration{position:absolute;bottom:20px;right:20px;height:234.375px;width:auto;z-index:2;pointer-events:none;filter:drop-shadow(0 4px 10px rgba(0,0,0,0.3))}
  .lobby-decoration-top-right{position:absolute;bottom:400px;height:300px;width:auto;z-index:2;pointer-events:none;filter:drop-shadow(0 4px 10px rgba(0,0,0,0.3));animation:lobbySway 12s ease-in-out infinite;transform-origin:bottom center}
  .lobby-decoration-top-right.card01{right:60px}
  .lobby-decoration-top-right.card02{right:500px;height:200px;animation-delay:-2s}
  .lobby-decoration-top-right.card03{right:800px;height:160px;bottom:280px;animation-delay:-4s}
  .lobby-decoration-left{position:absolute;bottom:0;left:0;height:843.75px;width:auto;z-index:2;pointer-events:none}
  @keyframes lobbySway{0%, 100%{transform:rotate(-10deg)}50%{transform:rotate(10deg)}}
  
  .lobby-scroll{position:absolute;bottom:0;left:0;width:100%;height:81.9%;overflow:hidden;pointer-events:none;z-index:0;mask-image:linear-gradient(to right, transparent, black 15%, black 85%, transparent), linear-gradient(to top, black 70%, transparent 100%);mask-composite:intersect;animation:lobbyFadeIn 90s linear infinite}
  .lobby-track{display:flex;height:100%;width:max-content;animation:lobbyScrollLoop 90s linear infinite}
  .lobby-track img{height:100%;width:auto;display:block}
  .lobby-track img.flipped{transform:scaleX(-1)}
  @keyframes lobbyFadeIn{0%{opacity:0}15%{opacity:1}70%{opacity:1}100%{opacity:0}}
  @keyframes lobbyScrollLoop{from{transform:translateX(-50%)}to{transform:translateX(0)}}

  .lobby-box{padding:0;width:700px;text-align:center;position:relative;z-index:5;display:flex;flex-direction:column;gap:16px;margin-top:-60px}
  .lobby-sub{font-size:12px;color:var(--text3)}
  .lbl{font-size:11px;color:var(--text3);text-align:left;margin-bottom:6px;font-weight:600;letter-spacing:.5px;text-transform:uppercase}
  
  .action-section{display:flex;flex-direction:column;align-items:center;gap:30px;width:100%;margin-top:-60px}
  .deck-cover-group{display:flex;flex-direction:column;align-items:center;gap:12px}
  .cover-label{font-size:24px;color:#d1bc00;font-weight:800;letter-spacing:1px;text-transform:uppercase}
  .cover-wrap{width:280px}
  .cover-slot{width:100%;aspect-ratio:63/88;border-radius:10px;display:flex;align-items:center;justify-content:center;position:relative;box-shadow:0 10px 30px rgba(0,0,0,0.5);overflow:hidden}
  .cover-slot.has-leader{background-color:#111;border:3px solid #d1bc00;cursor:pointer;transition:transform 0.2s}
  .cover-slot.has-leader:hover{transform:scale(1.02)}
  .cover-leader-img{width:100%;height:100%;object-fit:contain;display:block;border-radius:8px}
  .cover-leader-fallback{width:100%;height:100%;background-size:contain;background-repeat:no-repeat;background-position:center}
  .cover-change-badge{position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.65);color:#fff;font-size:12px;font-weight:700;padding:8px;text-align:center;backdrop-filter:blur(4px)}
  .cover-slot.is-empty{background:#52525b;border:none;border-radius:16px;overflow:hidden;cursor:pointer;transition:background .2s, transform .2s;transform:scale(0.8)}
  .cover-slot.is-empty:hover{background:#5b5b65;transform:scale(0.85)}
  .cover-slot.is-empty::before{content:'';position:absolute;inset:10%;border:2px dashed rgba(255,255,255,.35);border-radius:12px;pointer-events:none}
  .cover-plus{position:relative;width:32px;height:32px}
  .cover-plus::before,.cover-plus::after{content:'';position:absolute;background:rgba(255,255,255,.85);border-radius:2px}
  .cover-plus::before{width:100%;height:4px;top:50%;left:0;transform:translateY(-50%)}
  .cover-plus::after{width:4px;height:100%;left:50%;top:0;transform:translateX(-50%)}

  .action-bar{display:flex;width:100%;gap:16px;justify-content:center}
  .action-btn{background:none;border:none;padding:0;cursor:pointer;transition:transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);position:relative}
  .action-btn:hover{transform:scale(1.08)}
  .action-btn img{width:340px;height:auto;display:block;border-radius:16px;filter:drop-shadow(0 15px 35px rgba(0,0,0,0.65))}
  .action-btn:active{transform:scale(0.95)}
  .action-btn.disabled{cursor:not-allowed;pointer-events:none}
  .action-btn.disabled:hover{transform:none}
  .btn-disabled{filter:grayscale(60%) brightness(0.6)!important}
  .no-deck-badge{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.75);color:#fff;font-size:13px;font-weight:700;padding:6px 14px;border-radius:8px;pointer-events:none;white-space:nowrap;border:1px solid rgba(255,255,255,0.2)}
  
  .lobby-status{font-size:12px;color:var(--text3);min-height:20px;text-align:left}
  :global(.lobby-status.ok){color:var(--green2)}
  :global(.lobby-status.err){color:var(--red)}

  /* ── DECK PICKER MODAL ── */
  .picker-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(6px);z-index:500}
  .picker-panel{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(520px,90vw);max-height:80vh;background:var(--surface);border:1px solid var(--border2);border-radius:20px;padding:24px;z-index:600;display:flex;flex-direction:column;gap:16px;box-shadow:0 20px 60px rgba(0,0,0,0.6);overflow:hidden}
  .picker-header{display:flex;align-items:center;justify-content:space-between}
  .picker-title{font-size:18px;font-weight:800;color:var(--text)}
  .picker-count{font-size:13px;color:var(--text3);font-weight:500;margin-left:8px}
  .picker-close{background:none;border:none;color:var(--text3);font-size:20px;cursor:pointer;padding:4px 8px;border-radius:6px;transition:all 0.15s}
  .picker-close:hover{background:var(--surface2);color:var(--text)}

  .picker-empty{text-align:center;padding:40px 20px;display:flex;flex-direction:column;align-items:center;gap:12px}
  .picker-empty-icon{font-size:48px}
  .picker-empty-text{color:var(--text3);font-size:14px}

  .picker-list{display:flex;flex-direction:column;gap:10px;overflow-y:auto;max-height:50vh;padding-right:4px}
  .picker-list::-webkit-scrollbar{width:4px}
  .picker-list::-webkit-scrollbar-track{background:transparent}
  .picker-list::-webkit-scrollbar-thumb{background:var(--border2);border-radius:2px}

  .picker-item{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;border:1px solid var(--border);background:var(--surface2);transition:all 0.15s}
  .picker-item:hover{border-color:var(--border2);background:var(--surface3)}
  .picker-item.selected{border-color:var(--blue2);background:rgba(88,166,255,0.08)}
  .picker-item-art{width:44px;height:60px;border-radius:6px;background-size:cover;background-position:center;flex-shrink:0;border:1px solid var(--border2)}
  .picker-item-info{flex:1;min-width:0}
  .picker-item-name{font-size:14px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .picker-item-sub{font-size:11px;color:var(--text3);margin-top:3px}
  .picker-item-actions{display:flex;gap:6px;align-items:center;flex-shrink:0}

  .picker-play-btn{padding:6px 12px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;transition:all 0.15s;border:1px solid var(--blue2);color:var(--blue2);background:rgba(88,166,255,0.08);white-space:nowrap}
  .picker-play-btn:hover{background:var(--blue2);color:#fff}
  .picker-item.selected .picker-play-btn{background:var(--blue2);color:#fff}
  .picker-edit-btn,.picker-del-btn{background:none;border:1px solid var(--border2);border-radius:8px;padding:6px 8px;cursor:pointer;font-size:14px;transition:all 0.15s;color:var(--text3)}
  .picker-edit-btn:hover{background:var(--surface3);border-color:var(--border2)}
  .picker-del-btn:hover{background:rgba(218,54,51,0.1);border-color:var(--red)}

  .picker-new-btn{padding:10px 20px;border-radius:10px;background:rgba(88,166,255,0.1);border:1px dashed var(--blue2);color:var(--blue2);font-size:13px;font-weight:700;cursor:pointer;transition:all 0.2s;text-align:center}
  .picker-new-btn:hover{background:rgba(88,166,255,0.2)}
  .picker-new-btn.full{width:100%}
  .picker-full-note{text-align:center;font-size:12px;color:var(--text3);padding:8px;border:1px solid var(--border);border-radius:8px}

  /* MATCHMAKING */
  .mm-transition-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);z-index:1000;pointer-events:auto}
  .mm-slide-panel{position:absolute;top:50%;left:50%;width:160vw;height:min(28vw, 260px);transform:translate(-50%, -50%) rotate(-7deg);pointer-events:none}
  .mm-reveal-mask{position:absolute;inset:0;overflow:hidden}
  .mm-bg-strip{position:absolute;inset:0;width:100%;height:100%;background-repeat:repeat-x;background-size:auto 100%;background-position:left center;filter:drop-shadow(0 10px 40px rgba(0,0,0,0.8));animation:trainEnter 0.9s cubic-bezier(0.16, 1, 0.3, 1) forwards}
  .mm-slide-panel.is-leaving .mm-bg-strip{animation:trainLeave 0.6s cubic-bezier(0.7, 0, 0.84, 0) forwards}
  @keyframes trainEnter{from{transform:translateX(100%)}to{transform:translateX(0)}}
  @keyframes trainLeave{from{transform:translateX(0)}to{transform:translateX(-100%)}}
  .mm-text-layer{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,0.8);padding-bottom:1.5%;opacity:0;animation:fadeInText 0.4s ease-out 0.5s forwards}
  .mm-slide-panel.is-leaving .mm-text-layer{animation:fadeOutText 0.2s ease-out forwards}
  @keyframes fadeInText{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}
  @keyframes fadeOutText{from{opacity:1}to{opacity:0}}
  .mm-waiting-text{font-size:44px;font-weight:900;letter-spacing:2px;animation:pulse 1.5s infinite}
  .mm-found-text{text-align:center}
  .vs-label{font-size:22px;font-weight:700;color:var(--blue2);text-transform:uppercase}
  .opp-display-name{font-size:64px;font-weight:950;color:#fff;margin-top:10px;background:linear-gradient(to bottom, #fff, #8b949e);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
  @keyframes pulse{0%{opacity:1}50%{opacity:0.6}100%{opacity:1}}
</style>
