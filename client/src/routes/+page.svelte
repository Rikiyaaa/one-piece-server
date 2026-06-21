<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { Client, type Room } from 'colyseus.js';
  import { GameState } from 'shared';
  import type { CardData, CardState, Zone, AttackLine } from '$lib/types';
  import Lobby from '$lib/components/Lobby.svelte';
  import Topbar from '$lib/components/Topbar.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import Card from '$lib/components/Card.svelte';
  import ZoneComp from '$lib/components/Zone.svelte';
  import DiceWidget from '$lib/components/DiceWidget.svelte';
  import { sfxSystem } from '$lib/systems/SfxSystem';

  // ════════════════════════════════════════════════
  //   TYPES
  // ════════════════════════════════════════════════
  // Moved to $lib/types

  // ════════════════════════════════════════════════
  //   CARD DATABASE
  // ════════════════════════════════════════════════
  const CARD_JSON_URL = '/onepiece_full_onelog_translated.json';
  const DEFAULT_CARD_DB: CardData[] = [
    {id:'OP01-001',name:'Monkey D. Luffy',type:'Character',cost:5,power:6000,rarity:'SR',color:'Red',effect:'[On Play] Draw 2. [Blocker]',art:'#c0392b'},
    {id:'OP01-002',name:'Roronoa Zoro',type:'Character',cost:4,power:5000,rarity:'R',color:'Green',effect:'[Rush]',art:'#27ae60'},
    {id:'OP01-003',name:'Nami',type:'Character',cost:2,power:2000,rarity:'U',color:'Blue',effect:'[When Attacking] Look top 3.',art:'#2980b9'},
    {id:'OP01-004',name:'Usopp',type:'Character',cost:2,power:2000,rarity:'C',color:'Purple',effect:'[Blocker]',art:'#8e44ad'},
    {id:'OP01-005',name:'Sanji',type:'Character',cost:4,power:5000,rarity:'R',color:'Red',effect:'[Double Attack]',art:'#e74c3c'},
    {id:'OP01-006',name:'Tony Tony Chopper',type:'Character',cost:1,power:1000,rarity:'C',color:'Blue',effect:'[When Attacking] Leader +1000.',art:'#2471a3'},
    {id:'OP01-007',name:'Nico Robin',type:'Character',cost:3,power:4000,rarity:'U',color:'Black',effect:'[Blocker][On Play] See top.',art:'#2c3e50'},
    {id:'OP01-008',name:'Franky',type:'Character',cost:5,power:6000,rarity:'R',color:'Blue',effect:'[Rush][Double Attack]',art:'#1a5276'},
    {id:'OP01-009',name:'Brook',type:'Character',cost:3,power:4000,rarity:'U',color:'Black',effect:'[On Play] Rest 1 opp.',art:'#212121'},
    {id:'OP01-010',name:'Gear 5',type:'Event',cost:3,power:0,rarity:'SR',color:'Red',effect:'[Counter] +4000.',art:'#e67e22'},
    {id:'OP01-011',name:'Thousand Sunny',type:'Stage',cost:2,power:0,rarity:'R',color:'Green',effect:'[Activate] 2 DON!! → +2000.',art:'#f39c12'},
    {id:'OP01-012',name:'Shanks',type:'Leader',cost:0,power:5000,rarity:'L',color:'Red',effect:'[Activate] 1 DON!! → Attach.',art:'#922b21'},
    {id:'OP01-013',name:'Fire Fist Ace',type:'Character',cost:5,power:6000,rarity:'SR',color:'Red',effect:'[On Play] KO ≤3000.',art:'#cb4335'},
    {id:'OP01-014',name:'Whitebeard',type:'Character',cost:7,power:9000,rarity:'L',color:'Black',effect:'[Blocker]',art:'#1c2833'},
    {id:'OP01-015',name:'Going Merry',type:'Stage',cost:1,power:0,rarity:'C',color:'Yellow',effect:'[Your Turn] Leader +1000.',art:'#d4ac0d'},
    {id:'OP01-016',name:'Haki Burst',type:'Event',cost:2,power:0,rarity:'U',color:'Black',effect:'[Counter] +4000.',art:'#515a5a'},
    {id:'OP01-017',name:'Straw Hat Crew',type:'Event',cost:4,power:0,rarity:'R',color:'Green',effect:'[Main] Play 2 Chars free.',art:'#1d8348'},
    {id:'OP01-018',name:'Kizaru',type:'Character',cost:8,power:10000,rarity:'L',color:'Yellow',effect:'[On Play] Banish 3. [Blocker]',art:'#b7950b'},
    {id:'OP01-019',name:'Buggy',type:'Character',cost:3,power:3000,rarity:'U',color:'Red',effect:'[On Play] Dig 5.',art:'#c0392b'},
    {id:'OP01-020',name:'Dracule Mihawk',type:'Character',cost:6,power:7000,rarity:'SR',color:'Black',effect:'[Double Attack]',art:'#17202a'},
  ];

  let CARD_DB = $state<CardData[]>([...DEFAULT_CARD_DB]);
  let CARD_MAP = $state<Record<string,CardData>>(Object.fromEntries(DEFAULT_CARD_DB.map(c=>[c.id,c])));
  let dbLoaded = false;

  const COLOR_MAP: Record<string, string> = {red:'#c0392b',green:'#27ae60',blue:'#2980b9',purple:'#8e44ad',black:'#2c3e50',yellow:'#d4ac0d',multicolor:'#7f8c8d','แดง':'#c0392b','เขียว':'#27ae60','ฟ้า':'#2980b9','ม่วง':'#8e44ad','ดำ':'#2c3e50','เหลือง':'#d4ac0d'};
  const ESC_MAP: Record<string, string> = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};

  function rebuildMap() { 
    const map: Record<string, CardData> = {};
    for (let i = 0; i < CARD_DB.length; i++) {
      const c = CARD_DB[i];
      map[c.id] = c;
    }
    CARD_MAP = map;
  }
  function colorToArt(color:string) {
    const f = String(color||'').split('/')[0].trim().toLowerCase();
    return COLOR_MAP[f] || '#34495e';
  }
  function normalizeType(t:string) {
    const u = String(t||'').trim().toUpperCase();
    if(u==='CHARACTER') return 'Character'; if(u==='LEADER') return 'Leader';
    if(u==='EVENT') return 'Event'; if(u==='STAGE') return 'Stage'; return t||'Card';
  }
  async function loadCardDB() {
    if(dbLoaded) return;
    try {
      const r = await fetch(CARD_JSON_URL);
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      const rows = await r.json();
      if(!Array.isArray(rows)) throw new Error('not array');
      const cards = rows.map((raw:any,i:number):CardData => {
        const cardId = String(raw.card_id||raw.id||raw.db_id||`json-${i}`);
        const uid = raw.db_id!=null ? `db-${raw.db_id}` : cardId;
        return {
          id: uid, cardId,
          name: raw.name||cardId, type: normalizeType(raw.type),
          cost: parseInt(raw.cost)||0, power: parseInt(raw.power)||0,
          rarity: String(raw.rarity||'C').toUpperCase(),
          color: raw.color||'', effect: raw.effect||'',
          art: colorToArt(raw.color), imageUrl: raw.image_url||'',
          attribute: raw.attribute||'', counter: raw.counter!=null ? String(raw.counter) : '',
          feature: raw.feature||'', card_set: raw.card_set||'', life: raw.life!=null ? String(raw.life) : '',
        };
      }).filter((c:CardData)=>c.id&&c.name);
      if(!cards.length) throw new Error('empty');
      CARD_DB = cards; rebuildMap(); addLog(`โหลด JSON ${CARD_DB.length} ใบ`,'system');
    } catch(e:any) {
      CARD_DB = [...DEFAULT_CARD_DB]; rebuildMap();
      addLog(`ใช้เด็คตัวอย่าง (${e.message})`,'system');
    }
    dbLoaded = true;
  }

  function esc(v:any) { return String(v??'').replace(/[&<>"']/g,c=>ESC_MAP[c]); }
  function cssT(v:any) { return String(v||'').replace(/[^a-z0-9_-]/gi,''); }
  function cardBg(d:CardData, includeImg = true) {
    const imageUrl = d.imageUrl || (d as any).image_url;
    const base = `background-color:${d.art||'#34495e'};background-size:cover;background-position:center`;
    if(!imageUrl || !includeImg) return base;
    return `${base};background-image:url("${String(imageUrl).replace(/"/g,'%22')}")`;
  }

  // ════════════════════════════════════════════════
  //   STATE
  // ════════════════════════════════════════════════
  const PHASES = ['Refresh','Draw','DON!!','Main','Battle','End'];
  const BOARD_SIZE = 800;
  const CARD_W = 74, CARD_H = 103;

  const BOARD_ZONES: Zone[] = [
    {id:'opp-trash',side:'opp',label:'TRASH',x:52,y:49,w:87,h:114,snap:'center'},
    {id:'opp-deck',side:'opp',label:'DECK',x:52,y:167,w:87,h:114,snap:'center',count:true},
    {id:'opp-stage',side:'opp',label:'STAGE',x:162,y:167,w:85,h:114,snap:'center'},
    {id:'opp-leader',side:'opp',label:'LEADER',x:272,y:167,w:86,h:114,snap:'center'},
    {id:'opp-cost',side:'opp',label:'COST',x:203,y:49,w:403,h:111,snap:'grid',cols:5,rows:1},
    {id:'opp-character',side:'opp',label:'CHARACTER',x:52,y:287,w:539,h:110,snap:'grid',cols:5,rows:1},
    {id:'opp-life',side:'opp',label:'LIFE',x:629,y:183,w:120,h:214,snap:'center'},
    {id:'opp-don-deck',side:'opp',label:'DON!!',x:662,y:49,w:87,h:124,snap:'center'},
    {id:'you-life',side:'you',label:'LIFE',x:52,y:406,w:120,h:213,snap:'center'},
    {id:'you-character',side:'you',label:'CHARACTER',x:202,y:406,w:547,h:111,snap:'grid',cols:5,rows:1},
    {id:'you-leader',side:'you',label:'LEADER',x:443,y:522,w:86,h:115,snap:'center'},
    {id:'you-stage',side:'you',label:'STAGE',x:553,y:522,w:86,h:115,snap:'center'},
    {id:'you-deck',side:'you',label:'DECK',x:663,y:522,w:86,h:115,snap:'center',count:true},
    {id:'you-trash',side:'you',label:'TRASH',x:663,y:642,w:86,h:113,snap:'center'},
    {id:'you-cost',side:'you',label:'COST',x:195,y:641,w:405,h:116,snap:'grid',cols:5,rows:1},
    {id:'you-don-deck',side:'you',label:'DON!!',x:52,y:629,w:91,h:124,snap:'center'},
  ];

  // reactive state
  let cards = $state<Record<string, CardState>>({});
  interface RemoteDragGhost {
    cid: string;
    cardId: string;
    imageUrl?: string;
    art?: string;
    x: number;
    y: number;
    faceDown: boolean;
  }
  let remoteDragGhosts = $state<Record<string, RemoteDragGhost>>({});
  let myName = $state('Player 1');
  let oppName = $state('คู่ต่อสู้');
  let isHost = $state(false);
  let connected = $state(false);
  let gameStarted = $state(false);
  let lobbyFading = $state(false); // true = Lobby กำลัง fade out ก่อน unmount
  let matchInitialized = $state(false); // true เมื่อจั่วมือเริ่มต้นไปแล้ว (แยกเกมแรก vs รีเซ็ตเกม)
  let isRestoringFromReconnect = false; // ป้องกัน game_restore rebuild ซ้ำกับ onMount rebuild
  let phase = $state(0);
  let turn = $state(1);
  let myLife = $state(5);
  let oppLife = $state(5);
  let myMaxLife = $state(5); // จำนวน life สูงสุดตาม Leader (ใช้กับ doToLife)
  let myDon = $state(10);
  let myDonSpent = $state(0);
  let oppDon = $state(10);
  let oppDonSpent = $state(0);
  let myHandCount = $state(0);
  let oppHandCount = $state(0);
  let myDeckCount = $state(50);
  let oppDeckCount = $state(50);
  let mulliganAvailable = $state(false); // true = ยังกด Mulligan ได้ (เฉพาะตอนเริ่มเกม ทำได้รอบเดียว)
  let snapOn = $state(true);
  let logEntries = $state<{msg:string;side:string;time:string}[]>([]);
  let activeTab = $state<'log'|'deck'|'help'>('log');
  let ctxVisible = $state(false);
  let ctxX = $state(0); let ctxY = $state(0); let ctxCid = $state('');
  let ctxCounterVisible = $state(false); let ctxCounterY = $state(0);
  let deckCtxVisible = $state(false);
  let deckCtxX = $state(0); let deckCtxY = $state(0);
  let searchCtxN = $state(3); // จำนวน Search ที่ปรับได้เองในเมนูคลิกขวา
  let scryCtxN = $state(3);   // จำนวน Scry ที่ปรับได้เองในเมนูคลิกขวา
  // ── ป๊อปอัพลากปรับจำนวน Search/Scry (ลากซ้าย-ขวาด้วยเมาส์/นิ้ว) ──
  let ctxScrubVisible = $state(false);
  let ctxScrubType = $state<'search'|'scry'>('search');
  let ctxScrubMax = $state(99);  // เพดานสูงสุด = จำนวนการ์ดในกองตอนเปิดป๊อปอัพ (เริ่มที่ 1 เสมอ ปรับได้แค่เลขปลายช่วง)
  let ctxScrubDragging = $state(false);
  let ctxScrubStartX = 0;   // ตำแหน่ง pointer ตอนเริ่มลาก (ไม่ต้อง reactive)
  let ctxScrubStartVal = 0; // ค่าตัวเลขตอนเริ่มลาก
  let tooltipVisible = $state(false);
  let tooltipData = $state<CardData|null>(null);
  let tooltipX = $state(0); let tooltipY = $state(0);
  let detailData = $state<CardData|null>(null);
  let peekLifeVisible = $state(false);

  // ── Search N (ค้นกองหลัก): ดึงการ์ดบนสุด N ใบมาดูแบบส่วนตัว ก่อนเลือกเข้ามือ/ทิ้งที่เหลือ ──
  let searchVisible = $state(false);
  let searchCount = $state(0);
  let searchCards = $state<{uid:string; cardId:string; data:CardData}[]>([]);
  let searchSeq = 0;

  // ── Search Deck (ค้นกองทั้งหมด): แสดงการ์ดทุกใบในกอง เลือกได้ X ใบ ──
  let deckSearchVisible = $state(false);
  let deckSearchCards = $state<{uid:string; cardId:string; idx:number; data:CardData}[]>([]);
  let deckSearchSelected = $state<Set<string>>(new Set());
  let deckSearchQuery = $state('');
  let deckSearchPickCount = $state(1); // จำนวนที่ต้องการเลือก

  // ── Search Trash (ค้นกองทิ้ง/สุสาน): แสดงการ์ดทุกใบในสุสาน เลือกเข้ามือได้ ──
  let trashSearchVisible = $state(false);
  let trashSearchQuery = $state('');

  // ── Scry X (มองบนกอง + จัดลำดับ): ดูการ์ด X ใบบนสุด ลากสลับตำแหน่งได้ แล้วใส่กลับ ──
  let scryVisible = $state(false);
  let scryCards = $state<{uid:string; cardId:string; data:CardData}[]>([]); // [0]=บนสุด
  let scryCount = $state(3);
  let scryDragIdx = $state<number|null>(null);   // card index กำลังถูกลาก
  let scryDropIdx = $state<number|null>(null);   // drop target index

  // ── Attack Line (ลากเส้นโจมตีชั่วคราว) ──
  let attackLines = $state<AttackLine[]>([]);
  let drawingLine = $state<{x1:number;y1:number;x2:number;y2:number}|null>(null);
  const ATTACK_LINE_TTL = 5000; // ms ก่อนเส้นจะหายไปเอง

  // ── Multi-Select (เลือกการ์ดหลายใบ) ──
  let selectedCids = $state<Set<string>>(new Set());
  // ── Selection box (คลิกขวาลากเลือกการ์ด) ──
  let selBox = $state<{x1:number; y1:number; x2:number; y2:number} | null>(null);
  let selBoxActive = false;
  let selBoxStartX = 0;
  let selBoxStartY = 0;

  // ── Undo History (ย้อนกลับเฉพาะการ์ดของเราเอง) ──
  type UndoEntry =
    | { type:'move'; cid:string; prev:{x?:number;y?:number;zoneId?:string;inHand?:boolean} }
    | { type:'tap'; cid:string; prev:boolean }
    | { type:'flip'; cid:string; prev:boolean }
    | { type:'rotate'; cid:string; prev:number }
    | { type:'counter'; cid:string; prev:number }
    | { type:'trash'; cid:string; prev:{x?:number;y?:number;zoneId?:string}; cardDataId:string };
  let undoStack: UndoEntry[] = [];
  const UNDO_LIMIT = 50;

  // auth gate — ซ่อน lobby จนกว่าจะ check token เสร็จ (ป้องกัน flash ก่อน redirect)
  let authChecked = $state(false);

  // lobby
  let lobbyView = $state<'form'|'waiting'>('form');
  let lobbyStatus = $state('');
  let lobbyStatusCls = $state('');
  let lobbyRoomInput = $state('');
  let roomIdDisplay = $state('');

  // deck builder
  let dbOpen = $state(false);
  let dbSearch = $state('');
  let dbSearchTerm = $state(''); // Debounced search
  let dbFilterType = $state('');
  let dbFilterColor = $state('');
  let dbLeader = $state<CardData|null>(null);
  let dbCards = $state<Record<string,number>>({});
  let dbDonCount = $state(10); // DON!! ที่ผู้เล่นใส่เอง แยกจาก 50 ใบ
  let lobbyDeckSummary = $state('ยังไม่ได้เลือก deck');

  // ── Multi-deck system ──
  interface SavedDeck { _id: string; name: string; leader: string; cards: string[]; donCount: number; updatedAt: string; }
  let savedDecks = $state<SavedDeck[]>([]);
  let activeDeckId = $state<string|null>(null); // deck ที่กำลัง load อยู่ใน builder
  let selectedDeckId = $state<string|null>(null); // deck ที่เลือกจะเล่น
  let deckPickerOpen = $state(false);
  let deckSaving = $state(false);
  let deckSaveMsg = $state('');
  let deckSaveMsgType = $state<'ok'|'err'>('ok');

  function showDeckMsg(msg: string, type: 'ok'|'err' = 'ok') {
    deckSaveMsg = msg; deckSaveMsgType = type;
    setTimeout(() => { deckSaveMsg = ''; }, 3000);
  }

  function getApiBase() {
    if (import.meta.env.VITE_SERVER_URL) {
      return import.meta.env.VITE_SERVER_URL.replace(/^ws/, 'http');
    }
    if (typeof window === 'undefined') return 'http://localhost:2567';
    const proto = window.location.protocol === 'https:' ? 'https' : 'http';
    return `${proto}://${window.location.hostname}:2567`;
  }

  async function apiDecks(method: string, path: string, body?: any) {
    const token = localStorage.getItem('token');
    const res = await fetch(`${getApiBase()}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      window.location.href = '/login';
    }
    return res;
  }

  async function loadSavedDecks() {
    try {
      const res = await apiDecks('GET', '/api/decks');
      if (res.ok) savedDecks = await res.json();
    } catch {}
  }

  async function saveDeckToServer(deckName: string) {
    if (dbTotal() !== 50) { showDeckMsg(`กองหลักต้องครบ 50 ใบ (ปัจจุบัน ${dbTotal()})`, 'err'); return; }
    if (!dbLeader) { showDeckMsg('ยังไม่ได้เลือก Leader', 'err'); return; }
    const payload = {
      name: deckName,
      leader: dbLeader.id,
      cards: Object.entries(dbCards).flatMap(([id, cnt]) => Array(cnt).fill(id)),
      donCount: dbDonCount
    };
    deckSaving = true;
    try {
      let res: Response;
      if (activeDeckId) {
        res = await apiDecks('PUT', `/api/decks/${activeDeckId}`, payload);
      } else {
        res = await apiDecks('POST', '/api/decks', payload);
      }
      if (res.ok) {
        const deck = await res.json();
        activeDeckId = deck._id;
        await loadSavedDecks();
        showDeckMsg('บันทึกเด็คสำเร็จ ✓', 'ok');
        // apply as active playing deck
        applyDeckToLobby();
        dbOpen = false;
      } else {
        const err = await res.json();
        showDeckMsg(err.message || 'บันทึกไม่สำเร็จ', 'err');
      }
    } catch { showDeckMsg('เชื่อมต่อ server ไม่ได้', 'err'); }
    finally { deckSaving = false; }
  }

  async function deleteSavedDeck(id: string) {
    if (!confirm('ลบเด็คนี้?')) return;
    try {
      const res = await apiDecks('DELETE', `/api/decks/${id}`);
      if (res.ok) {
        await loadSavedDecks();
        if (selectedDeckId === id) { selectedDeckId = null; dbLeader = null; dbCards = {}; lobbyDeckSummary = 'ยังไม่ได้เลือก deck'; }
        if (activeDeckId === id) activeDeckId = null;
      }
    } catch {}
  }

  function loadDeckIntoBuilder(deck: SavedDeck) {
    const leader = CARD_DB.find((c: CardData) => c.id === deck.leader) || null;
    dbLeader = leader;
    const counts: Record<string, number> = {};
    deck.cards.forEach((id: string) => { counts[id] = (counts[id] || 0) + 1; });
    dbCards = counts;
    dbDonCount = deck.donCount ?? 10;
    activeDeckId = deck._id;
    dbOpen = true;
    deckPickerOpen = false;
  }

  function selectDeckToPlay(deck: SavedDeck) {
    const leader = CARD_DB.find((c: CardData) => c.id === deck.leader) || null;
    dbLeader = leader;
    const counts: Record<string, number> = {};
    deck.cards.forEach((id: string) => { counts[id] = (counts[id] || 0) + 1; });
    dbCards = counts;
    dbDonCount = deck.donCount ?? 10;
    activeDeckId = deck._id;
    selectedDeckId = deck._id;
    applyDeckToLobby();
    deckPickerOpen = false;
  }

  // Leader card ใน One Piece TCG เก็บจำนวน life ไว้ใน field 'cost' (life field = '-')
  function getLeaderLife(leader: any): number {
    if (!leader) return 5;
    // ลองอ่าน life field ก่อน ถ้าเป็นตัวเลข >= 1 ใช้ได้เลย
    const lifeField = parseInt(String(leader.life ?? ''));
    if (lifeField >= 1 && lifeField <= 8) return lifeField;
    // fallback: อ่านจาก cost (One Piece TCG ใช้ช่อง cost เป็น life สำหรับ Leader)
    const costField = parseInt(String(leader.cost ?? ''));
    if (costField >= 1 && costField <= 8) return costField;
    return 5;
  }
  function applyDeckToLobby() {
    if (!dbLeader) return;
    const tc: Record<string, number> = {};
    Object.entries(dbCards).forEach(([id, cnt]) => { const d = CARD_MAP[id]; if (d) tc[d.type] = (tc[d.type] || 0) + cnt; });
    const parts = Object.entries(tc).map(([t, n]) => `${t}×${n}`).join(' · ');
    const lifeCount = getLeaderLife(dbLeader);
    lobbyDeckSummary = `Leader:${dbLeader?.name||'ไม่มี'} · Life:${lifeCount} · DON!!:${dbDonCount} · ${parts}`;
  }

  // life zone cards (array ของ cardId ที่วางใน life zone ตอนเริ่มเกม)
  let myLifeCards = $state<string[]>([]);

  // Pagination
  let dbPage = $state(1);
  const dbPageSize = 20;

  // Debounce search effect
  $effect(() => {
    const t = setTimeout(() => {
      dbSearchTerm = dbSearch.toLowerCase();
      dbPage = 1; // Reset page when search changes
    }, 400);
    return () => clearTimeout(t);
  });

  // Reset page when filters change
  $effect(() => {
    dbFilterType;
    dbFilterColor;
    dbPage = 1;
  });

  // Lazy loading action
  function lazyLoad(node: HTMLElement, url: string) {
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        node.style.backgroundImage = `url("${url.replace(/"/g,'%22')}")`;
        observer.disconnect();
      }
    });
    observer.observe(node);
    return {
      destroy() {
        observer.disconnect();
      }
    };
  }

  // non-reactive runtime
  let nextCid = 1;
  let myDeck = $state<string[]>([]);
  let myHand = $state<string[]>([]);
  let myTrash = $state<string[]>([]);
  let myDeckShuffling = $state(false);
  let oppDeckShuffling = $state(false);
  let myShuffleTimer: any;
  let oppShuffleTimer: any;
  let room: Room|null = null;

  // ── beforeunload / leave lifecycle ──
  // ป้องกัน onDestroy ส่ง going_away ซ้ำเมื่อผู้เล่นกด "ออกจากห้อง" จริงๆ
  let _isIntentionalLeave = false;
  let _pageUnloadHandler: (() => void) | null = null;

  function _registerPageBeforeUnload() {
    if (_pageUnloadHandler) return; // ลงทะเบียนครั้งเดียว
    _pageUnloadHandler = () => { if (room) room.send('going_away', {}); };
    window.addEventListener('beforeunload', _pageUnloadHandler);
  }

  function _unregisterPageBeforeUnload() {
    if (_pageUnloadHandler) {
      window.removeEventListener('beforeunload', _pageUnloadHandler);
      _pageUnloadHandler = null;
    }
  }

  // DOM refs
  let playfieldEl = $state<HTMLElement>();

  // ════════════════════════════════════════════════
  //   AUTO ZONE SYNC
  // ════════════════════════════════════════════════
  // ปัญหาเดิม: getZoneStyle()/getBoardRect() อ่าน playfieldEl.clientWidth/clientHeight
  // ตรงๆ ซึ่งเป็น DOM property ธรรมดา ไม่ใช่ $state — Svelte 5 จึงไม่รู้ว่าต้อง re-render
  // zone overlay ใหม่เวลาขนาด #playfield เปลี่ยน (เช่น ตอนเข้าเกมครั้งแรก layout ยังไม่นิ่ง,
  // sidebar/topbar mount ทีหลังทำให้ playfield ขยับ, font/image โหลดช้าทำให้ reflow ฯลฯ)
  // ผลคือ zone ถูกวาดค้างด้วยขนาดตอนเฟรมแรกที่อาจยังไม่ถูกต้อง แล้วไม่เคยขยับตามอีกเลย
  // จนกว่าจะมีการ์ดถูกขยับ (ซึ่งบังคับ re-render เฉพาะการ์ด ไม่ใช่ zone)
  //
  // ทางแก้: เก็บ board rect ไว้ใน $state (boardRectState) แล้วให้ getBoardRect()/getZoneStyle()
  // อ่านจากตรงนี้แทน — ทำให้ zone reactive จริง และ sync ค่านี้ทั้งจาก event (ResizeObserver,
  // ตอนเข้าเกม/รีเซ็ต/reconnect) และจาก interval poll สั้นๆ เป็น safety net เผื่อพลาด event ใดไป
  let boardRectState = $state({ scale: 1, left: 0, top: 0, width: BOARD_SIZE, height: BOARD_SIZE });
  let boardRectPollId: ReturnType<typeof setInterval> | null = null;

  function measureBoardRect() {
    if (!playfieldEl) return { scale: 1, left: 0, top: 0, width: BOARD_SIZE, height: BOARD_SIZE };
    const scale = Math.min((playfieldEl.clientWidth || BOARD_SIZE) / BOARD_SIZE, (playfieldEl.clientHeight || BOARD_SIZE) / BOARD_SIZE);
    const width = BOARD_SIZE * scale, height = BOARD_SIZE * scale;
    return { scale, width, height, left: ((playfieldEl.clientWidth || BOARD_SIZE) - width) / 2, top: ((playfieldEl.clientHeight || BOARD_SIZE) - height) / 2 };
  }

  // วัดขนาด #playfield ปัจจุบัน → ถ้าเปลี่ยนจริง: rebake พิกัดการ์ดทั้งหมด (pixel เก่า → ใหม่)
  // แล้ว sync boardRectState ใหม่ (reactive write → zone overlay re-render ทันที)
  function syncBoardLayout() {
    const newRect = measureBoardRect();
    if (!lastBoardRect) { lastBoardRect = newRect; boardRectState = newRect; return; }
    const old = lastBoardRect;
    const changed = Math.abs(old.scale - newRect.scale) > 0.0001
      || Math.abs(old.left - newRect.left) > 0.0001
      || Math.abs(old.top - newRect.top) > 0.0001;
    if (!changed) { lastBoardRect = newRect; return; }

    for (const card of Object.values(cards)) {
      if (card.x == null || card.y == null) continue;
      const cxPx = card.x + CARD_W / 2, cyPx = card.y + CARD_H / 2;
      const boardX = (cxPx - old.left) / old.scale;
      const boardY = (cyPx - old.top) / old.scale;
      card.x = Math.round(newRect.left + boardX * newRect.scale - CARD_W / 2);
      card.y = Math.round(newRect.top + boardY * newRect.scale - CARD_H / 2);
    }
    lastBoardRect = newRect;
    boardRectState = newRect;
  }

  // เริ่ม/เลิกสังเกตการ resize ของ #playfield ตาม lifecycle ของ element นี้
  // (playfieldEl จะมีค่าก็ตอน gameStarted=true เท่านั้น เพราะอยู่หลัง {#if gameStarted})
  $effect(() => {
    if (!playfieldEl) return;
    lastBoardRect = null; // บังคับให้ syncBoardLayout() ครั้งแรกเซ็ต baseline + boardRectState ใหม่เสมอ
    syncBoardLayout(); // sync ทันทีตอน playfield เพิ่งมีค่า (event-based)
    resizeObserver = new ResizeObserver(onPlayfieldResize);
    resizeObserver.observe(playfieldEl);
    return () => {
      resizeObserver?.disconnect();
      resizeObserver = null;
      lastBoardRect = null;
      if (resizeRafId != null) { cancelAnimationFrame(resizeRafId); resizeRafId = null; }
    };
  });

  // Poll สั้นๆ ทุก 400ms ระหว่างอยู่ในเกม — safety net เผื่อ resize event พลาดจับ
  // การเปลี่ยนแปลง layout บางกรณี (เช่น layout ยังไม่นิ่งตอนเพิ่งเข้าเกม/reconnect)
  $effect(() => {
    if (!gameStarted) return;
    boardRectPollId = setInterval(() => { syncBoardLayout(); }, 400);
    return () => {
      if (boardRectPollId != null) { clearInterval(boardRectPollId); boardRectPollId = null; }
    };
  });

  // ════════════════════════════════════════════════
  //   COLYSEUS CLIENT
  // ════════════════════════════════════════════════
  const SERVER_URL = import.meta.env.VITE_SERVER_URL
    ? import.meta.env.VITE_SERVER_URL
    : (typeof window !== 'undefined'
        ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:2567`
        : 'ws://localhost:2567');

  // ── Reconnection: เก็บ reconnectionToken ไว้ใน localStorage ──
  // ใช้ localStorage (ไม่ใช่ sessionStorage) เพราะ sessionStorage จะถูก clear
  // เมื่อ tab ถูก reload แบบ full navigation ทำให้ token หายและ reconnect ไม่ได้
  // ป้องกันการทับกันระหว่างหลายแท็บด้วย tabId ที่ random ต่อแท็บ (เก็บใน sessionStorage แค่ตัว ID)
  const TAB_ID_KEY = 'cardgame_tab_id';
  const RECONNECT_KEY = 'cardgame_reconnect';
  function getTabId(): string {
    let id = sessionStorage.getItem(TAB_ID_KEY);
    if (!id) { id = Math.random().toString(36).slice(2); sessionStorage.setItem(TAB_ID_KEY, id); }
    return id;
  }
  function saveReconnectInfo(r: Room) {
    try {
      const key = `${RECONNECT_KEY}_${getTabId()}`;
      localStorage.setItem(key, JSON.stringify({
        token: r.reconnectionToken,
        roomId: r.roomId,
        savedAt: Date.now(),
      }));
    } catch {}
  }
  function loadReconnectInfo(): { token: string; roomId: string } | null {
    try {
      const key = `${RECONNECT_KEY}_${getTabId()}`;
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // token หมดอายุถ้าเก่าเกิน 5 นาที
      if (Date.now() - (parsed.savedAt ?? 0) > 10 * 60 * 1000) {
        localStorage.removeItem(key);
        return null;
      }
      return parsed;
    } catch { return null; }
  }
  function clearReconnectInfo() {
    try {
      const key = `${RECONNECT_KEY}_${getTabId()}`;
      localStorage.removeItem(key);
    } catch {}
  }

  onMount(async () => {
    // ตรวจสอบสถานะการ Login
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    if (!token) {
        window.location.href = '/login';
        return;
    }
    // ตรวจสอบว่า token ยังใช้งานได้ (ไม่หมดอายุ)
    const check = await fetch(`${getApiBase()}/api/decks`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (check.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      window.location.href = '/login';
      return;
    }
    myName = username || 'Player';
    authChecked = true;  // ผ่าน auth แล้ว — แสดง lobby ได้

    await loadCardDB();
    // decks โหลดแล้วจาก check ข้างบน ไม่ต้อง fetch ซ้ำ
    if (check.ok) savedDecks = await check.json();

    // ── ไม่มี reconnect แล้ว — server ยุบห้องทันทีเมื่อใครออก/หลุด ──
    // เคลียร์ token เก่าทิ้งเผื่อค้างอยู่
    clearReconnectInfo();
  });

  async function joinMatchmaking() {
    // ตรวจว่าจัดเด็คครบหรือยัง (ต้องมี Leader และกด Save แล้ว)
    if (!dbLeader) {
      alert('กรุณาจัดเด็คและกด "บันทึกเด็ค" ก่อนเข้าจับคู่');
      openDB();
      return;
    }
    if (dbTotal() !== 50) {
      alert(`กองหลักต้องครบ 50 ใบ (ปัจจุบัน ${dbTotal()} ใบ)\nกรุณาจัดเด็คและกด "บันทึกเด็ค" ก่อน`);
      openDB();
      return;
    }
    setStatus('เข้าสู่คิว Matchmaking...', '');
    lobbyView = 'waiting';
    addLog('เข้าสู่คิว Matchmaking...', 'system');
    // Calling joinOrCreateRoom immediately to start the real connection process
    joinOrCreateRoom(); 
  }

  async function joinOrCreateRoom() {
    setStatus('กำลังค้นหา/สร้างห้อง...','');
    try {
      const client = new Client(SERVER_URL);
      room = await client.joinOrCreate<GameState>('card_game', { name: myName }, GameState);
      roomIdDisplay = room.roomId;
      mySessionId = room.sessionId;
      setupRoom();
      setStatus('เชื่อมต่อสำเร็จ! รอคู่ต่อสู้...','ok');
    } catch(e:any) { setStatus('ไม่สามารถเข้าห้องได้: '+e.message,'err'); lobbyView = 'form'; }
  }

  let countdown = $state(0);
  let countdownInterval: any;

  let mySessionId = $state('');
  let boardScale = $state(1);

  // ── Dice panel state ──
  let diceWidget = $state<{ roll: (vals?: number[]) => void } | null>(null);
  let diceLog    = $state<{ total: number; values: number[]; ts: number }[]>([]);
  let diceRolling  = $state(false);
  let isLocalRoll  = false;

  function handleDiceRollDone(total: number, values: number[]) {
    diceRolling = false;
    diceLog = [{ total, values, ts: Date.now() }, ...diceLog].slice(0, 6);
    if (isLocalRoll) {
      send('dice_result', { total, values });
      addLog(`🎲 ${myName} ทอยลูกเต๋า`, 'system');
    }
    isLocalRoll = false;
  }

  function triggerRoll() {
    if (!diceWidget || diceRolling) return;
    diceRolling = true;
    isLocalRoll = true;
    diceWidget.roll();
  }

  function handleWheel(e: WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      boardScale = Math.min(Math.max(0.5, boardScale + delta), 2);
    }
  }

  function setupRoom() {
    if(!room) return;
    mySessionId = room.sessionId;

    room.onMessage('assign_role', (d:any) => {
      isHost = d.isHost;
      mySessionId = d.sessionId;
      // แจ้ง server ว่า client นี้ได้รับ role แล้วและพร้อมเริ่มเกม
      room?.send('client_ready', {});
    });
    
    // Listen to state changes
    function handleStateChange(state: any) {
      if (!state) return;
      console.log('--- Room State Update ---');
      console.log('State JSON:', JSON.stringify(state));
      console.log('player1SessionId:', state.player1SessionId);
      console.log('player2SessionId:', state.player2SessionId);
      console.log('mySessionId:', room?.sessionId);

      // Determine role dynamically from state
      if (room && state.player1SessionId) {
        isHost = (room.sessionId === state.player1SessionId);
        console.log('isHost updated:', isHost);
      }
      
      // Update names and status dynamically from state
      if (state.player1SessionId && state.player2SessionId) {
        if (isHost) {
          oppName = state.player2.name || 'Player 2';
          myName = state.player1.name || 'Player 1';
        } else {
          oppName = state.player1.name || 'Player 1';
          myName = state.player2.name || 'Player 2';
        }
        setStatus('พบคู่ต่อสู้แล้ว!', 'ok');
        // หมายเหตุ: ไม่ set gameStarted ที่นี่ — รอ event 'game_start' จาก server
        // เพื่อให้ Lobby แสดง animation "พบคู่ต่อสู้" ก่อนเข้าเกมจริง
      } else {
        // ยังไม่มีคู่ต่อสู้ — ทั้ง host และ non-host ต้อง set oppName เป็น placeholder เท่านั้น
        if (isHost) {
          myName = state.player1.name || 'Player 1';
        } else {
          myName = state.player2?.name || myName;
        }
        oppName = 'รอคู่ต่อสู้...';
        setStatus('รอคู่ต่อสู้...', '');
      }
    }

    room.onStateChange(handleStateChange);
    if (room.state) {
      handleStateChange(room.state);
    }

    room.onMessage('game_ready', (d:any) => {
      const p1 = d.player1.name;
      const p2 = d.player2.name;
      if(isHost) { oppName = p2; }
      else { oppName = p1; }
      
      setStatus('พบคู่ต่อสู้แล้ว!','ok');
      // หมายเหตุ: ไม่ set gameStarted ที่นี่ — รอ event 'game_start' จาก server
    });

    room.onMessage('hello', (d:any) => {
      oppName = d.name;
      addLog(`${d.name} เชื่อมต่อแล้ว`,'system');
    });
    room.onMessage('hello_ack', (d:any) => { oppName = d.name; });

    room.onMessage('card_spawn', handleRemoteCardSpawn);
    room.onMessage('card_move',  handleRemoteCardMove);
    room.onMessage('card_remove',handleRemoteCardRemove);
    room.onMessage('card_tap',   handleRemoteCardTap);
    room.onMessage('card_flip',  handleRemoteCardFlip);
    room.onMessage('card_rotate',handleRemoteCardRotate);

    room.onMessage('don_card_spawn', handleRemoteDonSpawn);
    room.onMessage('don_card_move',  handleRemoteDonMove);
    room.onMessage('don_card_tap',   handleRemoteDonTap);
    room.onMessage('don_card_rotate',handleRemoteDonRotate);
    room.onMessage('don_card_remove',handleRemoteDonRemove);

    room.onMessage('don_change', (d:any) => { oppDon=d.total; oppDonSpent=d.spent; });

    room.onMessage('life_change', (d:any) => { oppLife=d.val; addLog(`${oppName}: ชีวิต ${d.val}`,'opp'); });
    room.onMessage('phase', (d:any) => { phase=d.phase; turn=d.turn; addLog(`${oppName}: Phase→${PHASES[d.phase]}`,'opp'); });
    room.onMessage('hand_count', (d:any) => { oppHandCount=d.count; });
    room.onMessage('draw', () => { oppHandCount++; });
    room.onMessage('deck_count', (d:any) => { oppDeckCount=d.count; });
    room.onMessage('shuffle', () => { addLog(`${oppName}: สับสำรับ`,'opp'); playShuffleAnim('opp'); });
    room.onMessage('log', (d:any) => addLog(`${oppName}: ${d.msg}`,'opp'));
    room.onMessage('dice_result', (d: any) => {
      diceLog = [{ total: d.total, values: d.values, ts: Date.now() }, ...diceLog].slice(0, 6);
      addLog(`🎲 ${oppName} ทอยลูกเต๋า`, 'opp');
      // เล่น animation 3D เต๋าฝั่งผู้รับ พร้อม preset values (overlay จะเปิดขึ้นมากลางจอ)
      if (diceWidget) {
        diceRolling = true;
        diceWidget.roll(d.values);
      }
    });
    room.onMessage('new_game', () => { addLog(`${oppName}: เริ่มเกมใหม่`,'opp'); });
    // ✅ Both players receive this and trigger their own startGame/resetBoard
    room.onMessage('game_start', () => {
      if (!matchInitialized) {
        matchInitialized = true;
        addLog('เริ่มเกม! จั่ว 5 ใบ...','system');
        // หน่วงเวลาเล็กน้อยให้ Lobby แสดงชื่อคู่ต่อสู้ก่อนเข้าเกมจริง (อย่างน้อย 2 วิ)
        setTimeout(() => { startGame(); }, 2000);
      } else {
        addLog('รีเซ็ตบอร์ด... จั่ว 5 ใบใหม่','system');
        resetBoard();
      }
    });
    // ✅ server ส่ง game_restore เฉพาะตอน reconnect (ไม่ใช่เกมใหม่)
    // → กู้บอร์ดจาก state โดยไม่ reset และไม่จั่วใหม่
    room.onMessage('game_restore', async () => {
      addLog('เชื่อมต่อกลับสำเร็จ! กู้คืนบอร์ด...', 'system');
      if (isRestoringFromReconnect) {
        // onMount กำลัง rebuild อยู่แล้ว → ข้ามได้เลย
        return;
      }
      if (!gameStarted) {
        // reconnect แต่ gameStarted ยังเป็น false (edge case: page โหลดแต่ token หมด)
        gameStarted = true;
        await tick(); // รอให้ {#if gameStarted} render playfieldEl ก่อน (กรณีเพิ่งตั้ง true ด้านบน)
      }
      // reconnect ระหว่างเกม (เน็ตหลุดชั่วคราว ไม่ได้ refresh หน้า) → sync state จาก server
      if (room?.state) rebuildBoardFromState(room.state);
      syncBoardLayout(); // sync zone/board rect ให้ตรงกับ #playfield จริงหลังกู้คืนบอร์ด
      setTimeout(() => syncAllState(), 300);
    });
    room.onMessage('cursor', handleRemoteCursor);
    room.onMessage('card_drag_start', handleRemoteCardDragStart);
    room.onMessage('card_drag_move', handleRemoteCardDragMove);
    room.onMessage('card_drag_end', handleRemoteCardDragEnd);
    room.onMessage('attack_line', handleRemoteAttackLine);
    room.onMessage('card_counter', (d:any) => {
      const c = cards[d.cid];
      if (c) c.counter = d.val;
    });
    room.onMessage('player_left', () => {
      // อีกฝั่งออกหรือหลุด → server ยุบห้องแล้ว กลับ lobby ทันที
      addLog(`${oppName} ออกจากห้อง — ห้องถูกยุบ กลับ Lobby`, 'system');
      _isIntentionalLeave = true; // ไม่ต้องส่ง going_away ซ้ำ
      _unregisterPageBeforeUnload();
      room = null;
      gameStarted = false;
      lobbyView = 'form';
      connected = false;
      matchInitialized = false;
      lobbyFading = false;
      cards = {}; myHand = []; myDeck = []; myTrash = []; myLifeCards = [];
      undoStack = []; attackLines = [];
      clearReconnectInfo();
    });

    connected = true;
  }

  function send(type:string, data:any={}) {
    room?.send(type, data);
  }

  function setStatus(msg:string, cls:string) { lobbyStatus=msg; lobbyStatusCls=cls; }

  // ── กู้บอร์ดคืนจาก room.state หลัง reconnect (เช่น refresh หน้าเว็บ) ──
  // ใช้ได้เฉพาะ "การ์ดบนบอร์ด" (field) เพราะ server เก็บ schema นี้แบบ persist อยู่แล้ว
  // หมายเหตุสำคัญ: มือ/เด็คของเราเองกู้กลับมาไม่ได้ครบ เพราะ server ไม่เคยรู้ว่าการ์ดใบไหน
  // กู้บอร์ดคืนจาก room.state หลัง reconnect (เช่น refresh หน้าเว็บ) —
  // schema ใหม่เก็บ hand/deck/lifeCards/trash ไว้ใน PlayerState ด้วย
  // ดังนั้น rebuildBoardFromState กู้ได้ครบทุกอย่างแล้ว
  function rebuildBoardFromState(state: any) {
    if (!state) return;
    cards = {};
    nextCid = 1;

    // ตรวจ isHost จาก state โดยตรง (ไม่พึ่ง reactive variable ที่อาจยังไม่ถูก update)
    // กรณี reconnect: isHost reactive อาจยัง false อยู่ตอน rebuildBoardFromState ถูกเรียก
    const amPlayer1 = room ? state.player1SessionId === room.sessionId : isHost;
    const myPs   = amPlayer1 ? state.player1 : state.player2;
    const oppPs  = amPlayer1 ? state.player2 : state.player1;
    console.log('[REBUILD] sessionId:', room?.sessionId, 'p1:', state.player1SessionId, 'p2:', state.player2SessionId, 'amPlayer1:', amPlayer1);
    console.log('[REBUILD] myPs.field size:', myPs?.field?.size, 'hand:', myPs?.hand?.length, 'lifeCards:', myPs?.lifeCards?.length, 'deck:', myPs?.deck?.length);
    console.log('[REBUILD] CARD_MAP keys sample:', Object.keys(CARD_MAP).slice(0,3));
    if (!myPs || !oppPs) { console.log('[REBUILD] ABORT: myPs or oppPs is null'); return; }
    // sync isHost reactive variable ให้ตรงกัน
    isHost = amPlayer1;

    myLife = myPs.life; oppLife = oppPs.life;
    myDon = myPs.donTotal; myDonSpent = myPs.donSpent;
    oppDon = oppPs.donTotal; oppDonSpent = oppPs.donSpent;
    oppHandCount = oppPs.handCount;
    myDeckCount = myPs.deckCount; oppDeckCount = oppPs.deckCount;
    phase = PHASES.indexOf(state.phase) >= 0 ? PHASES.indexOf(state.phase) : 0;
    turn = state.turn;

    // กู้การ์ดบนบอร์ด (field)
    let fieldRestored = 0, fieldMissing = 0;
    myPs.field.forEach((card: any, cid: string) => {
      const data = CARD_MAP[card.cardId];
      if (!data) { console.log('[REBUILD] CARD_MAP miss:', card.cardId); fieldMissing++; return; }
      fieldRestored++;
      cards[cid] = {
        data, cid, owner: 'mine', faceDown: card.faceDown, tapped: card.isTapped,
        rotation: card.rotation, inHand: false, isDon: card.isDon,
        counter: card.counter || undefined, x: card.x, y: card.y,
      };
      const n = parseInt(cid.replace(/\D/g, ''), 10);
      if (!isNaN(n) && n >= nextCid) nextCid = n + 1;
    });
    console.log('[REBUILD] field restored:', fieldRestored, 'missing from CARD_MAP:', fieldMissing);

    oppPs.field.forEach((card: any, cid: string) => {
      const data = CARD_MAP[card.cardId]; if (!data) return;
      const { x, y } = remoteM(card.x, card.y);
      cards[cid] = {
        data, cid, owner: 'opp', faceDown: card.faceDown, tapped: card.isTapped,
        rotation: card.rotation, inHand: false, isDon: card.isDon,
        counter: card.counter || undefined, x, y,
      };
    });

    // กู้มือ (hand)
    const savedHand: string[] = Array.from(myPs.hand ?? []);
    if (savedHand.length > 0) {
      myHand = [];
      savedHand.forEach((cardId: string) => {
        const data = CARD_MAP[cardId]; if (!data) return;
        const cid = createCardState(data, false, 'mine');
        cards[cid].inHand = true;
        myHand.push(cid);
      });
      myHandCount = myHand.length;
    }

    // กู้กองสำรับ (deck)
    const savedDeck: string[] = Array.from(myPs.deck ?? []);
    if (savedDeck.length > 0) {
      myDeck = [...savedDeck];
      myDeckCount = myDeck.length;
    }

    // กู้ life cards
    const savedLife: string[] = Array.from(myPs.lifeCards ?? []);
    if (savedLife.length > 0) {
      myLifeCards = [...savedLife];
    }

    // กู้ trash
    const savedTrash: string[] = Array.from(myPs.trashCards ?? []);
    if (savedTrash.length > 0) {
      myTrash = [...savedTrash];
    }
  }
  // ════════════════════════════════════════════════
  //   GAME START / RESET
  // ════════════════════════════════════════════════
  async function startGame() {
    lobbyFading = true; // trigger fade-out overlay บน Lobby
    await loadCardDB();

    // ── คำนวณจำนวน life จาก Leader card ──
    const leader = dbLeader || CARD_DB.find(c=>c.id==='OP01-012') || CARD_DB.find(c=>c.type==='Leader');
    const lifeCount = getLeaderLife(leader);

    myLife = lifeCount; oppLife = lifeCount; myMaxLife = lifeCount;
    myDon = dbDonCount > 0 ? dbDonCount : 10;
    myDonSpent = 0; oppDon = 10; oppDonSpent = 0;
    phase = 0; turn = 1;
    undoStack = []; attackLines = []; myLifeCards = [];
    mulliganAvailable = false;

    buildDeck();

    // รอ 3 วิให้ Lobby fade out ก่อน แล้วค่อยแสดงหน้าเกม
    await new Promise(r => setTimeout(r, 3000));
    gameStarted = true;

    // ── วาง Leader และ Life cards หลัง DOM mount ──
    await tick(); // รอให้ {#if gameStarted} render playfieldEl ก่อน
    syncBoardLayout(); // sync zone/board rect ให้ตรงกับ #playfield จริงก่อนวางการ์ดใบแรก
    if (leader) {
      const pos = getDefaultCardPos(leader);
      spawnCard(leader, pos.x, pos.y, false);
    }

    // ── Auto Life Spawn: ดึงการ์ดจาก deck ไปวางคว่ำใน life zone ──
    spawnLifeCards(lifeCount);

    // ── จั่วมือเริ่มต้น 5 ใบ (หลัง life spawn) ──
    setTimeout(() => { for (let i = 0; i < 5; i++) setTimeout(() => drawCard(), i * 90); }, 400);
    setTimeout(() => send('deck_count', {count: myDeck.length}), 700);
    setTimeout(() => { mulliganAvailable = true; }, 900); // เปิดสิทธิ์ Mulligan รอบเดียวตอนเริ่มเกม
    addLog(`เริ่มเกม! ชีวิต ${lifeCount} ใบ (จาก Leader: ${leader?.name || 'ไม่มี'})`, 'system');
  }

  // ── ดึงการ์ดจาก myDeck วางคว่ำใน you-life zone ──
  function spawnLifeCards(lifeCount: number) {
    myLifeCards = [];
    if (!myDeck.length) return;

    const lifeZone = BOARD_ZONES.find(z => z.id === 'you-life');
    if (!lifeZone) return;

    const b = getBoardRect(); // ใช้หลัง tick() → playfieldEl พร้อมแล้ว
    const slotH = lifeZone.h / lifeCount;

    for (let i = 0; i < lifeCount && myDeck.length > 0; i++) {
      const cardId = myDeck.pop()!;
      const data = CARD_MAP[cardId];
      if (!data) continue;

      myLifeCards.push(cardId);

      // พิกัด board (unscaled) ของ center แต่ละ slot ใน life zone
      const boardCX = lifeZone.x + lifeZone.w / 2;
      const boardCY = lifeZone.y + slotH * i + slotH / 2;

      // แปลงเป็น pixel ภายใน #playfield
      const px = Math.round(b.left + boardCX * b.scale - CARD_W / 2);
      const py = Math.round(b.top  + boardCY * b.scale - CARD_H / 2);

      const cid = createCardState(data, true, 'mine'); // faceDown = true (คว่ำ)
      cards[cid].x = px;
      cards[cid].y = py;
      cards[cid].zoneId = 'you-life';
      cards[cid].rotation = 90; // หมุน 90° แนวนอนเหมือน life card ปกติ
      send('card_spawn', {cid, cardId: data.id, x: px, y: py, faceDown: true, rotation: 90, zoneId: 'you-life'});
    }

    myDeckCount = myDeck.length;
    addLog(`วางไพ่ life ${myLifeCards.length} ใบ (คว่ำ)`, 'system');
    syncLifeCards(); syncDeckState();
  }

  async function resetBoard() {
    // Remove all cards
    cards={}; nextCid=1; myHand=[]; myTrash=[]; myDeck=[]; myLifeCards=[];

    // คำนวณ life จาก leader
    const leader = dbLeader || CARD_DB.find(c=>c.type==='Leader');
    const lifeCount = getLeaderLife(leader);

    myLife=lifeCount; oppLife=lifeCount; myMaxLife=lifeCount;
    myDon=dbDonCount>0?dbDonCount:10; myDonSpent=0; oppDon=10; oppDonSpent=0;
    oppHandCount=0; phase=0; turn=1;
    undoStack=[]; attackLines=[];
    mulliganAvailable = false;
    buildDeck();

    await tick(); // รอ DOM
    syncBoardLayout(); // sync zone/board rect ให้ตรงกับ #playfield จริงก่อนวางการ์ดใบแรกของเกมใหม่

    // วาง Leader
    if (leader) {
      const pos = getDefaultCardPos(leader);
      spawnCard(leader, pos.x, pos.y, false);
    }

    // Auto Life Spawn
    spawnLifeCards(lifeCount);

    setTimeout(()=>{ for(let i=0;i<5;i++) setTimeout(()=>drawCard(),i*90); },400);
    setTimeout(()=>send('deck_count',{count:myDeck.length}),700);
    setTimeout(()=>send('don_change',{total:myDon,spent:myDonSpent}),700);
    setTimeout(() => { mulliganAvailable = true; }, 900); // เปิดสิทธิ์ Mulligan รอบเดียวตอนเริ่มเกม
  }

  function confirmNewGame() {
    if(!confirm('รีเซ็ตบอร์ดทั้งสองฝ่าย?')) return;
    send('new_game', {});
    addLog('เริ่มเกมใหม่...','system');
  }

  function leaveRoom() {
    if(!confirm('ออกจากห้อง?')) return;
    _isIntentionalLeave = true;          // บอก onDestroy ว่าออกตั้งใจ ไม่ต้องส่ง going_away
    _unregisterPageBeforeUnload();       // ถอด beforeunload → server เห็น consented leave ถูกต้อง
    room?.leave(); room=null; gameStarted=false; lobbyView='form'; connected=false; matchInitialized=false;
    lobbyFading=false; // รีเซ็ต flag fade-out ของ Lobby ไม่งั้นกลับมาแล้วจอจะมืด (opacity:0 ค้าง)
    undoStack=[]; attackLines=[];
    clearReconnectInfo(); // ออกจากห้องเองแล้ว ไม่ต้อง reconnect อีกตอน refresh ครั้งหน้า
  }

  // ════════════════════════════════════════════════
  //   BOARD / ZONES
  // ════════════════════════════════════════════════
  // หมายเหตุ: ตัวเลขจริงๆ ถูกวัด+sync ไว้ใน boardRectState แล้ว (ดูบล็อก AUTO ZONE SYNC
  // ด้านบน) — getBoardRect() แค่อ่านค่า reactive นั้นกลับมา เพื่อให้ทุกจุดที่เรียก (รวมถึง
  // getZoneStyle ในเทมเพลต) reactive ตามจริงเวลา #playfield เปลี่ยนขนาด
  function getBoardRect() {
    return boardRectState;
  }

  // แปลงพิกัดเมาส์ในจอ (screen/viewport) ให้เป็นพิกัด "ภายใน #playfield แบบไม่สเกล"
  // ต้องหารด้วย boardScale เพราะ getBoundingClientRect() คืนค่าตามขนาดที่ถูกซูมแล้ว
  function screenToPlayfield(clientX:number, clientY:number) {
    if(!playfieldEl) return {x:clientX, y:clientY};
    const pfr = playfieldEl.getBoundingClientRect();
    return { x:(clientX-pfr.left)/boardScale, y:(clientY-pfr.top)/boardScale };
  }

  function toBoardPt(px:number,py:number) {
    const b=getBoardRect(); return {x:(px-b.left)/b.scale, y:(py-b.top)/b.scale};
  }

  // ════════════════════════════════════════════════
  //   RESIZE HANDLING
  // ════════════════════════════════════════════════
  // การ rebake พิกัดการ์ด (pixel เก่า → ใหม่) ตอน #playfield เปลี่ยนขนาด ย้ายไปรวมอยู่ใน
  // syncBoardLayout() แล้ว (ดูบล็อก AUTO ZONE SYNC ด้านบน) — onPlayfieldResize() แค่ debounce
  // ด้วย requestAnimationFrame กัน layout thrash เวลา resize ลากต่อเนื่อง (ResizeObserver ยิงถี่มาก)
  let lastBoardRect: { scale:number; left:number; top:number } | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let resizeRafId: number | null = null;

  function onPlayfieldResize() {
    if (resizeRafId != null) cancelAnimationFrame(resizeRafId);
    resizeRafId = requestAnimationFrame(() => {
      resizeRafId = null;
      syncBoardLayout();
    });
  }

  function findZoneAt(px:number,py:number,side='you') {
    const p=toBoardPt(px,py);
    return BOARD_ZONES.find(z=>z.side===side&&p.x>=z.x&&p.x<=z.x+z.w&&p.y>=z.y&&p.y<=z.y+z.h)||null;
  }

  function getZoneCardPos(zone:Zone, boardX:number|null=null, boardY:number|null=null) {
    const b=getBoardRect();
    let cx=zone.x+zone.w/2, cy=zone.y+zone.h/2;
    if(zone.snap==='grid') {
      const cols=zone.cols||1, rows=zone.rows||1;
      const relX=Math.max(0,Math.min(zone.w-1,(boardX??cx)-zone.x));
      const relY=Math.max(0,Math.min(zone.h-1,(boardY??cy)-zone.y));
      const col=Math.min(cols-1,Math.max(0,Math.floor(relX/(zone.w/cols))));
      const row=Math.min(rows-1,Math.max(0,Math.floor(relY/(zone.h/rows))));
      cx=zone.x+(col+0.5)*(zone.w/cols); cy=zone.y+(row+0.5)*(zone.h/rows);
    }
    return { x:Math.round(b.left+cx*b.scale-CARD_W/2), y:Math.round(b.top+cy*b.scale-CARD_H/2) };
  }

  function snapCard(cid:string,x:number,y:number) {
    if(!snapOn) return {x,y,zone:null};
    const zone=findZoneAt(x+CARD_W/2,y+CARD_H/2,'you');
    if(!zone) { if(cards[cid]) cards[cid].zoneId=undefined; return {x,y,zone:null}; }
    // โซน life, character, leader, stage ไม่มีแม่เหล็กดูด — วางตรงไหนอยู่ตรงนั้น แค่ผูก zoneId ให้ถูกต้อง
    if(zone.id==='you-life'||zone.id==='opp-life'||zone.id==='you-character'||zone.id==='opp-character'||zone.id==='you-leader'||zone.id==='opp-leader'||zone.id==='you-stage'||zone.id==='opp-stage') {
      if(cards[cid]) cards[cid].zoneId=zone.id;
      return {x,y,zone};
    }
    const bp=toBoardPt(x+CARD_W/2,y+CARD_H/2);
    const pos=getZoneCardPos(zone,bp.x,bp.y);
    if(cards[cid]) cards[cid].zoneId=zone.id;
    return {...pos,zone};
  }

  function setZoneHL(zone:Zone|null) {
    document.querySelectorAll<HTMLElement>('.zone').forEach(el=>{
      el.classList.toggle('drag-over',!!zone&&el.dataset.zoneId===zone.id);
    });
  }

  // ตรวจว่าตำแหน่งเมาส์ (screen coords) อยู่เหนือโซน HAND (มือ) อยู่หรือไม่ — ใช้ตอนลากการ์ดบนบอร์ด
  function isOverHandArea(clientX:number, clientY:number) {
    const el = document.getElementById('hand-area');
    if(!el) return false;
    const r = el.getBoundingClientRect();
    return clientX>=r.left && clientX<=r.right && clientY>=r.top && clientY<=r.bottom;
  }

  function setHandHL(active:boolean) {
    document.getElementById('hand-area')?.classList.toggle('drag-over-hand', active);
  }

  function getDefaultZone(data:CardData) {
    if(data.type==='Leader') return 'you-leader';
    if(data.type==='Stage') return 'you-stage';
    if(data.type==='Event') return 'you-cost';
    return 'you-character';
  }

  function getDefaultCardPos(data:CardData) {
    const zone=BOARD_ZONES.find(z=>z.id===getDefaultZone(data));
    if(zone) return getZoneCardPos(zone);
    return {x:playfieldEl?.offsetWidth/2-CARD_W/2||400, y:(playfieldEl?.offsetHeight||800)*0.68};
  }

  function toggleSnap() { snapOn=!snapOn; }

  // ════════════════════════════════════════════════
  //   CARD CREATION
  // ════════════════════════════════════════════════
  function createCardState(data:CardData, faceDown:boolean, owner:'mine'|'opp', forceCid:string|null=null): string {
    const prefix = isHost ? 'h':'g';
    const cid = forceCid||(prefix+nextCid++);
    
    cards[cid]={data,cid,owner,faceDown,tapped:false,rotation:0,inHand:false};
    return cid;
  }

  function cardAction(el: HTMLElement, cid: string) {
    if (cards[cid].owner === 'mine') setupCardDrag(cid, el);

    el.addEventListener('mouseleave',()=>{ tooltipVisible=false; });
    el.addEventListener('click',e=>{ 
      if(!cards[cid]?.faceDown&&e.detail===1) {
        setTimeout(()=>{ if(!el.classList.contains('dragging')) detailData=cards[cid].data; },120);
      }
    });

    return {
      destroy() {
        // Cleanup if needed
      }
    };
  }

  function setupCardDrag(cid:string, el: HTMLElement) {
    el.addEventListener('mousedown',e=>{
      if(e.button!==0) return; e.preventDefault();
      hideCtx();
      const card = cards[cid];
      if(!card) return;

      // เก็บสถานะก่อนลาก ไว้ใช้กับ Undo (Ctrl+Z)
      const undoPrev = { x:card.x, y:card.y, zoneId:card.zoneId, inHand:card.inHand };

      const fromHand=card.inHand;
      let pickedUpFromHand=false; // จะเป็น true ก็ต่อเมื่อมีการลากจริงๆ เท่านั้น (ไม่ใช่แค่คลิก)
      let moved=false;
      let dragGhostActive=false;
      let overHandZone=false; // ลากการ์ดมาทับโซน HAND (มือ) อยู่หรือไม่ — DON!! ไม่นับ เพราะ DON ไม่มีในมือ
      const startX=e.clientX, startY=e.clientY;

      const onMove=(e2:MouseEvent)=>{
        const pf = screenToPlayfield(e2.clientX, e2.clientY);

        // ถ้าการ์ดอยู่ในมือ ให้ "หยิบออกจากมือ" เฉพาะตอนที่เริ่มลากจริง
        // threshold 15px — ต่ำกว่านี้ถือเป็น click ดูการ์ดเฉยๆ ไม่ spawn
        if(fromHand && !pickedUpFromHand) {
          if(Math.abs(e2.clientX-startX)<15 && Math.abs(e2.clientY-startY)<15) return;
          pickedUpFromHand=true;
          const ix=pf.x-CARD_W/2, iy=pf.y-CARD_H/2;
          card.inHand=false; card.x=ix; card.y=iy;
          myHand=myHand.filter(id=>id!==cid); updateHandCount();
          send('card_spawn',{cid,cardId:card.data.id,x:ix,y:iy,faceDown:card.faceDown});
          addLog(`วางการ์ด: ${card.data.name}`,'you');
          send('log',{msg:`วางการ์ด: ${card.data.name}`});
          mulliganAvailable = false; // วางการ์ดใบเดียวลงบอร์ดแล้ว → หมดสิทธิ์ Mulligan ทันที
          sfxSystem.play('place');
        }

        if(!moved) {
          el.classList.add('dragging');
          const startCard = cards[cid];
          if(startCard) {
            dragGhostActive = true;
            lastDragMoveSend = Date.now();
            send('card_drag_start', {
              cid,
              cardId: startCard.data.id,
              imageUrl: startCard.data.imageUrl,
              art: startCard.data.art,
              x: pf.x - CARD_W/2,
              y: pf.y - CARD_H/2,
              faceDown: startCard.faceDown
            });
          }
        }
        moved=true;
        const nx=pf.x-CARD_W/2, ny=pf.y-CARD_H/2;
        const cur = cards[cid];
        if(cur) { cur.x = nx; cur.y = ny; }

        // ลากการ์ด (ที่ไม่ใช่ DON!!) มาทับโซน HAND (มือ) → ไฮไลท์โซนมือแทนโซนบนบอร์ด
        overHandZone = !card.isDon && isOverHandArea(e2.clientX,e2.clientY);
        if(overHandZone) { setZoneHL(null); setHandHL(true); }
        else { setHandHL(false); setZoneHL(snapOn?findZoneAt(nx+CARD_W/2,ny+CARD_H/2,'you'):null); }

        const nowDrag = Date.now();
        if(dragGhostActive && nowDrag - lastDragMoveSend >= 33) {
          lastDragMoveSend = nowDrag;
          send('card_drag_move', { cid, x: nx, y: ny });
        }
      };
      const onUp=()=>{
        document.removeEventListener('mousemove',onMove);
        document.removeEventListener('mouseup',onUp);
        if(dragGhostActive) {
          send('card_drag_end', { cid });
          dragGhostActive = false;
        }
        el.classList.remove('dragging'); setZoneHL(null); setHandHL(false);

        // คลิกเฉยๆ ไม่ได้ลาก (การ์ดในมือ) → ไม่ต้องทำอะไร ปล่อยให้อยู่ในมือต่อไป
        if(fromHand && !pickedUpFromHand) return;

        // คลิกเฉยๆ ไม่ได้ลาก (การ์ดบนบอร์ด เช่น การ์ด life) → ไม่ต้อง re-snap ตำแหน่งเดิม
        // ป้องกันไม่ให้การ์ดถูกดึงไปจุดกึ่งกลาง zone ทับกับใบอื่นจนมองไม่เห็น
        if(!moved && !pickedUpFromHand) return;

        const cur = cards[cid];
        if(!cur) return;

        // ปล่อยการ์ดทับโซน HAND (มือ) → ส่งการ์ดกลับเข้ามือ แทนที่จะวางบนบอร์ด (DON!! ไม่นับ เพราะ DON ไม่มีในมือ)
        if(overHandZone && !cur.isDon) {
          const prevZoneIdHand = cur.zoneId;
          send('card_remove',{cid});
          cur.inHand=true; cur.x=undefined; cur.y=undefined; cur.zoneId=undefined;
          if(!myHand.includes(cid)) myHand.push(cid);
          // ถ้าการ์ดเคยอยู่ในสุสาน ต้องเอาออกจาก myTrash ด้วย ให้ count ตรงกับของจริง
          if(prevZoneIdHand === 'you-trash') {
            const idx = myTrash.indexOf(cur.data.id);
            if (idx !== -1) { myTrash.splice(idx, 1); syncTrash(); }
          }
          updateHandCount(); syncHandState();
          addLog(`ไปมือ: ${cur.data.name}`,'you');
          return;
        }

        const prevZoneId = cur.zoneId;
        const s=snapCard(cid,cur.x||0,cur.y||0);
        cur.x=s.x; cur.y=s.y;
        if(moved||pickedUpFromHand||s.zone) {
          // เล่น flip+glow ทุกครั้งที่ปล่อยการ์ดสำเร็จ (วางจากมือ หรือลากย้ายตำแหน่งในสนาม)
          cur.dropAnim = false;
          requestAnimationFrame(()=>{ if(cards[cid]) cards[cid].dropAnim = true; });
          send('card_move',{cid,x:s.x,y:s.y});
          pushUndo({type:'move', cid, prev:undoPrev});
          // ลากการ์ดมาวางในโซนสุสานเอง (ไม่ผ่านคลิกขวา) → ต้องอัปเดต myTrash ด้วย
          // ไม่งั้น Search Trash จะนับว่าสุสานว่างอยู่ (เช็คจาก myTrash.length)
          if(!cur.isDon && s.zone?.id === 'you-trash' && !myTrash.includes(cur.data.id)) {
            myTrash.push(cur.data.id);
            syncTrash();
          }
          // ลากการ์ดออกจากสุสานไปที่อื่นเอง → เอาออกจาก myTrash ด้วย ให้ count ตรงกับของจริง
          if(!cur.isDon && prevZoneId === 'you-trash' && s.zone?.id !== 'you-trash') {
            const idx = myTrash.indexOf(cur.data.id);
            if (idx !== -1) { myTrash.splice(idx, 1); syncTrash(); }
          }
        }
      };
      document.addEventListener('mousemove',onMove);
      document.addEventListener('mouseup',onUp);
    });
    el.addEventListener('contextmenu',e=>{ e.preventDefault(); showCtxMenu(e,cid); });
    setupAttackLineDrag(cid, el);
  }

  // ════════════════════════════════════════════════
  //   ATTACK LINE (ลากเส้นโจมตีชั่วคราว)
  // ════════════════════════════════════════════════
  function cardCenter(cid:string) {
    const c = cards[cid];
    if(!c) return null;
    return { x:(c.x||0)+CARD_W/2, y:(c.y||0)+CARD_H/2 };
  }

  function spawnAttackLine(fromX:number, fromY:number, toX:number, toY:number, owner:'mine'|'opp') {
    const id = 'al' + Date.now() + Math.random().toString(36).slice(2,7);
    const line: AttackLine = { id, fromX, fromY, toX, toY, owner, createdAt: Date.now() };
    attackLines = [...attackLines, line];
    setTimeout(()=>{ attackLines = attackLines.filter(l=>l.id!==id); }, ATTACK_LINE_TTL);
  }

  function setupAttackLineDrag(cid:string, el: HTMLElement) {
    el.addEventListener('mousedown', e => {
      if (e.button !== 1) return; // เฉพาะคลิกล้อเมาส์ตรงกลาง (middle-click)
      e.preventDefault();
      const card = cards[cid];
      if (!card || card.inHand) return;
      hideCtx();

      const start = cardCenter(cid);
      if (!start) return;
      let dragged = false;

      drawingLine = { x1:start.x, y1:start.y, x2:start.x, y2:start.y };

      const onMove = (e2: MouseEvent) => {
        const pf = screenToPlayfield(e2.clientX, e2.clientY);
        if (Math.abs(pf.x - start.x) > 4 || Math.abs(pf.y - start.y) > 4) dragged = true;
        if (drawingLine) { drawingLine.x2 = pf.x; drawingLine.y2 = pf.y; }
      };
      const onUp = (e2: MouseEvent) => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        const finalLine = drawingLine;
        drawingLine = null;
        if (!dragged || !finalLine) return; // คลิกล้อเมาส์เฉยๆ ไม่ลาก → ไม่ทำอะไร

        spawnAttackLine(finalLine.x1, finalLine.y1, finalLine.x2, finalLine.y2, 'mine');
        // ส่งพิกัดแบบ mirror (สลับด้าน) ให้คู่ต่อสู้เห็นเส้นในมุมมองของเขา
        const pfw = playfieldEl?.offsetWidth || BOARD_SIZE;
        const pfh = playfieldEl?.offsetHeight || BOARD_SIZE;
        send('attack_line', {
          fromX: pfw - finalLine.x1, fromY: pfh - finalLine.y1,
          toX:   pfw - finalLine.x2, toY:   pfh - finalLine.y2,
        });
        addLog(`ลากเส้นโจมตี: ${card.data.name}`, 'you');
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    // ป้องกัน auto-scroll ของเบราว์เซอร์ตอนกดล้อเมาส์ค้างเหนือการ์ด
    el.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
  }

  function handleRemoteAttackLine(d:any) {
    spawnAttackLine(d.fromX, d.fromY, d.toX, d.toY, 'opp');
  }


  function spawnCard(data:CardData, x:number, y:number, faceDown:boolean) {
    const cid = createCardState(data, faceDown, 'mine');
    cards[cid].x = x;
    cards[cid].y = y;
    requestAnimationFrame(()=>{ if(cards[cid]) cards[cid].dropAnim = true; });
    send('card_spawn',{cid,cardId:data.id,x,y,faceDown});
    return cid;
  }

  // ════════════════════════════════════════════════
  //   DECK
  // ════════════════════════════════════════════════
  function buildDeck() {
    myDeck=[];
    const saved=Object.entries(dbCards);
    if(saved.length) {
      saved.forEach(([id,cnt])=>{ for(let i=0;i<cnt;i++) myDeck.push(id); });
    } else {
      const pool=CARD_DB.filter(c=>c.type.toLowerCase()!=='leader');
      const src=pool.length>=50?pool:CARD_DB;
      src.forEach(c=>{
        const n=c.rarity==='L'?1:c.rarity==='SR'?1:c.rarity==='R'?2:4;
        for(let i=0;i<n&&myDeck.length<50;i++) myDeck.push(c.id);
      });
    }
    shuffle(myDeck); myDeckCount=myDeck.length;
  }

  function shuffle(arr:any[]) {
    for(let i=arr.length-1;i>0;i--) {
      const j=Math.floor(Math.random()*(i+1));
      [arr[i],arr[j]]=[arr[j],arr[i]];
    }
  }

  function drawCard() {
    if(!myDeck.length) { addLog('สำรับหมด!','system'); return; }
    const cardId=myDeck.pop()!;
    const data=CARD_MAP[cardId];
    if(!data) return;
    const cid = createCardState(data, false, 'mine');
    cards[cid].inHand = true;
    myHand.push(cid);
    myHandCount=myHand.length; myDeckCount=myDeck.length;
    updateHandCount();
    send('draw',{}); send('deck_count',{count:myDeck.length});
    syncHandState(); syncDeckState();
    addLog(`จั่ว: ${data.name}`,'you');
    sfxSystem.play('draw');
  }

  // Draw from Bottom (จั่วจากใต้กอง): ดึงการ์ดใบล่างสุดของกองหลักส่งเข้ามือตรงๆ
  function drawFromBottom() {
    if(!myDeck.length) { addLog('สำรับหมด!','system'); return; }
    const cardId=myDeck.shift()!;
    const data=CARD_MAP[cardId];
    if(!data) return;
    const cid = createCardState(data, false, 'mine');
    cards[cid].inHand = true;
    myHand.push(cid);
    myHandCount=myHand.length; myDeckCount=myDeck.length;
    updateHandCount();
    send('draw',{}); send('deck_count',{count:myDeck.length});
    syncHandState(); syncDeckState();
    addLog(`จั่วจากใต้กอง: ${data.name}`,'you');
    sfxSystem.play('draw');
  }

  // ════════════════════════════════════════════════
  //   SEARCH N (ค้นกองหลัก)
  // ════════════════════════════════════════════════
  // ดึงการ์ดบนสุด N ใบออกมาดูแบบส่วนตัว (local-only ไม่ send ข้อมูลการ์ดจริงไปฝั่งคู่ต่อสู้
  // คู่ต่อสู้เห็นแค่จำนวนกองหลักลดลงชั่วคราวผ่าน deck_count เหมือนกับเรากำลังจั่วเฉยๆ)
  function startSearch(n:number) {
    if(!myDeck.length) { addLog('สำรับหมด!','system'); return; }
    const take = Math.min(n, myDeck.length);
    const picked: {uid:string; cardId:string; data:CardData}[] = [];
    for(let i=0;i<take;i++) {
      const cardId = myDeck.pop()!;
      const data = CARD_MAP[cardId];
      if(!data) continue;
      picked.push({uid:'srch'+(searchSeq++), cardId, data});
    }
    searchCards = picked; // picked[0] = ใบบนสุด ไปจนถึงใบล่างสุดของกลุ่มที่ดึงมา
    searchCount = n;
    myDeckCount = myDeck.length;
    send('deck_count',{count:myDeck.length});
    syncDeckState();
    searchVisible = true;
    addLog(`Search ${n}: เปิดดูการ์ดบนสุด ${picked.length} ใบ (เห็นแค่เราคนเดียว)`,'you');
  }

  // เลือกการ์ด 1 ใบจากผลค้นหาเข้ามือทันที (เหลือใบอื่นไว้ตัดสินใจต่อ)
  function pickFromSearch(uid:string) {
    const idx = searchCards.findIndex(c=>c.uid===uid);
    if(idx===-1) return;
    const item = searchCards[idx];
    const cid = createCardState(item.data, false, 'mine');
    cards[cid].inHand = true;
    myHand.push(cid);
    myHandCount = myHand.length;
    updateHandCount();
    send('draw',{});
    syncHandState();
    searchCards = searchCards.filter(c=>c.uid!==uid);
    addLog(`Search: เลือกเข้ามือ — ${item.data.name}`,'you');
    if(!searchCards.length) searchVisible=false; // เลือกหมดทุกใบแล้ว ปิดหน้าต่างให้เลย
  }

  // Put Back: กวาดการ์ดที่เหลือทั้งหมดไปใต้กอง (bottom) หรือทิ้งลงสุสาน (trash) แล้วปิดหน้าต่าง
  function resolveSearch(mode:'bottom'|'trash') {
    const remaining = searchCards;
    if(!remaining.length) { closeSearch(); return; }

    if(mode==='bottom') {
      // เรียงให้ใบที่เคยอยู่บนสุดของกลุ่ม ยังคง "อยู่บนกว่า" ใบอื่นในกลุ่มเดิม หลังจากลงไปอยู่ใต้กองทั้งหมด
      myDeck = [...remaining.slice().reverse().map(c=>c.cardId), ...myDeck];
      myDeckCount = myDeck.length;
      send('deck_count',{count:myDeck.length});
      syncDeckState();
      addLog(`Search: เก็บที่เหลือ ${remaining.length} ใบไว้ใต้กอง`,'you');
    } else {
      const trashZone = BOARD_ZONES.find(z=>z.id==='you-trash')!;
      remaining.forEach(item=>{
        const pos = getZoneCardPos(trashZone);
        const cid = createCardState(item.data, false, 'mine');
        cards[cid].x = pos.x; cards[cid].y = pos.y; cards[cid].zoneId = 'you-trash'; cards[cid].inHand = false;
        if(!myTrash.includes(item.data.id)) myTrash.push(item.data.id);
        send('card_spawn',{cid,cardId:item.data.id,x:pos.x,y:pos.y,faceDown:false,zoneId:'you-trash'});
      });
      syncTrash();
      addLog(`Search: ทิ้งที่เหลือ ${remaining.length} ใบลงสุสาน`,'you');
    }
    closeSearch();
  }

  function closeSearch() {
    searchVisible = false;
    searchCards = [];
  }

  // ════════════════════════════════════════════════
  //   SEARCH DECK (ค้นกองทั้งหมด — เลือก X ใบ)
  // ════════════════════════════════════════════════
  function startSearchDeck(pickCount: number) {
    if (!myDeck.length) { addLog('สำรับหมด!', 'system'); return; }
    // สร้าง snapshot ของกองทั้งหมด (ไม่ดึงออกจาก myDeck จนกว่าจะยืนยัน)
    const all: {uid:string; cardId:string; idx:number; data:CardData}[] = [];
    for (let i = myDeck.length - 1; i >= 0; i--) { // reverse: บนสุด (pop) ไปล่างสุด
      const cardId = myDeck[i];
      const data = CARD_MAP[cardId];
      if (!data) continue;
      all.push({ uid: `ds${searchSeq++}`, cardId, idx: i, data });
    }
    deckSearchCards = all;
    deckSearchSelected = new Set();
    deckSearchQuery = '';
    deckSearchPickCount = pickCount;
    deckSearchVisible = true;
    addLog(`Search Deck: เปิดดูกองทั้งหมด ${all.length} ใบ (เห็นแค่เราคนเดียว)`, 'you');
  }

  function toggleDeckSearchCard(uid: string) {
    const next = new Set(deckSearchSelected);
    if (next.has(uid)) {
      next.delete(uid);
    } else {
      if (next.size >= deckSearchPickCount) {
        // แทนที่ใบล่าสุดที่เลือก ถ้าเลือกครบโควต้าแล้ว
        const first = next.values().next().value as string;
        next.delete(first);
      }
      next.add(uid);
    }
    deckSearchSelected = next;
  }

  function confirmDeckSearch() {
    if (!deckSearchSelected.size) { closeDeckSearch(); return; }
    // ดึงการ์ดที่เลือกออกจาก myDeck จริงๆ แล้วส่งเข้ามือ
    const selectedItems = deckSearchCards.filter(c => deckSearchSelected.has(c.uid));
    // ลบออกจาก myDeck โดยใช้ index (เรียงจากมากไปน้อย เพื่อไม่ให้ index เลื่อน)
    const indices = selectedItems.map(c => c.idx).sort((a, b) => b - a);
    indices.forEach(idx => { myDeck.splice(idx, 1); });
    myDeckCount = myDeck.length;
    send('deck_count', { count: myDeck.length });
    syncDeckState();

    selectedItems.forEach(item => {
      const cid = createCardState(item.data, false, 'mine');
      cards[cid].inHand = true;
      myHand.push(cid);
      send('draw', {});
    });
    myHandCount = myHand.length;
    updateHandCount();
    syncHandState();
    shuffleDeck(); // สับกองหลังเลือกเสร็จ (optional แต่ถูกกติกา)
    addLog(`Search Deck: เลือก ${selectedItems.length} ใบเข้ามือ — ${selectedItems.map(c=>c.data.name).join(', ')}`, 'you');
    closeDeckSearch();
  }

  function closeDeckSearch() {
    deckSearchVisible = false;
    deckSearchCards = [];
    deckSearchSelected = new Set();
    deckSearchQuery = '';
  }

  // derived: การ์ดที่กรองตาม query
  function getDeckSearchFiltered() {
    const q = deckSearchQuery.toLowerCase().trim();
    if (!q) return deckSearchCards;
    return deckSearchCards.filter(c =>
      c.data.name.toLowerCase().includes(q) ||
      c.data.type.toLowerCase().includes(q) ||
      c.data.color.toLowerCase().includes(q) ||
      c.data.effect.toLowerCase().includes(q) ||
      c.cardId.toLowerCase().includes(q)
    );
  }

  // ════════════════════════════════════════════════
  //   SEARCH TRASH (ค้นกองทิ้ง/สุสาน)
  // ════════════════════════════════════════════════
  // เปิดดูการ์ดทุกใบที่อยู่ในสุสานของเรา (เห็นแค่เราคนเดียว) — ไม่ดึงข้อมูลใหม่ใดๆ
  // เพราะการ์ดในสุสานมีตัวตนอยู่บนบอร์ดแล้ว (cards[cid]) แค่เปิด modal มาเลือกได้
  function openTrashSearch() {
    if (!myTrash.length) { addLog('สุสานยังไม่มีการ์ด!', 'system'); return; }
    trashSearchQuery = '';
    trashSearchVisible = true;
    addLog(`Search Trash: เปิดดูสุสาน ${myTrash.length} ใบ (เห็นแค่เราคนเดียว)`, 'you');
  }

  // รายการการ์ดในสุสาน อ้างอิงจาก entity จริงบนบอร์ด (cards) ที่อยู่ใน zone you-trash
  function getTrashSearchEntries() {
    return Object.values(cards)
      .filter(c => c.owner === 'mine' && c.zoneId === 'you-trash' && !c.inHand)
      .map(c => ({ cid: c.cid, cardId: c.data.id, data: c.data }));
  }

  function getTrashSearchFiltered() {
    const all = getTrashSearchEntries();
    const q = trashSearchQuery.toLowerCase().trim();
    if (!q) return all;
    return all.filter(c =>
      c.data.name.toLowerCase().includes(q) ||
      c.data.type.toLowerCase().includes(q) ||
      c.data.color.toLowerCase().includes(q) ||
      c.data.effect.toLowerCase().includes(q) ||
      c.cardId.toLowerCase().includes(q)
    );
  }

  // เลือกการ์ด 1 ใบจากสุสานเข้ามือทันที — การ์ดมีตัวตนอยู่แล้วจึงใช้ doToHand ตรงๆ (ไม่ spawn ซ้ำ)
  function pickFromTrashSearch(cid: string, cardId: string) {
    const idx = myTrash.indexOf(cardId);
    if (idx !== -1) myTrash.splice(idx, 1);
    syncTrash();
    doToHand(cid);
    if (!myTrash.length) trashSearchVisible = false; // สุสานหมดแล้ว ปิด modal ให้เลย
  }

  function closeTrashSearch() {
    trashSearchVisible = false;
    trashSearchQuery = '';
  }

  // ════════════════════════════════════════════════
  //   SCRY X (มองบนกอง + จัดลำดับ)
  // ════════════════════════════════════════════════
  function startScry(n: number) {
    if (!myDeck.length) { addLog('สำรับหมด!', 'system'); return; }
    const take = Math.min(n, myDeck.length);
    const picked: {uid:string; cardId:string; data:CardData}[] = [];
    // pop จาก myDeck (บนสุดออกมาก่อน) → picked[0] = บนสุด
    for (let i = 0; i < take; i++) {
      const cardId = myDeck.pop()!;
      const data = CARD_MAP[cardId];
      if (!data) { myDeck.push(cardId); continue; }
      picked.push({ uid: `scry${searchSeq++}`, cardId, data });
    }
    scryCards = picked;
    scryCount = take;
    scryDragIdx = null;
    scryDropIdx = null;
    scryVisible = true;
    myDeckCount = myDeck.length;
    send('deck_count', { count: myDeck.length });
    syncDeckState();
    addLog(`Scry ${take}: มองการ์ดบนสุด ${take} ใบ (เห็นแค่เราคนเดียว)`, 'you');
  }

  // drag-and-drop reorder inside scry panel (mouse events)
  function scryDragStart(idx: number) { scryDragIdx = idx; }
  function scryDragEnter(idx: number) { scryDropIdx = idx; }
  function scryDragEnd() {
    if (scryDragIdx !== null && scryDropIdx !== null && scryDragIdx !== scryDropIdx) {
      const arr = [...scryCards];
      const [moved] = arr.splice(scryDragIdx, 1);
      arr.splice(scryDropIdx, 0, moved);
      scryCards = arr;
    }
    scryDragIdx = null;
    scryDropIdx = null;
  }

  // ย้ายการ์ดใบนั้นขึ้น/ลงหนึ่งตำแหน่ง
  function scryMove(idx: number, dir: -1 | 1) {
    const arr = [...scryCards];
    const target = idx + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    scryCards = arr;
  }

  // ส่งการ์ดใบนั้นไปล่างสุดของกลุ่ม scry
  function scryToBottom(idx: number) {
    const arr = [...scryCards];
    const [item] = arr.splice(idx, 1);
    arr.push(item);
    scryCards = arr;
  }

  // ยืนยัน: ใส่การ์ดกลับกอง ตามลำดับที่จัด (scryCards[0] = บนสุด)
  function confirmScry() {
    // ใส่กลับใน order ที่ต้องการ: push ล่างสุดก่อน → pop = บนสุด
    for (let i = scryCards.length - 1; i >= 0; i--) {
      myDeck.push(scryCards[i].cardId);
    }
    myDeckCount = myDeck.length;
    send('deck_count', { count: myDeck.length });
    syncDeckState();
    addLog(`Scry: จัดลำดับแล้ว ${scryCards.length} ใบ (ใบบนสุด = ${scryCards[0]?.data.name})`, 'you');
    closeScry();
  }

  function closeScry() {
    // ถ้าปิดโดยไม่ยืนยัน ให้ใส่กลับตามลำดับเดิม
    if (scryCards.length) {
      for (let i = scryCards.length - 1; i >= 0; i--) {
        myDeck.push(scryCards[i].cardId);
      }
      myDeckCount = myDeck.length;
      send('deck_count', { count: myDeck.length });
      syncDeckState();
    }
    scryVisible = false;
    scryCards = [];
    scryDragIdx = null;
    scryDropIdx = null;
  }

  function shuffleDeck() {
    shuffle(myDeck); myDeckCount=myDeck.length;
    send('shuffle',{}); send('deck_count',{count:myDeck.length});
    syncDeckState();
    addLog('สับสำรับ','you');
    playShuffleAnim('you');
    sfxSystem.play('shuffle');
  }

  // ── Mulligan: สับมือ 5 ใบกลับกอง แล้วจั่วใหม่ 5 ใบ (ทำได้รอบเดียวตอนเริ่มเกม) ──
  function doMulligan() {
    if (!mulliganAvailable) return;
    mulliganAvailable = false; // ใช้สิทธิ์แล้ว ปุ่มจะหายไปทันที

    // ส่งการ์ดในมือทั้งหมดกลับเข้ากอง
    const handCids = myHand.slice();
    handCids.forEach(cid => {
      const c = cards[cid];
      if (c) { myDeck.push(c.data.id); send('card_remove', {cid}); delete cards[cid]; }
    });
    myHand = [];
    myHandCount = 0;
    send('hand_count', {count: 0});

    shuffle(myDeck);
    myDeckCount = myDeck.length;
    send('shuffle', {});
    send('deck_count', {count: myDeck.length});
    syncHandState(); syncDeckState();
    playShuffleAnim('you');

    // จั่วใหม่ 5 ใบ
    setTimeout(() => { for (let i = 0; i < 5; i++) setTimeout(() => drawCard(), i * 90); }, 250);

    addLog('Mulligan: สับมือกลับกองแล้วจั่วใหม่ 5 ใบ', 'you');
    send('log', {msg: 'ทำ Mulligan (เปลี่ยนมือเริ่มต้น)'});
  }

  // เพิ่มอนิเมชั่นเวลาสับกอง deck ให้เราเเละคู่ต่อสู้เห็น
  function playShuffleAnim(who:'you'|'opp') {
    const ANIM_MS = 1650;
    if(who==='you') {
      clearTimeout(myShuffleTimer);
      myDeckShuffling = false;
      requestAnimationFrame(()=>{ myDeckShuffling = true; });
      myShuffleTimer = setTimeout(()=>{ myDeckShuffling = false; }, ANIM_MS);
    } else {
      clearTimeout(oppShuffleTimer);
      oppDeckShuffling = false;
      requestAnimationFrame(()=>{ oppDeckShuffling = true; });
      oppShuffleTimer = setTimeout(()=>{ oppDeckShuffling = false; }, ANIM_MS);
    }
  }

  function updateHandCount() {
    myHandCount=myHand.length;
    send('hand_count',{count:myHand.length});
  }

  // ── Sync hand/deck/life/trash ไปยัง server เพื่อใช้กู้คืนตอน reconnect ──
  // เรียกหลัง hand/deck/lifeCards/myTrash เปลี่ยน เพื่อให้ server เก็บ snapshot ล่าสุด
  function syncHandState() {
    // ส่ง cardId จริงๆ ใน hand (ดึงจาก cards[cid].data.id)
    const handIds = myHand.map(cid => cards[cid]?.data?.id).filter(Boolean);
    send('sync_hand', { hand: handIds });
  }
  function syncDeckState() {
    send('sync_deck', { deck: [...myDeck] });
  }
  function syncLifeCards() {
    send('sync_life_cards', { lifeCards: [...myLifeCards] });
  }
  function syncTrash() {
    send('sync_trash', { trashCards: [...myTrash] });
  }
  // sync ทุกอย่างในครั้งเดียว (ใช้ตอน rebuildBoardFromState หลัง reconnect)
  function syncAllState() {
    syncHandState();
    syncDeckState();
    syncLifeCards();
    syncTrash();
  }

  // ════════════════════════════════════════════════
  //   UNDO SYSTEM
  // ════════════════════════════════════════════════
  function pushUndo(entry: UndoEntry) {
    undoStack.push(entry);
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  }

  function performUndo() {
    const entry = undoStack.pop();
    if (!entry) { addLog('ไม่มีอะไรให้ย้อนกลับแล้ว', 'system'); return; }
    const c = cards[entry.cid as string];
    switch (entry.type) {
      case 'move': {
        if (!c) break;
        c.x = entry.prev.x; c.y = entry.prev.y;
        c.zoneId = entry.prev.zoneId; c.inHand = entry.prev.inHand ?? false;
        send('card_move', { cid: entry.cid, x: c.x, y: c.y });
        break;
      }
      case 'tap': {
        if (!c) break;
        c.tapped = entry.prev;
        send('card_tap', { cid: entry.cid, tapped: c.tapped });
        break;
      }
      case 'flip': {
        if (!c) break;
        c.faceDown = entry.prev;
        send('card_flip', { cid: entry.cid, faceDown: c.faceDown });
        break;
      }
      case 'rotate': {
        if (!c) break;
        c.rotation = entry.prev;
        send('card_rotate', { cid: entry.cid, rotation: c.rotation });
        break;
      }
      case 'counter': {
        if (!c) break;
        c.counter = entry.prev;
        send('card_counter', { cid: entry.cid, val: c.counter });
        break;
      }
      case 'trash': {
        // คืนการ์ดจากสุสานกลับไปตำแหน่งเดิม (การ์ดยังอยู่บนบอร์ดตลอด ไม่ได้ลบออกจาก cards)
        if (!c) break;
        c.x = entry.prev.x; c.y = entry.prev.y; c.zoneId = entry.prev.zoneId;
        send('card_move', { cid: entry.cid, x: c.x, y: c.y });
        const idx = myTrash.indexOf(entry.cardDataId);
        if (idx !== -1) myTrash.splice(idx, 1);
        break;
      }
    }
    addLog('ย้อนกลับการกระทำล่าสุด (Ctrl+Z)', 'system');
  }

  // ════════════════════════════════════════════════
  //   CARD ACTIONS
  // ════════════════════════════════════════════════
  function doTap(cid:string) {
    const c=cards[cid]; if(!c||c.owner!=='mine') return;
    pushUndo({type:'tap', cid, prev:c.tapped});
    c.tapped=!c.tapped;
    send('card_tap',{cid,tapped:c.tapped});
    addLog(`${c.tapped?'แตะ':'ตั้ง'}: ${c.data.name}`,'you');
  }
  function doFlip(cid:string) {
    const c=cards[cid]; if(!c||c.owner!=='mine') return;
    pushUndo({type:'flip', cid, prev:c.faceDown});
    c.faceDown=!c.faceDown;
    send('card_flip',{cid,faceDown:c.faceDown}); addLog(`พลิก: ${c.data.name}`,'you');
  }
  function doRotate(cid:string) {
    const c=cards[cid]; if(!c||c.owner!=='mine') return;
    pushUndo({type:'rotate', cid, prev:c.rotation});
    c.rotation=(c.rotation+90)%360;
    send('card_rotate',{cid,rotation:c.rotation});
  }
  function doTrash(cid:string) {
    const c=cards[cid]; if(!c||c.owner!=='mine') return;
    pushUndo({type:'trash', cid, prev:{x:c.x,y:c.y,zoneId:c.zoneId}, cardDataId:c.data.id});
    const trashZone = BOARD_ZONES.find(z=>z.id==='you-trash')!;
    const pos = getZoneCardPos(trashZone);
    c.x = pos.x; c.y = pos.y; c.zoneId = 'you-trash'; c.inHand = false;
    if(!myTrash.includes(c.data.id)) myTrash.push(c.data.id);
    send('card_move',{cid,x:pos.x,y:pos.y});
    syncTrash();
    addLog(`สุสาน: ${c.data.name}`,'you');
  }
  function doToHand(cid:string) {
    const c=cards[cid]; if(!c||c.owner!=='mine') return;
    const name=c.data;
    send('card_remove',{cid});
    c.inHand=true; c.x=undefined; c.y=undefined;
    if(!myHand.includes(cid)) myHand.push(cid);
    updateHandCount(); syncHandState(); addLog(`ไปมือ: ${c.data.name}`,'you');
  }
  function doToTop(cid:string) {
    const c=cards[cid]; if(!c||c.owner!=='mine') return;
    myDeck.push(c.data.id); send('card_remove',{cid}); delete cards[cid];
    myDeckCount=myDeck.length; send('deck_count',{count:myDeck.length}); syncDeckState(); addLog('ส่งบนสำรับ','you');
  }
  function doToBottom(cid:string) {
    const c=cards[cid]; if(!c||c.owner!=='mine') return;
    myDeck.unshift(c.data.id); send('card_remove',{cid}); delete cards[cid];
    myDeckCount=myDeck.length; send('deck_count',{count:myDeck.length}); syncDeckState(); addLog('ส่งล่างสำรับ','you');
  }
  function doToLife(cid:string) {
    const c=cards[cid]; if(!c||c.owner!=='mine') return;
    if(myLife<myMaxLife){ myLife++; send('life_change',{val:myLife}); }
    send('card_remove',{cid}); delete cards[cid]; addLog('ส่งไปชีวิต','you');
  }
  function doClone(cid:string) {
    const c=cards[cid]; if(!c||c.owner!=='mine') return;
    const nx=(c.x||0)+30, ny=(c.y||0)+30;
    spawnCard(c.data,nx,ny,c.faceDown);
    addLog(`ทำสำเนา: ${c.data.name}`,'you');
  }
  function doCounter(cid:string, val:number) {
    const c=cards[cid]; if(!c||c.owner!=='mine') return;
    pushUndo({type:'counter', cid, prev:c.counter||0});
    c.counter=(c.counter||0)+val;
    send('card_counter',{cid,val:c.counter});
    addLog(`Counter ${val > 0 ? '+' : ''}${val}: ${c.data.name} (${c.counter})`,'you');
  }

  // ctx menu
  function showCtxMenu(e:MouseEvent, cid:string) {
    ctxCid=cid; ctxX=Math.min(e.clientX,window.innerWidth-175); ctxY=Math.min(e.clientY,window.innerHeight-290); ctxVisible=true; ctxCounterVisible=false;
  }
  function showDeckCtxMenu(e:MouseEvent) {
    deckCtxX=Math.min(e.clientX,window.innerWidth-165); deckCtxY=Math.min(e.clientY,window.innerHeight-225); deckCtxVisible=true;
  }
  function hideCtx() { ctxVisible=false; ctxCid=''; deckCtxVisible=false; ctxCounterVisible=false; }
  function ctxAct(act:string) {
    if(!ctxCid) return;
    const cid=ctxCid;   // capture ก่อน hideCtx() ล้าง ctxCid
    hideCtx();
    if(act==='rotateAll') { rotateSelectedCards(); return; }
    if(act==='flipAll') { flipSelectedCards(); return; }
    if(act==='tapAll') { tapSelectedCards(); return; }
    if(act==='cloneAll') { cloneSelectedCards(); return; }
    if(act==='toHandAll') { toHandSelectedCards(); return; }
    if(act==='trashAll') { trashSelectedCards(); return; }
    if(act==='searchTrash') { openTrashSearch(); return; }
    ({tap:doTap,flip:doFlip,rotate:doRotate,trash:doTrash,toHand:doToHand,
      toTop:doToTop,toBottom:doToBottom,toLife:doToLife,clone:doClone} as any)[act]?.(cid);
  }
  function deckCtxAct(act:string) {
    hideCtx();
    if(act==='shuffle') shuffleDeck();
    if(act==='draw') drawCard();
    if(act==='drawBottom') drawFromBottom();
    if(act==='searchDeck1') startSearchDeck(1);
    if(act==='searchDeck') startSearchDeck(deckSearchPickCount || 1);
  }
  // เปิดป๊อปอัพลากปรับจำนวนสำหรับ Search/Scry — จำกัดสูงสุดตามจำนวนการ์ดในกองตอนนั้น
  function openCtxScrub(type:'search'|'scry') {
    hideCtx();
    ctxScrubType = type;
    ctxScrubMax = Math.max(1, myDeck.length);
    // กันค่าที่ค้างไว้เกินจำนวนการ์ดที่มีจริงตอนนี้
    if(type==='search' && searchCtxN > ctxScrubMax) searchCtxN = ctxScrubMax;
    if(type==='scry' && scryCtxN > ctxScrubMax) scryCtxN = ctxScrubMax;
    ctxScrubVisible = true;
  }
  function ctxScrubDown(e:PointerEvent) {
    ctxScrubDragging = true;
    ctxScrubStartX = e.clientX;
    ctxScrubStartVal = ctxScrubType==='search' ? searchCtxN : scryCtxN;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function ctxScrubMove(e:PointerEvent) {
    if(!ctxScrubDragging) return;
    const delta = e.clientX - ctxScrubStartX;
    const steps = Math.round(delta / 14); // ลาก ~14px ต่อ 1 หน่วย (ขวา=เพิ่ม, ซ้าย=ลด) — เริ่มที่ 1 เสมอ ปรับได้แค่เลขจำนวน (ปลายช่วง)
    const next = Math.max(1, Math.min(ctxScrubMax, ctxScrubStartVal + steps));
    if(ctxScrubType==='search') searchCtxN = next; else scryCtxN = next;
  }
  function ctxScrubUp() {
    ctxScrubDragging = false;
  }
  function ctxScrubStep(delta:number) {
    if(ctxScrubType==='search') searchCtxN = Math.max(1, Math.min(ctxScrubMax, searchCtxN + delta));
    else scryCtxN = Math.max(1, Math.min(ctxScrubMax, scryCtxN + delta));
  }
  function ctxScrubConfirm() {
    ctxScrubVisible = false;
    if(ctxScrubType==='search') startSearch(searchCtxN); else startScry(scryCtxN);
  }

  // ════════════════════════════════════════════════
  //   DON!!
  // ════════════════════════════════════════════════
  function addMyDon() {
    if(myDonSpent>=myDon) return;
    myDonSpent++; send('don_change',{total:myDon,spent:myDonSpent});
    spawnDonCard();
    addLog(`หยิบ DON!! (เหลือ ${myDon-myDonSpent}/${myDon})`,'you');
  }
  function spawnDonCard() {
    const costZone=BOARD_ZONES.find(z=>z.id==='you-cost'); if(!costZone) return;
    // นับ DON!! ของเราที่อยู่ใน COST AREA แล้ว เพื่อหาช่องกริดถัดไปที่ว่าง
    const inCost=Object.values(cards).filter(c=>c.isDon&&c.owner==='mine'&&!c.inHand&&c.zoneId==='you-cost');
    const b=getBoardRect(); const s=b.scale;
    const cols=5;
    const idx=inCost.length;
    const col=idx%cols, row=Math.floor(idx/cols);
    const slotW=costZone.w/cols, slotH=costZone.h;
    const cx=costZone.x+(col+0.5)*slotW, cy=costZone.y+slotH/2+row*slotH;
    const px=Math.round(b.left+cx*s-CARD_W/2), py=Math.round(b.top+cy*s-CARD_H/2);
    const prefix=isHost?'h':'g';
    const cid=prefix+'don'+nextCid++;

    cards[cid]={cid,owner:'mine',isDon:true,tapped:false,rotation:0,inHand:false,zoneId:'you-cost',
      x:px,y:py,data:{name:'DON!!',id:'don',art:'#3a2a00',type:'',cost:0,power:0,rarity:'',color:'',effect:''}};
    send('don_card_spawn',{cid,cardId:'don',x:px,y:py,zoneId:'you-cost'});
  }

  // ════════════════════════════════════════════════
  //   LIFE
  // ════════════════════════════════════════════════
  function takeDamage() {
    if (myLife <= 0) return;

    // หาการ์ดใน life zone (top card = index myLife-1 ของ myLifeCards)
    const lifeCids = Object.values(cards).filter(c =>
      c.owner === 'mine' && c.zoneId === 'you-life' && !c.inHand
    );

    if (lifeCids.length > 0) {
      // หยิบ top life card (ใบล่าสุดที่ spawn = index สูงสุด)
      const topCard = lifeCids[lifeCids.length - 1];
      // เปิดหน้าการ์ด + ย้ายเข้ามือ
      topCard.faceDown = false;
      topCard.inHand = true;
      topCard.zoneId = undefined;
      topCard.rotation = 0;
      myHand.push(topCard.cid);
      myHandCount = myHand.length;
      updateHandCount();
      send('card_move', {cid: topCard.cid, x: topCard.x, y: topCard.y, faceDown: false, inHand: true});
      addLog(`เปิด life: ${topCard.data.name}`, 'you');
    }

    myLife--;
    send('life_change', {val: myLife});
    addLog(`ชีวิตเหลือ ${myLife}`, 'you');
  }

  // ── Peek Life (แอบดูการ์ดชีวิต): ดึงรายชื่อการ์ดที่ยังคว่ำอยู่ใน life zone ของเรา ──
  // เป็นการอ่านค่า local อย่างเดียว ไม่มีการ send() ไปฝั่งคู่ต่อสู้ และไม่แก้ faceDown จริงบนบอร์ด
  // จึงเห็นแค่เราคนเดียว คู่ต่อสู้ยังเห็นการ์ดคว่ำอยู่เหมือนเดิมทุกประการ
  const peekLifeCards = $derived(
    Object.values(cards)
      .filter(c => c.owner === 'mine' && c.zoneId === 'you-life' && !c.inHand)
      .slice()
      .reverse() // ใบบนสุด (โดนเปิดก่อนตอนรับดาเมจ) ให้โผล่เป็นอันดับแรก
  );
  function togglePeekLife() {
    peekLifeVisible = !peekLifeVisible;
    if (peekLifeVisible) addLog('แอบดูการ์ด Life','you');
  }

  // ════════════════════════════════════════════════
  //   PHASE
  // ════════════════════════════════════════════════
  function nextPhase() {
    phase=(phase+1)%PHASES.length;
    if(phase===0) {
      turn++;
      Object.values(cards).forEach(c=>{ if(c.owner==='mine'&&c.tapped){ c.tapped=false; send('card_tap',{cid:c.cid,tapped:false}); } });
      addLog(`เริ่มเทิร์น ${turn}`,'system');
    }
    if(phase===1) drawCard();
    send('phase',{phase,turn}); addLog(`Phase: ${PHASES[phase]}`,'system');
  }

  // Active Phase (คืนสภาพ): สลับการ์ด DON!! ของเราที่ Rest (นอน) ทั้งหมด กลับมาเป็น Active (ตั้ง)
  function activePhase() {
    let count=0;
    Object.values(cards).forEach(c=>{
      if(c.owner==='mine'&&c.isDon&&c.tapped) {
        c.tapped=false;
        send('card_tap',{cid:c.cid,tapped:false});
        count++;
      }
    });
    addLog(count>0?`Active Phase: คืนสภาพการ์ด DON!! ${count} ใบ`:'Active Phase: ไม่มีการ์ด DON!! ที่ Rest อยู่','you');
  }

  // ════════════════════════════════════════════════
  //   REMOTE HANDLERS
  // ════════════════════════════════════════════════
  function remoteMirror(x:number, y:number) {
    const pf=playfieldEl; if(!pf) return {x:0,y:0};
    return {x:pf.offsetWidth-x-CARD_W, y:pf.offsetHeight-y-CARD_H};
  }

  function handleRemoteCardSpawn(d:any) {
    const data=CARD_MAP[d.cardId]; if(!data) return;
    if(cards[d.cid]) {
      // If we already have this card and it's ours, ignore spawn from server
      if(cards[d.cid].owner==='mine') return;
    }
    const cid = createCardState(data, d.faceDown, 'opp', d.cid);
    const {x,y}=remoteM(d.x,d.y);
    cards[cid].x = x; cards[cid].y = y;
    if(d.rotation != null) cards[cid].rotation = d.rotation;
    if(d.zoneId) cards[cid].zoneId = d.zoneId === 'you-life' ? 'opp-life' : d.zoneId;
    requestAnimationFrame(()=>{ if(cards[cid]) cards[cid].dropAnim = true; });
    addLog(`${oppName}: วาง${d.faceDown?'(คว่ำ)':data.name}`,'opp');
  }
  function remoteM(x:number,y:number){
    const w = playfieldEl?.offsetWidth || BOARD_SIZE;
    const h = playfieldEl?.offsetHeight || BOARD_SIZE;
    return {x:w-x-CARD_W, y:h-y-CARD_H};
  }
  function handleRemoteCardMove(d:any) {
    const c=cards[d.cid]; if(!c || c.owner==='mine') return;
    const {x,y}=remoteM(d.x,d.y); c.x=x; c.y=y;
    // card_move ส่งมาเฉพาะตอนคู่ต่อสู้ "ปล่อย" การ์ดสำเร็จเท่านั้น (ไม่ใช่ระหว่างลาก) → เล่น flip+glow ได้
    c.dropAnim = false;
    requestAnimationFrame(()=>{ if(cards[d.cid]) cards[d.cid].dropAnim = true; });
  }
  function handleRemoteCardRemove(d:any) {
    const c=cards[d.cid];
    if(c && c.owner==='opp') delete cards[d.cid];
  }
  function handleRemoteCardTap(d:any) {
    const c=cards[d.cid]; if(!c || c.owner==='mine') return;
    c.tapped=d.tapped;
    flashRemote(d.cid); addLog(`${oppName}: ${d.tapped?'แตะ':'ตั้ง'}การ์ด`,'opp');
  }
  function handleRemoteCardFlip(d:any) {
    const c=cards[d.cid]; if(!c || c.owner==='mine') return;
    c.faceDown=d.faceDown;
    flashRemote(d.cid);
  }
  function handleRemoteCardRotate(d:any) {
    const c=cards[d.cid]; if(!c || c.owner==='mine') return;
    c.rotation=d.rotation;
  }
  function handleRemoteDonSpawn(d:any) {
    if(cards[d.cid]) return;
    const {x,y}=remoteM(d.x,d.y);
    const zoneId = d.zoneId === 'you-cost' ? 'opp-cost' : d.zoneId;
    cards[d.cid]={cid:d.cid,owner:'opp',isDon:true,tapped:false,rotation:0,inHand:false, x, y, zoneId,
      data:{name:'DON!!',id:'don',art:'#3a2a00',type:'',cost:0,power:0,rarity:'',color:'',effect:''}};
  }
  function handleRemoteDonMove(d:any) {
    const c=cards[d.cid]; if(!c) return;
    const {x,y}=remoteM(d.x,d.y); c.x=x; c.y=y;
  }
  function handleRemoteDonTap(d:any) {
    const c=cards[d.cid]; if(!c) return; c.tapped=d.tapped;
  }
  function handleRemoteDonRotate(d:any) {
    const c=cards[d.cid]; if(!c) return; c.rotation=d.rotation;
  }
  function handleRemoteDonRemove(d:any) {
    if(cards[d.cid]) delete cards[d.cid];
  }

  // ════════════════════════════════════════════════
  //   MULTI-SELECT (เลือกการ์ดหลายใบ)
  // ════════════════════════════════════════════════

  /** หมุนการ์ดที่เลือกทั้งหมด 90° */
  function rotateSelectedCards() {
    if (selectedCids.size === 0) return;
    selectedCids.forEach(cid => {
      doRotate(cid);
    });
    addLog(`หมุนการ์ด ${selectedCids.size} ใบ`, 'you');
  }

  /** พลิกการ์ดที่เลือกทั้งหมด */
  function flipSelectedCards() {
    if (selectedCids.size === 0) return;
    selectedCids.forEach(cid => { doFlip(cid); });
    addLog(`พลิกการ์ด ${selectedCids.size} ใบ`, 'you');
  }

  /** แตะ/ตั้งการ์ดที่เลือกทั้งหมด */
  function tapSelectedCards() {
    if (selectedCids.size === 0) return;
    selectedCids.forEach(cid => { doTap(cid); });
    addLog(`แตะ/ตั้งการ์ด ${selectedCids.size} ใบ`, 'you');
  }

  /** ทำสำเนาการ์ดที่เลือกทั้งหมด */
  function cloneSelectedCards() {
    if (selectedCids.size === 0) return;
    selectedCids.forEach(cid => { doClone(cid); });
    addLog(`ทำสำเนาการ์ด ${selectedCids.size} ใบ`, 'you');
  }

  /** ส่งการ์ดที่เลือกทั้งหมดไปมือ */
  function toHandSelectedCards() {
    if (selectedCids.size === 0) return;
    const n = selectedCids.size;
    selectedCids.forEach(cid => { doToHand(cid); });
    clearSelection();
    addLog(`ส่งการ์ด ${n} ใบไปมือ`, 'you');
  }

  /** ทิ้งการ์ดที่เลือกทั้งหมดลงสุสาน */
  function trashSelectedCards() {
    if (selectedCids.size === 0) return;
    const n = selectedCids.size;
    selectedCids.forEach(cid => { doTrash(cid); });
    clearSelection();
    addLog(`ทิ้งการ์ด ${n} ใบลงสุสาน`, 'you');
  }

  /** เริ่มลาก selection box ด้วยคลิกขวา */
  function startSelBox(e: MouseEvent) {
    if (!playfieldEl) return;
    const pf = screenToPlayfield(e.clientX, e.clientY);
    selBoxActive = true;
    selBoxStartX = pf.x;
    selBoxStartY = pf.y;
    selBox = { x1: pf.x, y1: pf.y, x2: pf.x, y2: pf.y };
  }

  /** อัปเดต selection box ขณะลาก */
  function updateSelBox(e: MouseEvent) {
    if (!selBoxActive || !playfieldEl) return;
    const pf = screenToPlayfield(e.clientX, e.clientY);
    selBox = { x1: selBoxStartX, y1: selBoxStartY, x2: pf.x, y2: pf.y };
  }

  /** จบลาก selection box → เลือกการ์ดที่อยู่ในกรอบ */
  function endSelBox() {
    if (!selBoxActive || !selBox) {
      selBoxActive = false;
      selBox = null;
      return;
    }
    selBoxActive = false;
    const box = selBox;
    selBox = null;

    // คำนวณกรอบสี่เหลี่ยม (normalize: x1<x2, y1<y2)
    const left   = Math.min(box.x1, box.x2);
    const right  = Math.max(box.x1, box.x2);
    const top    = Math.min(box.y1, box.y2);
    const bottom = Math.max(box.y1, box.y2);

    // ถ้าลากเล็กเกินไป (คลิกขวาธรรมดา) ไม่เลือก
    if (right - left < 5 && bottom - top < 5) return;

    // หาการ์ดของเราที่อยู่ในกรอบ
    const newSelected = new Set<string>();
    Object.values(cards).forEach(c => {
      if (c.inHand || c.owner !== 'mine') return;
      const cx = (c.x || 0) + CARD_W / 2;
      const cy = (c.y || 0) + CARD_H / 2;
      if (cx >= left && cx <= right && cy >= top && cy <= bottom) {
        newSelected.add(c.cid);
      }
    });
    selectedCids = newSelected;
    if (newSelected.size > 0) {
      addLog(`เลือกการ์ด ${newSelected.size} ใบ`, 'system');
    }
  }

  /** ยกเลิกการเลือกทั้งหมด */
  function clearSelection() {
    if (selectedCids.size > 0) {
      selectedCids = new Set();
    }
  }

  // ══ Return All DON!! ══
  // ดึง DON ทั้งหมดของเราที่กระจายอยู่บนบอร์ดกลับมารวมที่ COST Area ในสภาพ Rest (แนวนอน)
  function returnAllDon() {
    const costZone = BOARD_ZONES.find(z => z.id === 'you-cost');
    if (!costZone) return;

    // หา DON cards ทั้งหมดของเราที่อยู่บนบอร์ด (ไม่อยู่ในมือ)
    const myDons = Object.values(cards).filter(
      c => c.isDon && c.owner === 'mine' && !c.inHand
    );
    if (!myDons.length) { addLog('ไม่มี DON!! บนบอร์ด', 'system'); return; }

    const b = getBoardRect();
    const totalDons = myDons.length;
    // จัดแถว: สูงสุด 5 ใบต่อแถว → 2 แถวถ้าเกิน 5
    const cols = Math.min(5, totalDons);
    const rows = Math.ceil(totalDons / 5);
    const slotW = costZone.w / cols;
    const slotH = costZone.h / rows;

    myDons.forEach((don, i) => {
      const col = i % 5;
      const row = Math.floor(i / 5);

      // พิกัด center ของ slot ใน board coords
      const boardCX = costZone.x + (col + 0.5) * slotW;
      const boardCY = costZone.y + (row + 0.5) * slotH;

      // แปลงเป็น pixel ภายใน playfield
      const px = Math.round(b.left + boardCX * b.scale - CARD_W / 2);
      const py = Math.round(b.top  + boardCY * b.scale - CARD_H / 2);

      don.x = px;
      don.y = py;
      don.tapped = true;      // Rest = แนวนอน
      don.zoneId = 'you-cost';

      send('don_card_move', { cid: don.cid, x: px, y: py });
      send('don_card_tap',  { cid: don.cid, tapped: true });
    });

    send('log', { msg: `คืน DON!! ${myDons.length} ใบกลับ COST Area (Rest)` });
    addLog(`คืน DON!! ${myDons.length} ใบกลับ COST Area ✓`, 'you');
  }

  function handleRemoteCardDragStart(d:any) {
    if(!d?.cid) return;
    const data = d.cardId ? CARD_MAP[d.cardId] : undefined;
    const ghost: RemoteDragGhost = {
      cid: String(d.cid),
      cardId: String(d.cardId ?? ''),
      imageUrl: d.imageUrl || data?.imageUrl,
      art: d.art || data?.art,
      x: Number(d.x ?? 0),
      y: Number(d.y ?? 0),
      faceDown: !!d.faceDown
    };
    remoteDragGhosts = { ...remoteDragGhosts, [ghost.cid]: ghost };
  }

  function handleRemoteCardDragMove(d:any) {
    const cid = String(d?.cid ?? '');
    const ghost = remoteDragGhosts[cid];
    if(!ghost) return;
    remoteDragGhosts = {
      ...remoteDragGhosts,
      [cid]: {
        ...ghost,
        x: Number(d.x ?? ghost.x),
        y: Number(d.y ?? ghost.y)
      }
    };
  }

  function handleRemoteCardDragEnd(d:any) {
    const cid = String(d?.cid ?? '');
    if(!cid || !remoteDragGhosts[cid]) return;
    const next = { ...remoteDragGhosts };
    delete next[cid];
    remoteDragGhosts = next;
  }

  function remoteGhostBoxStyle(ghost: RemoteDragGhost) {
    if(!playfieldEl) return 'display:none';
    const pfr = playfieldEl.getBoundingClientRect();
    const mirroredX = (playfieldEl.offsetWidth || BOARD_SIZE) - ghost.x - CARD_W;
    const mirroredY = (playfieldEl.offsetHeight || BOARD_SIZE) - ghost.y - CARD_H;
    const left = pfr.left + mirroredX * boardScale;
    const top = pfr.top + mirroredY * boardScale;
    return `left:${left}px;top:${top}px;width:${CARD_W * boardScale}px;height:${CARD_H * boardScale}px`;
  }

  function remoteGhostFaceStyle(ghost: RemoteDragGhost) {
    const art = ghost.art || '#34495e';
    if(ghost.imageUrl) {
      return `background-color:${art};background-image:url("${String(ghost.imageUrl).replace(/"/g,'%22')}")`;
    }
    return `background:${art}`;
  }

  let remoteCursorEl = $state<HTMLElement>();
  function handleRemoteCursor(d:any) {
    if(!remoteCursorEl||!playfieldEl) return;
    const pfr=playfieldEl.getBoundingClientRect();
    const mirroredX = (playfieldEl.offsetWidth||0) - d.x;
    const mirroredY = (playfieldEl.offsetHeight||0) - d.y;
    remoteCursorEl.style.display='block';
    remoteCursorEl.style.left=(pfr.left + mirroredX*boardScale - 6)+'px';
    remoteCursorEl.style.top=(pfr.top + mirroredY*boardScale - 6)+'px';
  }
  function flashRemote(cid:string) {
    const c=cards[cid]; if(!c) return;
    c.el.classList.add('remote-highlight');
    setTimeout(()=>c.el.classList.remove('remote-highlight'),800);
  }

  // ════════════════════════════════════════════════
  //   TOOLTIP
  // ════════════════════════════════════════════════
  function showTooltipAt(data:CardData, anchor:HTMLElement) {
    tooltipData=data; tooltipVisible=true;
    const r=anchor.getBoundingClientRect();
    tooltipX=Math.min(r.right+8,window.innerWidth-200);
    tooltipY=Math.min(r.top,window.innerHeight-270);
  }

  // ════════════════════════════════════════════════
  //   LOG
  // ════════════════════════════════════════════════
  function addLog(msg:string, side:string='system') {
    const now=new Date();
    const time=`${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
    logEntries=[{msg,side,time},...logEntries.slice(0,59)];
  }

  // ════════════════════════════════════════════════
  //   DECK PANEL
  // ════════════════════════════════════════════════
  function buildDeckPanel() {
    if(!deckGridEl) return;
    deckGridEl.innerHTML='';
    CARD_DB.forEach(d=>{
      const item=document.createElement('div'); item.className='deck-card-item';
      item.style.cssText=cardBg(d);
      item.innerHTML=`<div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent 30%,rgba(0,0,0,.85))"></div>
        <div style="position:absolute;bottom:3px;left:3px;right:3px;font-size:7.5px;color:#fff;font-weight:700;line-height:1.2">${esc(d.name)}</div>`;
      item.onclick=()=>{
       const pos=getDefaultCardPos(d); spawnCard(d,pos.x,pos.y,false);
       addLog(`วาง: ${d.name}`,'you'); send('log',{msg:`วาง: ${d.name}`});
      };
      item.addEventListener('mouseleave',()=>{ tooltipVisible=false; });
      deckGridEl.appendChild(item);
      });

  }

  // ════════════════════════════════════════════════
  //   DECK BUILDER
  // ════════════════════════════════════════════════
  function dbTotal() { return Object.values(dbCards).reduce((s,n)=>s+n,0); }
  async function openDB() { await loadCardDB(); dbOpen=true; }
  async function openNewDeck() {
    await loadCardDB();
    // reset builder state เพื่อสร้างเด็คใหม่
    activeDeckId = null;
    dbCards = {};
    dbLeader = null;
    dbDonCount = 10;
    dbOpen = true;
  }
  function clearDB() { if(!confirm('ล้างเด็ค?')) return; dbCards={}; dbLeader=null; dbDonCount=10; }
  function clearDBLeader() { dbLeader=null; }
  // รวมจำนวนการ์ดที่ใส่ไปแล้วทุก parallel art ของ card_id เดียวกัน
  function cardIdQuotaUsed(cardId: string, excludeUid?: string): number {
    return Object.entries(dbCards).reduce((sum, [uid, cnt]) => {
      if (uid === excludeUid) return sum;
      const d = CARD_MAP[uid];
      return d?.cardId === cardId ? sum + cnt : sum;
    }, 0);
  }
  function dbAddCard(d:CardData) {
    // L = Leader ห้ามใส่ในเด็คหลัก
    if(d.rarity==='L') return;
    // โควตาต่อ card_id: สูงสุด 4 ใบ (นับรวมทุก parallel art)
    const quota = cardIdQuotaUsed(d.cardId);
    if(quota >= 4 || dbTotal() >= 50) return;
    dbCards={...dbCards,[d.id]:(dbCards[d.id]||0)+1};
  }
  function dbRemCard(d:CardData) {
    if(!(dbCards[d.id]>0)) return;
    const n=dbCards[d.id]-1; const nc={...dbCards};
    if(n<=0) delete nc[d.id]; else nc[d.id]=n; dbCards=nc;
  }
  async function saveDB() {
    if(dbTotal()!==50){ showDeckMsg(`กองหลักต้องครบ 50 ใบ (ปัจจุบัน ${dbTotal()} ใบ)`, 'err'); return; }
    if(!dbLeader){ showDeckMsg('ยังไม่ได้เลือก Leader', 'err'); return; }
    if(dbDonCount<1||dbDonCount>20){ showDeckMsg('DON!! ต้องใส่ระหว่าง 1–20 ใบ', 'err'); return; }
    // ตรวจสีการ์ด
    const leaderCols = new Set(String(dbLeader.color||'').split('/').map((s:string)=>s.trim()).filter(Boolean));
    const colorErrs: string[] = [];
    Object.entries(dbCards).forEach(([id])=>{
      const d=CARD_MAP[id]; if(!d) return;
      const cols = String(d.color||'').split('/').map((s:string)=>s.trim()).filter(Boolean);
      if(cols.length===0) return;
      const ok = cols.some((c:string)=>leaderCols.has(c)||c==='Multicolor'||c==='');
      if(!ok) colorErrs.push(`"${d.name}" (${d.color})`);
    });
    if(colorErrs.length){ showDeckMsg(`สีการ์ดไม่ตรง Leader`, 'err'); return; }
    // ตรวจการ์ดซ้ำ — นับโดยใช้ card_id (รวม parallel art ทุกใบ)
    const quotaMap: Record<string, {count:number; name:string}> = {};
    Object.entries(dbCards).forEach(([uid, cnt]) => {
      const d = CARD_MAP[uid]; if(!d) return;
      const key = d.cardId || d.id;
      if(!quotaMap[key]) quotaMap[key] = {count:0, name:d.name};
      quotaMap[key].count += cnt;
    });
    const duplErrs: string[] = [];
    Object.entries(quotaMap).forEach(([cardId, {count, name}]) => {
      if(count > 4) duplErrs.push(`${name} (${cardId}) ${count} ใบ (สูงสุด 4)`);
    });
    if(duplErrs.length){ showDeckMsg(`การ์ดซ้ำเกินกฎ`, 'err'); return; }

    // ถ้ามี activeDeckId = update เด็คเดิม, ถ้าไม่มี = ขอชื่อใหม่
    let deckName = '';
    if (activeDeckId) {
      const existing = savedDecks.find(d => d._id === activeDeckId);
      deckName = existing?.name || 'เด็คของฉัน';
    } else {
      const input = prompt('ตั้งชื่อเด็ค (สูงสุด 5 เด็ค):', `เด็ค ${savedDecks.length + 1}`);
      if (!input) return;
      deckName = input.trim() || `เด็ค ${savedDecks.length + 1}`;
    }
    await saveDeckToServer(deckName);
  }
  const filteredPool = $derived(CARD_DB.filter(c => {
    const sq = dbSearchTerm;
    if(sq&&!c.name.toLowerCase().includes(sq)&&!(c.id||'').toLowerCase().includes(sq)) return false;
    if(dbFilterType&&c.type!==dbFilterType) return false;
    if(dbFilterColor&&!String(c.color||'').includes(dbFilterColor)) return false;
    return true;
  }));

  const totalPages = $derived(Math.ceil(filteredPool.length / dbPageSize));
  const pagedPool = $derived(filteredPool.slice((dbPage - 1) * dbPageSize, dbPage * dbPageSize));

  const sortedList = $derived(Object.entries(dbCards)
    .map(([id,cnt])=>({d:CARD_MAP[id],cnt}))
    .filter(e=>e.d)
    .sort((a,b)=>{
      const to:{[k:string]:number}={Leader:0,Character:1,Event:2,Stage:3};
      return (to[a.d.type]??9)-(to[b.d.type]??9)||(a.d.cost||0)-(b.d.cost||0);
    }));

  // ════════════════════════════════════════════════
  //   COPY ROOM ID
  // ════════════════════════════════════════════════
  function copyRoomId() {
    navigator.clipboard.writeText(roomIdDisplay).then(()=>setStatus('คัดลอกแล้ว!','ok'));
  }

  // ════════════════════════════════════════════════
  //   KEYBOARD
  // ════════════════════════════════════════════════
  function handleKey(e:KeyboardEvent) {
    if(!gameStarted) return;

    // อย่าไปแย่ง shortcut ตอนกำลังพิมพ์ในช่อง input/textarea
    const target = e.target as HTMLElement;
    if(target && (target.tagName==='INPUT' || target.tagName==='TEXTAREA')) return;

    // ── Global shortcuts (ไม่ต้อง hover การ์ด) ──
    const isUndoKey = (e.ctrlKey||e.metaKey) && !e.shiftKey && e.key.toLowerCase()==='z';
    if(isUndoKey) { performUndo(); e.preventDefault(); return; }

    if(e.key==='Escape') {
      if(selectedCids.size > 0) { clearSelection(); e.preventDefault(); return; }
      if(drawingLine) drawingLine=null;
      if(ctxVisible||deckCtxVisible) hideCtx();
      if(ctxScrubVisible) ctxScrubVisible=false;
      if(detailData) detailData=null;
      if(peekLifeVisible) peekLifeVisible=false;
      if(scryVisible) closeScry();
      if(deckSearchVisible) closeDeckSearch();
      if(trashSearchVisible) closeTrashSearch();
      e.preventDefault();
      return;
    }

    // ── Card-hover shortcuts ──
    const h=document.querySelector<HTMLElement>('#playfield .card.mine:hover, #hand-area .card.mine:hover');
    // Global shortcuts for multi-select (ไม่ต้อง hover การ์ด) — R/F/T/C/H/Del ทั้งหมด
    if(!h && selectedCids.size > 0) {
      switch(e.key.toLowerCase()) {
        case 'r': rotateSelectedCards(); e.preventDefault(); return;
        case 'f': flipSelectedCards(); e.preventDefault(); return;
        case 't': tapSelectedCards(); e.preventDefault(); return;
        case 'c': cloneSelectedCards(); e.preventDefault(); return;
        case 'h': toHandSelectedCards(); e.preventDefault(); return;
        case 'delete':
        case 'backspace': trashSelectedCards(); e.preventDefault(); return;
      }
    }
    if(!h) return;
    const cid=h.dataset.cid||'';
    switch(e.key.toLowerCase()) {
      case 'r':
        if(selectedCids.size > 0) { rotateSelectedCards(); }
        else { doRotate(cid); }
        e.preventDefault(); break;
      case 'f':
        if(selectedCids.size > 0) { flipSelectedCards(); }
        else { doFlip(cid); }
        e.preventDefault(); break;
      case 't':
        if(selectedCids.size > 0) { tapSelectedCards(); }
        else { doTap(cid); }
        e.preventDefault(); break;
      case 'c':
        if(selectedCids.size > 0) { cloneSelectedCards(); }
        else { doClone(cid); }
        e.preventDefault(); break;
      case 'h':
        if(selectedCids.size > 0) { toHandSelectedCards(); }
        else { doToHand(cid); }
        e.preventDefault(); break;
      case 'delete':
      case 'backspace':
        if(selectedCids.size > 0) { trashSelectedCards(); }
        else { doTrash(cid); }
        e.preventDefault(); break;
    }
  }

  // ════════════════════════════════════════════════
  //   LIFECYCLE
  // ════════════════════════════════════════════════
  onDestroy(() => {
    // ไม่ต้องทำอะไรพิเศษ — server ยุบห้องทันทีอยู่แล้วเมื่อ socket หลุด
    // ถ้าออกโดยตั้งใจ leaveRoom() จัดการไปแล้ว
    _unregisterPageBeforeUnload();
  });

  // ── Global mouse listeners for selection box ──
  // We need document-level listeners so dragging works even when cursor leaves playfield
  $effect(() => {
    if (!gameStarted) return;
    const onMove = (e: MouseEvent) => { updateSelBox(e); };
    const onUp = (e: MouseEvent) => { endSelBox(); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  });

  // cursor tracking
  let lastCursorSend = 0;
  let lastDragMoveSend = 0;
  function onPlayfieldMove(e: MouseEvent) {
    if(!playfieldEl) return;
    const now = Date.now();
    if(now - lastCursorSend < 50) return; // Throttle to 20fps
    lastCursorSend = now;
    const pf = screenToPlayfield(e.clientX, e.clientY);
    send('cursor',{x:pf.x,y:pf.y});
  }

  // zone render data for SVG overlay zones
  function getZoneStyle(zone: Zone) {
    const b = getBoardRect ? getBoardRect() : {scale:1,left:0,top:0};
    return `left:${Math.round(b.left+zone.x*b.scale)}px;top:${Math.round(b.top+zone.y*b.scale)}px;width:${Math.round(zone.w*b.scale)}px;height:${Math.round(zone.h*b.scale)}px`;
  }
</script>

<svelte:window on:keydown={handleKey} />

<!-- ════ DECK BUILDER (Lazy Loaded) ════ -->
{#if dbOpen}
  {#await import('$lib/components/DeckBuilder.svelte') then { default: DeckBuilder }}
    <DeckBuilder 
      bind:dbOpen={dbOpen}
      bind:dbSearch={dbSearch}
      bind:dbFilterType={dbFilterType}
      bind:dbFilterColor={dbFilterColor}
      bind:dbLeader={dbLeader}
      bind:dbCards={dbCards}
      bind:dbDonCount={dbDonCount}
      bind:dbPage={dbPage}
      CARD_DB={CARD_DB}
      dbLoaded={dbLoaded}
      CARD_MAP={CARD_MAP}
      bind:lobbyDeckSummary={lobbyDeckSummary}
      clearDB={clearDB}
      saveDB={saveDB}
      dbAddCard={dbAddCard}
      dbRemCard={dbRemCard}
      clearDBLeader={clearDBLeader}
      cardBg={cardBg}
      lazyLoad={lazyLoad}
      dbTotal={dbTotal}
      dbSearchTerm={dbSearchTerm}
      deckSaving={deckSaving}
      deckSaveMsg={deckSaveMsg}
      deckSaveMsgType={deckSaveMsgType}
      activeDeckId={activeDeckId}
    />
  {/await}
{/if}

<!-- ════ LOBBY ════ -->
{#if !gameStarted && authChecked}
  <Lobby 
    bind:gameStarted={gameStarted}
    bind:myName={myName}
    lobbyDeckSummary={lobbyDeckSummary}
    bind:lobbyView={lobbyView}
    countdown={countdown}
    lobbyStatus={lobbyStatus}
    lobbyStatusCls={lobbyStatusCls}
    openDB={openDB}
    openNewDeck={openNewDeck}
    joinMatchmaking={joinMatchmaking}
    oppName={oppName}
    fading={lobbyFading}
    dbLeader={dbLeader}
    cardBg={cardBg}
    savedDecks={savedDecks}
    selectedDeckId={selectedDeckId}
    bind:deckPickerOpen={deckPickerOpen}
    selectDeckToPlay={selectDeckToPlay}
    loadDeckIntoBuilder={loadDeckIntoBuilder}
    deleteSavedDeck={deleteSavedDeck}
    CARD_MAP={CARD_MAP}
    CARD_DB={CARD_DB}
  />
{/if}

<!-- ════ MAIN GAME ════ -->
{#if gameStarted}
<div id="app">
  <!-- TOPBAR -->
  <Topbar 
    confirmNewGame={confirmNewGame}
    leaveRoom={leaveRoom}
    isHost={isHost}
    bind:boardScale={boardScale}
    onRollDice={triggerRoll}
    diceRolling={diceRolling}
    onUndo={performUndo}
    mulliganAvailable={mulliganAvailable}
    onMulligan={doMulligan}
    onActivePhase={activePhase}
    onPeekLife={togglePeekLife}
    onSearchTrash={openTrashSearch}
    onReturnAllDon={returnAllDon}
  />

  <div id="board-wrap">

    <!-- OPP HAND (overlay, top-left, below topbar) -->
    <div id="opp-hand-bar">
      <div class="opp-hand-label">OPP HAND</div>
      <div id="opp-hand-cards">
        {#each Array.from({length:oppHandCount}) as _}
          <div class="opp-hand-card"></div>
        {/each}
      </div>
    </div>

    <!-- DiceWidget hidden — overlay only -->
    <div style="display:none">
      <DiceWidget
        bind:this={diceWidget}
        numDice={2}
        sides={6}
        onRollDone={handleDiceRollDone}
      />
    </div>

    <!-- PLAYFIELD -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div id="playfield" 
      bind:this={playfieldEl} 
      onmousemove={onPlayfieldMove} 
      onwheel={handleWheel}
      onclick={(e)=>{ if(e.target === playfieldEl) clearSelection(); }}
      oncontextmenu={(e)=>{ e.preventDefault(); }}
      onmousedown={(e: MouseEvent)=>{ if(e.button === 2 && e.target === playfieldEl) startSelBox(e); }}
      style="transform: scale({boardScale}); transform-origin: center center;"
    >

      {#each Object.values(cards) as card (card.cid)}
        {#if !card.inHand}
          <Card 
            card={card}
            owner={card.owner}
            isDon={card.isDon}
            cardAction={cardAction}
            cardBg={cardBg}
            cssT={cssT}
            onContextMenu={(e: MouseEvent)=> { e.preventDefault(); e.stopPropagation(); showCtxMenu(e,card.cid); }}
            onDoubleClick={()=>doFlip(card.cid)}
            onClick={(e: MouseEvent)=>{ 
              if(!card.faceDown&&e.detail===1) {
                setTimeout(()=>{ 
                  const el = document.querySelector(`[data-cid="${card.cid}"]`);
                  if(el && !el.classList.contains('dragging')) detailData=card.data; 
                },120);
              }
            }}
            isSelected={selectedCids.has(card.cid)}
          />
        {/if}
      {/each}

      <!-- SELECTION BOX (กรอบเลือกการ์ด) -->
      {#if selBox}
        {@const left = Math.min(selBox.x1, selBox.x2)}
        {@const top = Math.min(selBox.y1, selBox.y2)}
        {@const w = Math.abs(selBox.x2 - selBox.x1)}
        {@const h = Math.abs(selBox.y2 - selBox.y1)}
        <div class="selection-box" style="left:{left}px;top:{top}px;width:{w}px;height:{h}px"></div>
      {/if}

      <!-- ZONES overlay -->
      {#each BOARD_ZONES as zone (zone.id)}
        <ZoneComp zone={zone} getZoneStyle={getZoneStyle} />
      {/each}

      <!-- Life zones — rendered as HTML overlays -->
      <!-- alive slots แสดงการ์ดจริง (spawn จาก deck) ส่วน spent slots แสดงเป็น ghost placeholder -->
      <div class="life-zone-container" id="life-zone-you" style={getZoneStyle(BOARD_ZONES.find(z=>z.id==='you-life')!)}>
        {#each Array.from({length: Math.max(myLife, 5)},(_,i)=>i) as i}
          {@const alive = i < myLife}
          {#if !alive}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="life-zone-card spent"
              style="top:{-14 + i * 12}px; left: 8.5px; z-index:{10 - i};">
            </div>
          {/if}
        {/each}
      </div>

      <div class="life-zone-container" id="life-zone-opp" style={getZoneStyle(BOARD_ZONES.find(z=>z.id==='opp-life')!)}>
        {#each Array.from({length: Math.max(oppLife, 5)},(_,i)=>i) as i}
          {@const alive = i < oppLife}
          {#if !alive}
            <div class="life-zone-card spent" style="top:{-14 + i * 12}px; left: 8.5px; z-index:{10 - i};">
            </div>
          {/if}
        {/each}
      </div>

      <!-- DON pile YOU -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="don-pile-wrapper" id="don-pile-you" onclick={addMyDon} title="คลิกหยิบ DON!!" style={getZoneStyle(BOARD_ZONES.find(z=>z.id==='you-don-deck')!)}>
        {#each Array.from({length:Math.min(5,Math.max(0,myDon-myDonSpent))},(_,i)=>i) as i}
          {@const layers=Math.min(5,myDon-myDonSpent)}
          <div class="don-pile-layer {i===layers-1?'top-layer':''}" style="transform:translate({(layers-1-i)*2}px,{-(layers-1-i)*2}px)"></div>
        {/each}
        <div class="don-count-badge" id="don-count-you">{myDon-myDonSpent}/10</div>
      </div>

      <!-- DON pile OPP -->
      <div class="don-pile-wrapper" id="don-pile-opp" style="cursor:default;pointer-events:none;{getZoneStyle(BOARD_ZONES.find(z=>z.id==='opp-don-deck')!)}">
        {#each Array.from({length:Math.min(5,Math.max(0,oppDon-oppDonSpent))},(_,i)=>i) as i}
          {@const layers=Math.min(5,oppDon-oppDonSpent)}
          <div class="don-pile-layer {i===layers-1?'top-layer':''}" style="transform:translate({(layers-1-i)*2}px,{-(layers-1-i)*2}px)"></div>
        {/each}
      </div>

      <!-- DECK PILE YOU -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div id="deck-pile-you" class:shuffling={myDeckShuffling} onclick={drawCard} oncontextmenu={e=>{ e.preventDefault(); e.stopPropagation(); showDeckCtxMenu(e); }} title="คลิกเพื่อจั่ว (คลิกขวาเพื่อเมนู)" style="opacity:{myDeckCount>0?1:0.4};cursor:{myDeckCount>0?'pointer':'not-allowed'};{getZoneStyle(BOARD_ZONES.find(z=>z.id==='you-deck')!)}">
        {#each Array.from({length:Math.min(5,myDeckCount)},(_,i)=>i) as i}
          {@const layers=Math.min(5,myDeckCount)}
          {@const isLeft = i < Math.ceil(layers/2)}
          <div class="deck-card-visual {isLeft?'shuf-left':'shuf-right'}" style="--sx:{(layers-1-i)*1.5}px;--sy:{-(layers-1-i)*1.5}px;transform:translate(var(--sx),var(--sy));animation-delay:{i*70}ms"></div>
        {/each}
        <div class="deck-count-badge" id="deck-pile-count">{myDeckCount>0?myDeckCount+' ใบ':'หมด'}</div>
      </div>

      <!-- DECK PILE OPP -->
      <div id="deck-pile-opp" class:shuffling={oppDeckShuffling} style="pointer-events:none;opacity:{oppDeckCount>0?1:0.4};{getZoneStyle(BOARD_ZONES.find(z=>z.id==='opp-deck')!)}">
        {#each Array.from({length:Math.min(5,oppDeckCount)},(_,i)=>i) as i}
          {@const layers=Math.min(5,oppDeckCount)}
          {@const isLeft = i < Math.ceil(layers/2)}
          <div class="deck-card-visual {isLeft?'shuf-left':'shuf-right'}" style="--sx:{(layers-1-i)*1.5}px;--sy:{-(layers-1-i)*1.5}px;transform:translate(var(--sx),var(--sy));animation-delay:{i*70}ms"></div>
        {/each}
      </div>

      <!-- ATTACK LINES overlay (เส้นโจมตีชั่วคราว) -->
      <svg class="attack-line-layer">
        <defs>
          <marker id="arrow-mine" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L6,3 L0,6 Z" fill="var(--blue2)" />
          </marker>
          <marker id="arrow-opp" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L6,3 L0,6 Z" fill="var(--red)" />
          </marker>
        </defs>
        {#each attackLines as line (line.id)}
          <line
            x1={line.fromX} y1={line.fromY} x2={line.toX} y2={line.toY}
            class="attack-line {line.owner==='mine'?'mine':'opp'}"
            marker-end="url(#{line.owner==='mine'?'arrow-mine':'arrow-opp'})"
          />
        {/each}
        {#if drawingLine}
          <line
            x1={drawingLine.x1} y1={drawingLine.y1} x2={drawingLine.x2} y2={drawingLine.y2}
            class="attack-line drawing" marker-end="url(#arrow-mine)"
          />
        {/if}
      </svg>

      <!-- Player labels -->
      <div class="player-label opp"><div class="player-name-badge">{oppName}</div> ❤️ {oppLife}</div>
      <div class="player-label you"><div class="player-name-badge">{myName}</div> ❤️ {myLife}</div>
    </div>

    <!-- SIDEBAR -->
    <Sidebar 
      bind:activeTab={activeTab}
      logEntries={logEntries}
      CARD_DB={CARD_DB}
      CARD_MAP={CARD_MAP}
      dbCards={dbCards}
      dbLeader={dbLeader}
      cardBg={cardBg}
      lazyLoad={lazyLoad}
      getDefaultCardPos={getDefaultCardPos}
      spawnCard={spawnCard}
      addLog={addLog}
      send={send}
      SERVER_URL={SERVER_URL}
      oppName={oppName}
    />
  </div>

  <!-- MY HAND -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div id="hand-area">
    <div class="hand-label">HAND (มือของคุณ)</div>
    {#each Object.values(cards) as card (card.cid)}
      {#if card.inHand && card.owner === 'mine'}
         <Card 
            card={card}
            owner={card.owner}
            isDon={card.isDon}
            cardAction={cardAction}
            cardBg={cardBg}
            cssT={cssT}
            onContextMenu={(e: MouseEvent)=> { e.preventDefault(); e.stopPropagation(); showCtxMenu(e,card.cid); }}
            onDoubleClick={()=>doFlip(card.cid)}
            onClick={(e: MouseEvent)=>{
              // คลิกการ์ดในมือ → แสดง detail เสมอ ไม่ต้องเช็ค faceDown
              if(e.detail===1) detailData = card.data;
            }}
          />
      {/if}
    {/each}
    <div class="hand-count">{myHandCount}</div>
  </div>
</div>
{/if}

<!-- CTX MENU -->
{#if ctxVisible}
<div id="ctx-menu" style="display:block;left:{ctxX}px;top:{ctxY}px">
  {#if cards[ctxCid]?.isDon}
    <!-- ══ DON!! context menu ══ -->
    <div class="ctx-item ctx-don-label" style="pointer-events:none;opacity:0.6;font-weight:800;font-size:10px;letter-spacing:1px">DON!!</div>
    <div class="ctx-sep"></div>
    <div class="ctx-item" onclick={()=>ctxAct('tap')}>⟳ แตะ / ตั้ง<span class="key-badge"><span class="key-label">T</span></span></div>
    <div class="ctx-item danger" onclick={()=>ctxAct('trash')}>🗑 สุสาน<span class="key-badge"><span class="key-label wide">Del</span></span></div>
  {:else}
    <!-- ══ Normal card context menu ══ -->
    {#if selectedCids.size > 1}
      <div class="ctx-item" onclick={()=>ctxAct('tapAll')}>⟳ แตะ/ตั้งทั้งหมด ({selectedCids.size} ใบ)<span class="key-badge"><span class="key-label">T</span></span></div>
      <div class="ctx-item" onclick={()=>ctxAct('flipAll')}>◧ พลิกทั้งหมด ({selectedCids.size} ใบ)<span class="key-badge"><span class="key-label">F</span></span></div>
      <div class="ctx-item ctx-rotate-all" onclick={()=>ctxAct('rotateAll')}>↻ หมุนทั้งหมด ({selectedCids.size} ใบ)<span class="key-badge"><span class="key-label">R</span></span></div>
      <div class="ctx-item" onclick={()=>ctxAct('cloneAll')}>⊕ ทำสำเนาทั้งหมด ({selectedCids.size} ใบ)<span class="key-badge"><span class="key-label">C</span></span></div>
      <div class="ctx-item" onclick={()=>ctxAct('toHandAll')}>↩ ส่งทั้งหมดไปมือ ({selectedCids.size} ใบ)<span class="key-badge"><span class="key-label">H</span></span></div>
      <div class="ctx-item danger" onclick={()=>ctxAct('trashAll')}>🗑 ทิ้งทั้งหมดลงสุสาน ({selectedCids.size} ใบ)<span class="key-badge"><span class="key-label wide">Del</span></span></div>
      <div class="ctx-sep"></div>
    {/if}
    <div class="ctx-item" onclick={()=>ctxAct('tap')}>⟳ แตะ / ตั้ง<span class="key-badge"><span class="key-label">T</span></span></div>
    <div class="ctx-item" onclick={()=>ctxAct('flip')}>◧ พลิก<span class="key-badge"><span class="key-label">F</span></span></div>
    <div class="ctx-item" onclick={()=>ctxAct('rotate')}>↻ หมุน 90°<span class="key-badge"><span class="key-label">R</span></span></div>
    {#if cards[ctxCid]?.zoneId === 'you-trash'}
      <div class="ctx-sep"></div>
      <div class="ctx-item ctx-item-search-trash" onclick={()=>ctxAct('searchTrash')}>🔍 Search Trash</div>
    {/if}
    <div class="ctx-sep"></div>
    <div class="ctx-item ctx-has-sub" onclick={(e)=>{ ctxCounterY=e.clientY; ctxCounterVisible=!ctxCounterVisible; }}>
      <span>🔢 Counters</span>
      <span class="ctx-sub-arrow" class:open={ctxCounterVisible}>▶</span>
    </div>
    <div class="ctx-sep"></div>
    <div class="ctx-item" onclick={()=>ctxAct('toHand')}>↩ ไปมือ<span class="key-badge"><span class="key-label">H</span></span></div>
    <div class="ctx-item" onclick={()=>ctxAct('toTop')}>⬆ ไปบนสำรับ</div>
    <div class="ctx-item" onclick={()=>ctxAct('toBottom')}>⬇ ไปล่างสำรับ</div>
    <div class="ctx-item" onclick={()=>ctxAct('toLife')}>♥ ไปชีวิต</div>
    <div class="ctx-sep"></div>
    <div class="ctx-item" onclick={()=>ctxAct('clone')}>⊕ ทำสำเนา<span class="key-badge"><span class="key-label">C</span></span></div>
    <div class="ctx-item danger" onclick={()=>ctxAct('trash')}>🗑 สุสาน<span class="key-badge"><span class="key-label wide">Del</span></span></div>
  {/if}
</div>
{/if}

<!-- COUNTER SUBMENU -->
{#if ctxVisible && ctxCounterVisible}
<div id="ctx-counter-menu" style="left:{ctxX+170}px;top:{ctxCounterY-8}px">
  <div class="ctx-counter-label">🔢 Counters</div>
  <div class="ctx-counter-grid">
    <div class="ctx-item counter-btn" onclick={()=>doCounter(ctxCid, 1000)}>+1k</div>
    <div class="ctx-item counter-btn" onclick={()=>doCounter(ctxCid,-1000)}>-1k</div>
    <div class="ctx-item counter-btn" onclick={()=>doCounter(ctxCid, 2000)}>+2k</div>
    <div class="ctx-item counter-btn" onclick={()=>doCounter(ctxCid,-2000)}>-2k</div>
    <div class="ctx-item counter-btn" onclick={()=>doCounter(ctxCid, 4000)}>+4k</div>
    <div class="ctx-item counter-btn" onclick={()=>doCounter(ctxCid,-4000)}>-4k</div>
    <div class="ctx-item counter-btn reset" onclick={()=>{const c=cards[ctxCid]; if(c){c.counter=0; send('card_counter',{cid:ctxCid,val:0});}}} style="grid-column:span 2">Reset</div>
  </div>
</div>
{/if}

<!-- DECK CTX MENU -->
{#if deckCtxVisible}
<div id="ctx-menu" style="display:block;left:{deckCtxX}px;top:{deckCtxY}px">
  <div class="ctx-item" onclick={()=>deckCtxAct('shuffle')}>🔄 สับกอง</div>
  <div class="ctx-item" onclick={()=>deckCtxAct('draw')}>🗂 จั่วการ์ด</div>
  <div class="ctx-item" onclick={()=>deckCtxAct('drawBottom')}>⬇ จั่วจากใต้กอง</div>
  <div class="ctx-sep"></div>
  <div class="ctx-item" onclick={()=>openCtxScrub('search')}>🔍 Search {searchCtxN}</div>
  <div class="ctx-item ctx-item-deck-search" onclick={()=>startSearchDeck(1)}>🃏 Search Deck</div>
  <div class="ctx-sep"></div>
  <div class="ctx-item ctx-item-scry" onclick={()=>openCtxScrub('scry')}>👁 Scry {scryCtxN}</div>
</div>
{/if}

<!-- CTX SCRUB POPUP: ลากซ้าย-ขวาเพื่อปรับจำนวน Search/Scry -->
{#if ctxScrubVisible}
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="ctx-scrub-overlay" onclick={()=>ctxScrubVisible=false}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="ctx-scrub-panel" class:scrub-scry={ctxScrubType==='scry'} onclick={(e)=>e.stopPropagation()}>
    <div class="ctx-scrub-title">{ctxScrubType==='search' ? '🔍 Search' : '👁 Scry'}</div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="ctx-scrub-track"
      class:dragging={ctxScrubDragging}
      style="touch-action:none"
      onpointerdown={ctxScrubDown}
      onpointermove={ctxScrubMove}
      onpointerup={ctxScrubUp}
      onpointercancel={ctxScrubUp}
    >
      <button type="button" class="ctx-scrub-arrow" onclick={(e)=>{e.stopPropagation(); ctxScrubStep(-1);}}>‹</button>
      <span class="ctx-scrub-num">{ctxScrubType==='search' ? searchCtxN : scryCtxN}</span>
      <button type="button" class="ctx-scrub-arrow" onclick={(e)=>{e.stopPropagation(); ctxScrubStep(1);}}>›</button>
    </div>
    <div class="ctx-scrub-hint">ลากซ้าย-ขวาเพื่อปรับจำนวน (1–{ctxScrubMax})</div>
    <div class="ctx-scrub-btns">
      <button type="button" class="ctx-scrub-cancel" onclick={()=>ctxScrubVisible=false}>ยกเลิก</button>
      <button type="button" class="ctx-scrub-confirm" onclick={ctxScrubConfirm}>{ctxScrubType==='search' ? 'ค้นหา' : 'ดูการ์ด'}</button>
    </div>
  </div>
</div>
{/if}

<!-- TOOLTIP -->
{#if tooltipVisible && tooltipData}
<div id="card-tooltip" style="display:block;left:{tooltipX}px;top:{tooltipY}px">
  <div class="tip-art" style={cardBg(tooltipData)}></div>
  <div class="tip-name">{tooltipData.name}</div>
  <div class="tip-type">{tooltipData.color} · {tooltipData.type}</div>
  <div class="tip-effect">{tooltipData.effect||'—'}</div>
  <div class="tip-stats">
    <div class="tip-stat"><div class="tip-stat-l">COST</div><div class="tip-stat-v">{tooltipData.cost||'—'}</div></div>
    <div class="tip-stat"><div class="tip-stat-l">POWER</div><div class="tip-stat-v">{tooltipData.power?tooltipData.power/1000+'k':'—'}</div></div>
    <div class="tip-stat"><div class="tip-stat-l">RARITY</div><div class="tip-stat-v">{tooltipData.rarity}</div></div>
  </div>
</div>
{/if}

<!-- CARD DETAIL PANEL -->
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

<!-- PEEK LIFE (แอบดูการ์ดชีวิต) — เห็นแค่เราคนเดียว, local-only, ไม่ send อะไรไปฝั่งคู่ต่อสู้ -->
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

<!-- SEARCH N (ค้นกองหลัก) — เห็นแค่เราคนเดียว, ต้องกด Put Back/Trash เพื่อจัดการใบที่เหลือก่อนปิด -->
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


<!-- SCRY X (มองบนกอง + จัดลำดับ) — เห็นแค่เราคนเดียว -->
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

<!-- SEARCH DECK (ค้นกองทั้งหมด เลือก X ใบ) — เห็นแค่เราคนเดียว -->
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
          — {deckSearchCards.filter(c=>deckSearchSelected.has(c.uid)).map(c=>c.data.name).join(', ')}
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

<!-- SEARCH TRASH (ค้นกองทิ้ง/สุสาน) — เห็นแค่เราคนเดียว -->
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

<!-- REMOTE DRAG GHOSTS -->
{#each Object.values(remoteDragGhosts) as ghost (ghost.cid)}
  <div class="remote-drag-ghost" style={remoteGhostBoxStyle(ghost)}>
    {#if !ghost.faceDown}
      <div class="remote-drag-face" style={remoteGhostFaceStyle(ghost)}></div>
    {:else}
      <div class="card-back-ghost"></div>
    {/if}
    <div class="ghost-label">{oppName}</div>
  </div>
{/each}

<!-- REMOTE CURSOR -->
<div id="remote-cursor" bind:this={remoteCursorEl} style="display:none">
  <div class="rcursor-dot"></div>
  <div class="rcursor-name">{oppName}</div>
</div>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div style="display:none" onclick={()=>ctxVisible&&hideCtx()}></div>

<svelte:document 
  onclick={e=>{ 
    if(ctxVisible && !(e.target as HTMLElement)?.closest('#ctx-menu') && !(e.target as HTMLElement)?.closest('#ctx-counter-menu')) hideCtx();
    if(deckCtxVisible && !(e.target as HTMLElement)?.closest('#ctx-menu')) hideCtx();
  }} 
  oncontextmenu={e=>{ if(!(e.target as HTMLElement)?.closest('.card') && !(e.target as HTMLElement)?.closest('#deck-pile-you')) e.preventDefault(); }} 
/>

<style>
  :global(*){margin:0;padding:0;box-sizing:border-box;user-select:none}
  :global(:root){
    --bg:#0d1117;--surface:#161b22;--surface2:#21262d;--surface3:#30363d;
    --border:#30363d;--border2:#484f58;--text:#e6edf3;--text2:#8b949e;--text3:#6e7681;
    --blue:#1f6feb;--blue2:#388bfd;--red:#da3633;--gold:#d29922;--green:#238636;
    --green2:#2ea043;--zone-bg:rgba(255,255,255,0.03);--zone-border:rgba(255,255,255,0.08);
    --zone-hover:rgba(56,139,253,0.15);--card-w:74px;--card-h:103px;
    --don-card-w:var(--card-w);--don-card-h:var(--card-h)
  }
  :global(html,body){width:100%;height:100%;overflow:hidden;background:var(--bg);font-family:'Segoe UI',system-ui,sans-serif}

  /* ── TOPBAR ── */
  #topbar{height:44px;background:var(--surface);border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 12px;gap:8px;flex-shrink:0;z-index:100}
  .logo{font-size:14px;font-weight:700;color:var(--text)}
  .logo span{color:var(--blue2)}
  .topbar-sep{width:1px;height:20px;background:var(--border);margin:0 4px}
  .tb-btn{height:28px;padding:0 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text2);font-size:12px;cursor:pointer;display:flex;align-items:center;gap:5px;transition:all .15s}
  .tb-btn:hover{background:var(--surface3);color:var(--text);border-color:var(--border2)}
  :global(.tb-btn.danger:hover){background:var(--red);border-color:var(--red);color:#fff}
  .spacer{flex:1}
  .conn-badge{display:flex;align-items:center;gap:6px;font-size:11px;padding:0 10px;height:28px;border-radius:6px;background:var(--surface2);border:1px solid var(--border);color:var(--text2)}
  .conn-dot{width:7px;height:7px;border-radius:50%;background:var(--border2);transition:background .3s}
  :global(.conn-dot.connected){background:var(--green2);box-shadow:0 0 6px rgba(46,160,67,.5)}
  .turn-badge{display:flex;align-items:center;gap:6px;font-size:11px;padding:0 10px;height:28px;border-radius:6px;border:1px solid var(--border);color:var(--text2);background:var(--surface2)}

  /* ── BOARD ── */
  #app{display:flex;flex-direction:column;height:100vh}
  #board-wrap{flex:1;display:flex;overflow:hidden;position:relative}

  #playfield{
    flex:1;position:relative;overflow:hidden;background:#000;
    background-image:url("https://s6.imgcdn.dev/Ybrj6O.png");
    background-size:contain;background-position:center;background-repeat:no-repeat
  }

  /* ── ZONES ── */
  :global(.zone){position:absolute;border:1px dashed rgba(255,255,255,.12);border-radius:8px;background:rgba(0,0,0,0);transition:background .2s,border-color .2s;display:flex;align-items:center;justify-content:center;flex-direction:column;pointer-events:none;z-index:2;opacity:.32}
  :global(.zone[data-side="you"]){border-color:rgba(56,139,253,.22)}
  :global(.zone[data-side="opp"]){border-color:rgba(218,54,51,.2)}
  :global(.zone.drag-over){background:rgba(56,139,253,.15);border-color:rgba(56,139,253,.72);opacity:1}
  :global(.zone-label){font-size:8px;font-weight:700;letter-spacing:1px;color:rgba(255,255,255,.36);text-transform:uppercase;pointer-events:none;position:absolute;bottom:4px;text-shadow:0 1px 3px rgba(0,0,0,.9)}

  /* ── ATTACK LINE ── */
  :global(.attack-line-layer){position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:900;overflow:visible}
  :global(.attack-line){stroke-width:3;stroke-linecap:round;opacity:.92;animation:attack-line-fade 5s ease-out forwards}
  :global(.attack-line.mine){stroke:var(--blue2);filter:drop-shadow(0 0 4px rgba(56,139,253,.7))}
  :global(.attack-line.opp){stroke:var(--red);filter:drop-shadow(0 0 4px rgba(218,54,51,.7))}
  :global(.attack-line.drawing){stroke:var(--blue2);stroke-dasharray:6 4;opacity:.85;animation:none}
  @keyframes attack-line-fade{0%{opacity:.95}70%{opacity:.85}100%{opacity:0}}

  /* ── CARDS ── */
  :global(.card){position:absolute;width:var(--card-w);height:var(--card-h);border-radius:5px;cursor:grab;border:1px solid rgba(255,255,255,.12);z-index:10;transform-origin:center center;transition:box-shadow .12s, transform .2s ease-out;perspective:1000px}
  :global(.card.mine){cursor:grab}
  :global(.card.theirs){cursor:pointer;pointer-events:auto}
  :global(.card:hover){z-index:50}
  :global(.card.dragging){cursor:grabbing!important;z-index:1000;box-shadow:0 20px 60px rgba(0,0,0,.8),0 0 0 2px var(--blue2)}
  :global(.card.remote-highlight){box-shadow:0 0 0 2px var(--red),0 0 20px rgba(218,54,51,.4)}
  :global(.card-flipper){position:relative;width:100%;height:100%;transform-style:preserve-3d;transition:transform .35s}
  :global(.card-flipper.flipped){transform:rotateY(180deg)}
  :global(.card-front,.card-back-face){position:absolute;inset:0;backface-visibility:hidden;border-radius:4px;overflow:hidden}
  :global(.card-back-face){transform:rotateY(180deg)}
  :global(.card-face-bg){position:absolute;inset:0;background-size:cover;background-position:center}
  :global(.card-face-grad){position:absolute;inset:0;background:linear-gradient(to bottom,transparent 35%,rgba(0,0,0,.85))}
  :global(.card-name-label){position:absolute;bottom:9px;left:3px;right:3px;font-size:7.5px;font-weight:700;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,1);line-height:1.2;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
  :global(.card-cost){position:absolute;top:3px;left:3px;width:17px;height:17px;border-radius:50%;background:rgba(0,0,0,.8);border:1px solid rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:#fff;z-index:2}
  :global(.card-power){position:absolute;bottom:3px;right:3px;background:rgba(0,0,0,.75);border-radius:2px;padding:1px 3px;font-size:8px;font-weight:700;color:#fff;z-index:2}
  :global(.card-rarity-strip){position:absolute;bottom:0;left:0;right:0;height:3px;border-radius:0 0 4px 4px}
  :global(.card-counter-badge){position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--green2);color:#fff;padding:2px 6px;border-radius:12px;font-size:12px;font-weight:900;box-shadow:0 0 10px rgba(0,0,0,0.8),0 0 0 1px #fff;z-index:5;pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,0.5)}
  :global(.card-counter-badge.neg){background:var(--red)}
  :global(.r-C){background:#555}:global(.r-U){background:#238636}:global(.r-R){background:var(--blue)}:global(.r-SR){background:var(--gold)}:global(.r-L){background:linear-gradient(90deg,#f5a623,#d0021b,#9b59b6)}
  :global(.card-back-design){position:absolute;inset:0;background-image:url("https://s6.imgcdn.dev/Ybr42q.jpg");background-size:cover;background-position:center;display:flex;align-items:center;justify-content:center}
  :global(.card-back-design::before){content:'';position:absolute;inset:5px;border:1px solid rgba(255,255,255,.08);border-radius:3px;display:none}
  :global(.card-back-design .anchor){font-size:26px;opacity:.2;display:none}
  :global(.card.theirs .card-back-design){background-image:url("https://s6.imgcdn.dev/Ybr42q.jpg")}

  /* ── CARD DROP (วางการ์ด) FLIP + GLOW ── */
  /* ใส่ animation บน .card-flipper (ไม่ใช่ .card เอง) เพราะ .card มี inline style:transform
     (rotate ของ tapped/owner) ที่ Svelte set ทับตลอด ถ้า animate ตรงนั้นจะชนกัน
     .card-flipper ไม่มี inline transform ขัดอยู่ และมี perspective รับช่วงจาก .card อยู่แล้ว */
  @keyframes card-drop-flip-in {
    0%   { transform: translateY(-50px) rotateX(90deg) scale(.8); opacity: 0; }
    45%  { transform: translateY(6px) rotateX(-12deg) scale(1.03); opacity: 1; }
    65%  { transform: rotateX(4deg) scale(.99); }
    82%  { transform: rotateX(-2deg); }
    100% { transform: translateY(0) rotateX(0deg) scale(1); opacity: 1; }
  }
  @keyframes card-drop-flip-glow {
    0%   { box-shadow: 0 4px 16px rgba(0,0,0,.6), 0 0 0px 0px rgba(59,130,246,0); }
    40%  { box-shadow: 0 4px 16px rgba(0,0,0,.6), 0 0 22px 6px rgba(59,130,246,.55); }
    100% { box-shadow: 0 4px 16px rgba(0,0,0,.6), 0 0 0px 0px rgba(59,130,246,0); }
  }
  :global(.card.card-drop-flip > .card-flipper) {
    animation:
      card-drop-flip-in   .5s cubic-bezier(.34,1.4,.64,1) forwards,
      card-drop-flip-glow 1s ease .42s 1;
    transform-origin: center center;
  }
  /* ระหว่างเล่น flip-in ปิด transition ปกติของ .card-flipper ชั่วคราว กัน .35s transition ของ flip ไปหน่วง keyframe */
  :global(.card.card-drop-flip > .card-flipper) { transition: none; }

  /* ── LIFE zones ── */
  :global(.life-zone-container){position:absolute;z-index:10;pointer-events:none}
  :global(.life-zone-card){position:absolute;border-radius:5px;border:1px solid rgba(255,255,255,.18);background-image:url("https://s6.imgcdn.dev/Ybr42q.jpg");background-size:cover;background-position:center;cursor:pointer;pointer-events:auto;display:flex;align-items:center;justify-content:center;font-size:20px;opacity:.92;box-shadow:0 2px 8px rgba(0,0,0,.5);transition:opacity .15s;width:var(--card-h);height:var(--card-w);transform:rotate(0deg)}
  :global(.life-zone-card.spent){background:rgba(255,255,255,.03);border-style:dashed;opacity:.18;box-shadow:none;background-image:none}
  :global(.life-zone-card.you-life){cursor:pointer}
  :global(.life-zone-card.opp-life){background-image:url("https://s6.imgcdn.dev/Ybr42q.jpg");cursor:pointer;pointer-events:auto}

  /* ── DON!! ── */
  :global(.don-pile-wrapper){position:absolute;z-index:1;cursor:pointer;transition:transform .1s}
  :global(.don-pile-wrapper:hover){transform:scale(1.05)}
  #don-pile-opp{transform:rotate(180deg)}
  #don-pile-opp:hover{transform:rotate(180deg) scale(1.05)}
  :global(.don-count-badge){position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);font-size:11px;font-weight:800;color:rgba(255,255,255,.8);background:rgba(0,0,0,.6);border-radius:8px;padding:1px 7px;white-space:nowrap;pointer-events:none}
  #don-pile-opp .don-count-badge{bottom:auto;top:-18px;transform:translateX(-50%) rotate(180deg)}
  :global(.don-pile-layer){position:absolute;inset:0;border-radius:5px;border:1px solid rgba(210,153,34,.4);background-image:url("https://s6.imgcdn.dev/YbrNNu.png");background-size:cover;background-position:center;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:rgba(210,153,34,.9);box-shadow:0 2px 6px rgba(0,0,0,.6)}
  :global(.don-pile-layer.top-layer){border-color:rgba(210,153,34,.7)}
  :global(.don-card){width:var(--don-card-w);height:var(--don-card-h);border-radius:4px;border:1px solid rgba(210,153,34,.7);cursor:grab;flex-shrink:0;box-shadow:0 2px 6px rgba(0,0,0,.5);position:absolute;z-index:5;transition:box-shadow .12s;perspective:1000px}
  :global(.don-card:hover){box-shadow:0 4px 14px rgba(210,153,34,.4),0 0 0 1px rgba(210,153,34,.5);z-index:50}
  :global(.don-card.dragging){cursor:grabbing!important;z-index:1000;box-shadow:0 8px 24px rgba(0,0,0,.8),0 0 0 2px var(--gold)}
  :global(.don-card.theirs){cursor:default;transform:rotate(180deg)}
  :global(.don-card .don-card-front){background-image:url("https://s6.imgcdn.dev/YbpBH0.png");background-size:cover;background-position:center;border-radius:4px}
  :global(.don-card .don-card-back){background-image:url("https://s6.imgcdn.dev/YbrNNu.png");background-size:cover;background-position:center;border-radius:4px}

  /* ── DECK PILE ── */
  #deck-pile-you,#deck-pile-opp{position:absolute;z-index:1;transition:transform .1s}
  #deck-pile-you{cursor:pointer}
  #deck-pile-you:hover{transform:scale(1.05)}
  #deck-pile-opp{cursor:default;pointer-events:none;transform:rotate(180deg)}
  :global(.deck-card-visual){position:absolute;inset:0;border-radius:5px;border:1px solid rgba(255,255,255,.15);background-image:url("https://s6.imgcdn.dev/Ybr42q.jpg");background-size:cover;background-position:center}
  #deck-pile-opp :global(.deck-card-visual){border-color:rgba(255,255,255,.12);background-image:url("https://s6.imgcdn.dev/Ybr42q.jpg")}
  :global(.deck-count-badge){position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);font-size:11px;font-weight:800;color:rgba(255,255,255,.8);background:rgba(0,0,0,.6);border-radius:8px;padding:1px 7px;white-space:nowrap;pointer-events:none}
  #deck-pile-opp .deck-count-badge{bottom:auto;top:-18px;transform:translateX(-50%) rotate(180deg)}

  /* ── DECK SHUFFLE ANIMATION ── */
  @keyframes deck-shuffle-left{
    0%{transform:translate(var(--sx,0px),var(--sy,0px)) rotate(0deg) scale(1)}
    18%{transform:translate(calc(var(--sx,0px) - 26px),calc(var(--sy,0px) + 16px)) rotate(-16deg) scale(1.06)}
    40%{transform:translate(calc(var(--sx,0px) - 30px),calc(var(--sy,0px) + 8px)) rotate(-12deg) scale(1.06)}
    62%{transform:translate(calc(var(--sx,0px) + 10px),calc(var(--sy,0px) + 4px)) rotate(8deg) scale(1.04)}
    82%{transform:translate(calc(var(--sx,0px) + 3px),calc(var(--sy,0px) + 1px)) rotate(2deg) scale(1.01)}
    100%{transform:translate(var(--sx,0px),var(--sy,0px)) rotate(0deg) scale(1)}
  }
  @keyframes deck-shuffle-right{
    0%{transform:translate(var(--sx,0px),var(--sy,0px)) rotate(0deg) scale(1)}
    18%{transform:translate(calc(var(--sx,0px) + 26px),calc(var(--sy,0px) + 16px)) rotate(16deg) scale(1.06)}
    40%{transform:translate(calc(var(--sx,0px) + 30px),calc(var(--sy,0px) + 8px)) rotate(12deg) scale(1.06)}
    62%{transform:translate(calc(var(--sx,0px) - 10px),calc(var(--sy,0px) + 4px)) rotate(-8deg) scale(1.04)}
    82%{transform:translate(calc(var(--sx,0px) - 3px),calc(var(--sy,0px) + 1px)) rotate(-2deg) scale(1.01)}
    100%{transform:translate(var(--sx,0px),var(--sy,0px)) rotate(0deg) scale(1)}
  }
  @keyframes deck-pile-glow{
    0%,100%{filter:brightness(1) drop-shadow(0 0 0 rgba(91,157,255,0))}
    45%{filter:brightness(1.22) drop-shadow(0 0 12px rgba(91,157,255,.6))}
  }
  #deck-pile-you.shuffling :global(.deck-card-visual.shuf-left),
  #deck-pile-opp.shuffling :global(.deck-card-visual.shuf-left){
    animation:deck-shuffle-left 1.3s ease-in-out;
  }
  #deck-pile-you.shuffling :global(.deck-card-visual.shuf-right),
  #deck-pile-opp.shuffling :global(.deck-card-visual.shuf-right){
    animation:deck-shuffle-right 1.3s ease-in-out;
  }
  #deck-pile-you.shuffling,#deck-pile-opp.shuffling{
    animation:deck-pile-glow 1.4s ease-in-out;
  }

  /* ── PLAYER LABELS ── */
  .player-label{position:absolute;font-size:11px;font-weight:700;letter-spacing:.5px;z-index:3;pointer-events:none;display:flex;align-items:center;gap:6px}
  .player-label.opp{top:72px;left:12px;color:rgba(218,54,51,.5)}
  .player-label.you{bottom:8px;left:12px;color:rgba(56,139,253,.5)}
  .player-name-badge{background:rgba(0,0,0,.4);border-radius:4px;padding:2px 7px;font-size:10px}

  /* ── SIDEBAR ── */
  /* sidebar styles moved to Sidebar.svelte */

  /* ── HAND ── */
  #opp-hand-bar{position:absolute;top:8px;left:8px;z-index:25;max-width:260px;background:rgba(20,8,8,.55);backdrop-filter:blur(3px);border:1px solid rgba(218,54,51,.18);border-radius:8px;display:flex;flex-direction:column;align-items:flex-start;padding:6px 8px;gap:4px;pointer-events:none}
  #opp-hand-cards{display:flex;align-items:center;gap:4px;flex-wrap:wrap;padding:2px 0;max-width:244px}
  .opp-hand-card{width:28px;height:38px;border-radius:3px;background-image:url("https://s6.imgcdn.dev/Ybr42q.jpg");background-size:cover;background-position:center;border:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;font-size:12px;opacity:.8;flex-shrink:0}
  .opp-hand-label{font-size:10px;color:rgba(218,54,51,.6);font-weight:700;letter-spacing:1px}
  #hand-area{--card-w:86px;--card-h:120px;height:166px;background:rgba(0,0,0,.45);border-top:1px solid var(--border);display:flex;align-items:flex-end;justify-content:center;padding:0 54px 14px 20px;gap:8px;position:relative;z-index:5;flex-shrink:0;overflow-x:auto;overflow-y:clip;overflow-clip-margin:60px;scrollbar-width:thin;scrollbar-color:var(--border) transparent;transition:background .15s,box-shadow .15s}
  #hand-area.drag-over-hand{background:rgba(56,139,253,.18);box-shadow:inset 0 0 0 2px rgba(56,139,253,.72)}
  .hand-label{position:absolute;top:5px;left:12px;font-size:9px;font-weight:700;color:var(--text3);letter-spacing:1.5px;text-transform:uppercase}
  .hand-count{position:absolute;top:5px;right:12px;font-size:10px;color:var(--text3)}
  #hand-area :global(.card){position:relative!important;flex-shrink:0;transition:transform .15s ease-out,box-shadow .15s;top:0!important;left:0!important;margin-bottom:4px;transform-origin:bottom center}
  #hand-area :global(.card:hover){transform:translateY(-14px) scale(1.15)!important;z-index:60;box-shadow:0 14px 32px rgba(0,0,0,.6)}
  #hand-area :global(.card:has(+ .card:hover)){transform:translateY(-6px) scale(1.06)!important;z-index:40}
  #hand-area :global(.card:hover + .card){transform:translateY(-6px) scale(1.06)!important;z-index:40}
  #hand-area :global(.card-cost){width:22px;height:22px;font-size:12px;top:4px;left:4px}
  #hand-area :global(.card-power){font-size:11px;padding:2px 5px;bottom:4px;right:4px}
  #hand-area :global(.card-name-label){font-size:9.5px;bottom:11px;left:4px;right:4px}
  #hand-area :global(.card-rarity-strip){height:4px}
  #hand-area :global(.card-counter-badge){font-size:15px;padding:3px 8px}



  /* ── CTX MENU ── */
  #ctx-menu{position:fixed;z-index:9999;background:var(--surface);border:1px solid var(--border2);border-radius:8px;padding:4px;min-width:165px;box-shadow:0 8px 32px rgba(0,0,0,.6)}
  .ctx-item{padding:6px 12px;border-radius:5px;font-size:12px;color:var(--text);cursor:pointer;display:flex;align-items:center;gap:7px;transition:background .1s}
  .ctx-item:hover{background:var(--surface2)}
  .ctx-item.danger{color:var(--red)}
  .ctx-item.danger:hover{background:rgba(218,54,51,.1)}
  .ctx-sep{height:1px;background:var(--border);margin:3px 0}
  .ctx-has-sub{justify-content:space-between}
  .ctx-has-sub:hover{background:var(--surface2)}
  .ctx-sub-arrow{font-size:9px;color:var(--text3);transition:transform .15s}
  .ctx-sub-arrow.open{transform:rotate(90deg);color:var(--gold)}
  #ctx-counter-menu{position:fixed;z-index:10000;background:var(--surface);border:1px solid var(--border2);border-radius:8px;padding:8px;box-shadow:0 8px 32px rgba(0,0,0,.6);min-width:130px}
  .ctx-counter-label{font-size:10px;font-weight:700;color:var(--text3);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;padding:0 2px}
  .ctx-counter-grid{display:grid;grid-template-columns:1fr 1fr;gap:3px}
  .counter-btn{padding:4px!important;justify-content:center;font-size:10px!important;font-weight:800;border:1px solid var(--border)}
  .counter-btn.reset{grid-column:span 2;color:var(--text3)}

  /* ── KEY BADGE (icon คีย์ลัด จาก key.svg) ── */
  .key-badge{width:19px;height:19px;flex-shrink:0;background-image:url('/key.svg');background-size:contain;background-repeat:no-repeat;background-position:center;display:inline-flex;align-items:center;justify-content:center;position:relative;margin-left:auto}
  .key-badge .key-label{font-size:8.5px;font-weight:800;color:#3a3a3c;line-height:1;letter-spacing:-0.3px;transform:translateY(-1px);white-space:nowrap}
  .key-badge .key-label.wide{font-size:6.5px;letter-spacing:-0.5px}

  /* ── TOOLTIP ── */
  #card-tooltip{position:fixed;z-index:8000;pointer-events:none;width:190px;background:var(--surface);border:1px solid var(--border2);border-radius:10px;padding:10px;box-shadow:0 8px 32px rgba(0,0,0,.7)}
  .tip-art{width:100%;aspect-ratio:2/3;border-radius:5px;margin-bottom:7px;background-size:cover;background-position:center}
  .tip-name{font-size:12px;font-weight:700;color:var(--text);margin-bottom:2px}
  .tip-type{font-size:10px;color:var(--text3);margin-bottom:6px}
  .tip-effect{font-size:10px;color:var(--text2);line-height:1.5;margin-bottom:8px}
  .tip-stats{display:flex;gap:6px}
  .tip-stat{flex:1;background:var(--surface2);border-radius:4px;padding:4px 5px;text-align:center}
  .tip-stat-l{font-size:8px;color:var(--text3)}
  .tip-stat-v{font-size:12px;font-weight:700;color:var(--text)}

  /* ── CARD DETAIL PANEL ── */
  #card-detail-panel{position:fixed;bottom:145px;right:260px;z-index:6000;width:340px;background:var(--surface);border:1px solid var(--border2);border-radius:16px;overflow:hidden;box-shadow:0 20px 80px rgba(0,0,0,.95),0 0 0 1px rgba(255,255,255,.06);display:flex;flex-direction:column}
  #card-detail-panel .detail-card-area{position:relative;padding:10px 10px 0;background:var(--surface)}
  #card-detail-panel .detail-close-x{position:absolute;top:6px;right:6px;z-index:10;width:26px;height:26px;border-radius:50%;border:none;background:rgba(0,0,0,.7);color:rgba(255,255,255,.85);font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;transition:background .15s,color .15s}
  #card-detail-panel .detail-close-x:hover{background:rgba(218,54,51,.9);color:#fff}
  #card-detail-panel .detail-img-wrap{width:100%;aspect-ratio:2/3;flex-shrink:0;overflow:hidden;border-radius:8px;border:2px solid rgba(255,255,255,.15);box-shadow:0 4px 20px rgba(0,0,0,.6)}
  #card-detail-panel .detail-img{width:100%;height:100%;background-size:cover;background-position:center;transition:transform .3s ease}
  #card-detail-panel .detail-img-wrap:hover .detail-img{transform:scale(1.03)}
  #card-detail-panel .detail-info{padding:14px 16px 18px;display:flex;flex-direction:column;gap:8px}
  #card-detail-panel .detail-name{font-size:17px;font-weight:900;color:var(--text);line-height:1.2;letter-spacing:-0.3px}
  #card-detail-panel .detail-type{font-size:11px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:0.8px}
  #card-detail-panel .detail-effect{font-size:12px;color:var(--text2);line-height:1.6;background:rgba(0,0,0,.25);border-radius:8px;padding:10px 12px;border:1px solid var(--border);max-height:130px;overflow-y:auto;white-space:pre-wrap;scrollbar-width:thin}
  #card-detail-panel .detail-tags{display:flex;gap:6px;flex-wrap:wrap}
  #card-detail-panel .tag{background:var(--surface2);border-radius:6px;padding:3px 10px;font-size:11px;font-weight:800;color:var(--text);border:1px solid var(--border2)}

  /* ── PEEK LIFE (แอบดูการ์ดชีวิต) ── */
  #peek-life-overlay{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:5500;display:flex;align-items:center;justify-content:center;padding:24px}
  #peek-life-panel{width:min(620px,100%);max-height:78vh;background:var(--surface);border:1px solid var(--border2);border-radius:14px;box-shadow:0 20px 80px rgba(0,0,0,.9),0 0 0 1px rgba(255,255,255,.06);display:flex;flex-direction:column;overflow:hidden}
  .peek-life-header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border);font-size:13px;font-weight:800;color:var(--text)}
  .peek-life-close{width:26px;height:26px;flex-shrink:0;border-radius:50%;border:none;background:var(--surface2);color:var(--text2);font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;transition:background .15s,color .15s}
  .peek-life-close:hover{background:var(--red);color:#fff}
  .peek-life-grid{padding:16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:12px;overflow-y:auto;scrollbar-width:thin}
  .peek-life-item{position:relative;cursor:pointer;display:flex;flex-direction:column;gap:4px;text-align:center}
  .peek-life-img{width:100%;aspect-ratio:2/3;border-radius:6px;background-size:cover;background-position:center;border:1px solid var(--border2);box-shadow:0 2px 10px rgba(0,0,0,.5);transition:transform .15s}
  .peek-life-item:hover .peek-life-img{transform:scale(1.04)}
  .peek-life-name{font-size:10px;color:var(--text2);line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .peek-life-top-badge{position:absolute;top:4px;left:4px;font-size:9px;font-weight:800;color:var(--gold);background:rgba(20,16,8,.85);border:1px solid rgba(210,153,34,.5);border-radius:4px;padding:1px 5px}
  .peek-life-empty{grid-column:1/-1;text-align:center;color:var(--text3);font-size:12px;padding:30px 0}

  /* ── SEARCH N (ค้นกองหลัก) ── */
  #search-overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:5500;display:flex;align-items:center;justify-content:center;padding:24px}
  #search-panel{width:min(640px,100%);max-height:82vh;background:var(--surface);border:1px solid var(--border2);border-radius:14px;box-shadow:0 20px 80px rgba(0,0,0,.9),0 0 0 1px rgba(255,255,255,.06);display:flex;flex-direction:column;overflow:hidden}
  .search-header{padding:12px 16px;border-bottom:1px solid var(--border);font-size:13px;font-weight:800;color:var(--text)}
  .search-grid{padding:16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:12px;overflow-y:auto;scrollbar-width:thin}
  .search-item{position:relative;cursor:pointer;display:flex;flex-direction:column;gap:4px;text-align:center}
  .search-img{width:100%;aspect-ratio:2/3;border-radius:6px;background-size:cover;background-position:center;border:1px solid var(--border2);box-shadow:0 2px 10px rgba(0,0,0,.5);transition:transform .15s}
  .search-item:hover .search-img{transform:scale(1.04);box-shadow:0 0 0 2px var(--blue2),0 2px 10px rgba(0,0,0,.5)}
  .search-name{font-size:10px;color:var(--text2);line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .search-top-badge{position:absolute;top:4px;left:4px;font-size:9px;font-weight:800;color:var(--gold);background:rgba(20,16,8,.85);border:1px solid rgba(210,153,34,.5);border-radius:4px;padding:1px 5px}
  .search-empty{grid-column:1/-1;text-align:center;color:var(--text3);font-size:12px;padding:30px 0}
  .search-footer{padding:12px 16px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px}
  .search-hint{font-size:11px;color:var(--text3)}
  .search-footer-btns{display:flex;gap:10px}
  .search-btn{flex:1;height:34px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;transition:all .15s}
  .bottom-btn{background:var(--surface2);color:var(--text);border:1px solid var(--border2)}
  .bottom-btn:hover{background:var(--blue);border-color:var(--blue);color:#fff}
  .trash-btn{background:rgba(218,54,51,.1);color:var(--red);border:1px solid rgba(218,54,51,.4)}
  .trash-btn:hover{background:var(--red);border-color:var(--red);color:#fff}

  /* ── CTX SEPARATOR ── */
  .ctx-sep{height:1px;background:var(--border);margin:4px 0}
  .ctx-item-deck-search{color:var(--gold);font-weight:700}
  .ctx-item-deck-search:hover{background:rgba(210,153,34,.15)}
  .ctx-item-scry{color:#b48fff;font-weight:600}
  .ctx-item-scry:hover{background:rgba(150,100,255,.15)}
  .ctx-item-search-trash{color:#f97583;font-weight:700}
  .ctx-item-search-trash:hover{background:rgba(218,54,51,.15)}

  /* ── CTX SCRUB POPUP (ลากซ้าย-ขวาปรับจำนวน Search/Scry) ── */
  .ctx-scrub-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px}
  .ctx-scrub-panel{
    width:220px;background:var(--surface);border:1px solid var(--border2);border-radius:14px;
    box-shadow:0 20px 60px rgba(0,0,0,.85),0 0 0 1px rgba(80,160,255,.1);
    padding:16px;display:flex;flex-direction:column;gap:10px;align-items:center;
  }
  .ctx-scrub-panel.scrub-scry{box-shadow:0 20px 60px rgba(0,0,0,.85),0 0 0 1px rgba(180,143,255,.15)}
  .ctx-scrub-title{font-size:13px;font-weight:800;color:var(--text)}
  .ctx-scrub-panel.scrub-scry .ctx-scrub-title{color:#b48fff}
  .ctx-scrub-track{
    width:100%;height:54px;border-radius:10px;border:1px solid var(--border2);
    background:var(--surface2);display:flex;align-items:center;justify-content:space-between;
    padding:0 10px;cursor:ew-resize;user-select:none;transition:border-color .12s,background .12s;
  }
  .ctx-scrub-track:hover{border-color:var(--blue)}
  .ctx-scrub-track.dragging{border-color:var(--blue);background:rgba(80,160,255,.08)}
  .ctx-scrub-panel.scrub-scry .ctx-scrub-track:hover,
  .ctx-scrub-panel.scrub-scry .ctx-scrub-track.dragging{border-color:#b48fff;background:rgba(180,143,255,.08)}
  .ctx-scrub-num{font-size:26px;font-weight:800;color:var(--text);min-width:40px;text-align:center;pointer-events:none}
  .ctx-scrub-arrow{
    width:26px;height:26px;border-radius:6px;border:1px solid var(--border2);background:var(--surface3,#222);
    color:var(--text2);font-size:14px;line-height:1;display:flex;align-items:center;justify-content:center;
    cursor:pointer;padding:0;flex-shrink:0;
  }
  .ctx-scrub-arrow:hover{background:var(--blue);border-color:var(--blue);color:#fff}
  .ctx-scrub-panel.scrub-scry .ctx-scrub-arrow:hover{background:#b48fff;border-color:#b48fff;color:#fff}
  .ctx-scrub-hint{font-size:10px;color:var(--text3)}
  .ctx-scrub-btns{display:flex;gap:8px;width:100%}
  .ctx-scrub-cancel{flex:1;height:32px;border-radius:8px;border:1px solid var(--border2);background:var(--surface2);color:var(--text2);font-size:12px;font-weight:600;cursor:pointer;transition:all .12s}
  .ctx-scrub-cancel:hover{background:var(--border2);color:var(--text)}
  .ctx-scrub-confirm{flex:1;height:32px;border-radius:8px;border:1px solid var(--blue);background:rgba(80,160,255,.15);color:var(--blue2,#7ab8ff);font-size:12px;font-weight:700;cursor:pointer;transition:all .12s}
  .ctx-scrub-confirm:hover{background:var(--blue);color:#fff}
  .ctx-scrub-panel.scrub-scry .ctx-scrub-confirm{border-color:#b48fff;background:rgba(180,143,255,.15);color:#d0b0ff}
  .ctx-scrub-panel.scrub-scry .ctx-scrub-confirm:hover{background:#b48fff;color:#111}

  /* ── SCRY POPUP ── */
  #scry-overlay{position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:5700;display:flex;align-items:center;justify-content:center;padding:20px}
  #scry-panel{
    max-width:min(92vw, 900px); width:100%;
    background:var(--surface);border:1px solid var(--border2);border-radius:14px;
    box-shadow:0 24px 80px rgba(0,0,0,.9),0 0 0 1px rgba(180,143,255,.12);
    display:flex;flex-direction:column;overflow:hidden;
  }
  .scry-header{padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:10px}
  .scry-header-left{display:flex;align-items:baseline;gap:10px}
  .scry-title{font-size:14px;font-weight:800;color:#b48fff}
  .scry-subtitle{font-size:11px;color:var(--text3)}
  .scry-close{width:28px;height:28px;border-radius:6px;border:1px solid var(--border2);background:transparent;color:var(--text2);font-size:14px;cursor:pointer;flex-shrink:0}
  .scry-close:hover{background:var(--red);color:#fff;border-color:var(--red)}

  /* strip of cards */
  .scry-strip{
    display:flex;gap:10px;padding:16px;overflow-x:auto;
    scrollbar-width:thin;scrollbar-color:rgba(180,143,255,.3) transparent;
    min-height:220px;align-items:flex-start;
  }
  .scry-card-wrap{
    position:relative;flex-shrink:0;width:100px;
    display:flex;flex-direction:column;gap:6px;
    border-radius:10px;padding:6px;border:2px solid var(--border2);
    background:var(--surface2);cursor:grab;
    transition:border-color .12s, transform .12s, background .12s;
    user-select:none;
  }
  .scry-card-wrap:hover{border-color:rgba(180,143,255,.5);background:rgba(180,143,255,.06)}
  .scry-card-wrap.scry-dragging{opacity:.45;transform:scale(.95);border-color:#b48fff;cursor:grabbing}
  .scry-card-wrap.scry-drop-target{border-color:#b48fff;background:rgba(180,143,255,.12);transform:scale(1.02)}

  .scry-pos-badge{
    position:absolute;top:-9px;left:50%;transform:translateX(-50%);
    font-size:9px;font-weight:900;padding:1px 7px;border-radius:99px;
    background:var(--surface3,#222);border:1px solid var(--border2);color:var(--text3);
  }
  .scry-pos-badge.scry-top{background:rgba(180,143,255,.3);border-color:#b48fff;color:#d0b0ff}

  .scry-card-img{width:100%;aspect-ratio:2/3;border-radius:6px;background-size:cover;background-position:center;border:1px solid var(--border2);box-shadow:0 2px 8px rgba(0,0,0,.5)}
  .scry-card-info{display:flex;flex-direction:column;gap:2px}
  .scry-card-name{font-size:10px;font-weight:700;color:var(--text);line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .scry-card-meta{font-size:9px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .scry-card-cost{font-size:9px;color:var(--gold);font-weight:700}

  /* arrow controls */
  .scry-arrows{display:flex;gap:3px;justify-content:center}
  .scry-arrow-btn{
    flex:1;height:22px;border-radius:5px;border:1px solid var(--border2);
    background:var(--surface3,#222);color:var(--text2);font-size:11px;
    cursor:pointer;transition:all .12s;padding:0;
  }
  .scry-arrow-btn:hover:not(:disabled){background:rgba(180,143,255,.25);border-color:#b48fff;color:#d0b0ff}
  .scry-arrow-btn:disabled{opacity:.25;cursor:not-allowed}
  .scry-tobottom-btn{font-size:13px}

  /* footer */
  .scry-footer{padding:12px 16px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
  .scry-order-hint{font-size:11px;color:var(--text3)}
  .scry-footer-btns{display:flex;gap:8px}
  .scry-btn-cancel{height:32px;padding:0 14px;border-radius:8px;border:1px solid var(--border2);background:var(--surface2);color:var(--text2);font-size:12px;font-weight:600;cursor:pointer;transition:all .12s}
  .scry-btn-cancel:hover{background:var(--border2);color:var(--text)}
  .scry-btn-confirm{height:32px;padding:0 16px;border-radius:8px;border:1px solid rgba(180,143,255,.5);background:rgba(180,143,255,.15);color:#d0b0ff;font-size:12px;font-weight:700;cursor:pointer;transition:all .12s}
  .scry-btn-confirm:hover{background:#b48fff;border-color:#b48fff;color:#111}

  /* ── SEARCH DECK MODAL ── */
  #deck-search-overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:5600;display:flex;align-items:center;justify-content:center;padding:20px}
  #deck-search-panel{width:min(760px,100%);max-height:88vh;background:var(--surface);border:1px solid var(--border2);border-radius:14px;box-shadow:0 20px 80px rgba(0,0,0,.9),0 0 0 1px rgba(255,255,255,.06);display:flex;flex-direction:column;overflow:hidden}
  .ds-header{padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
  .ds-title{font-size:13px;font-weight:800;color:var(--gold)}
  .ds-header-controls{display:flex;align-items:center;gap:10px}
  .ds-pick-ctrl{display:flex;align-items:center;gap:6px;background:var(--surface2);border:1px solid var(--border2);border-radius:8px;padding:4px 10px}
  .ds-pick-label{font-size:11px;color:var(--text2)}
  .ds-pick-btn{width:22px;height:22px;border-radius:5px;border:1px solid var(--border2);background:var(--surface3,#2a2a2a);color:var(--text);font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;padding:0}
  .ds-pick-btn:hover{background:var(--blue);border-color:var(--blue);color:#fff}
  .ds-pick-num{font-size:14px;font-weight:800;color:var(--text);min-width:20px;text-align:center}
  .ds-close-btn{width:28px;height:28px;border-radius:6px;border:1px solid var(--border2);background:transparent;color:var(--text2);font-size:14px;cursor:pointer}
  .ds-close-btn:hover{background:var(--red);color:#fff;border-color:var(--red)}
  .ds-search-bar{padding:10px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px}
  .ds-search-input{flex:1;height:32px;border-radius:7px;border:1px solid var(--border2);background:var(--surface2);color:var(--text);font-size:12px;padding:0 10px;outline:none}
  .ds-search-input:focus{border-color:var(--blue)}
  .ds-count-badge{font-size:11px;color:var(--text3);white-space:nowrap}
  .ds-grid{padding:14px;display:grid;grid-template-columns:repeat(auto-fill,minmax(82px,1fr));gap:10px;overflow-y:auto;scrollbar-width:thin;flex:1}
  .ds-item{position:relative;cursor:pointer;display:flex;flex-direction:column;gap:3px;text-align:center;border-radius:8px;padding:4px;border:2px solid transparent;transition:border-color .12s,background .12s}
  .ds-item:hover{background:rgba(255,255,255,.05);border-color:var(--border2)}
  .ds-item.ds-selected{border-color:var(--gold);background:rgba(210,153,34,.12)}
  .ds-img{width:100%;aspect-ratio:2/3;border-radius:5px;background-size:cover;background-position:center;border:1px solid var(--border2);box-shadow:0 2px 8px rgba(0,0,0,.5);transition:transform .12s}
  .ds-item:hover .ds-img{transform:scale(1.03)}
  .ds-item.ds-selected .ds-img{box-shadow:0 0 0 2px var(--gold),0 2px 8px rgba(0,0,0,.5)}
  .ds-sel-badge{position:absolute;top:8px;right:8px;width:20px;height:20px;border-radius:50%;background:var(--gold);color:#111;font-size:11px;font-weight:900;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.6)}
  .ds-name{font-size:10px;color:var(--text2);line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ds-meta{font-size:9px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ds-empty{grid-column:1/-1;text-align:center;color:var(--text3);font-size:12px;padding:30px 0}
  .ds-footer{padding:12px 16px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px}
  .ds-sel-hint{font-size:11px;color:var(--text3);min-height:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ds-footer-btns{display:flex;gap:10px}
  .ds-btn{flex:1;height:34px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;transition:all .15s;border:1px solid var(--border2)}
  .ds-cancel-btn{background:var(--surface2);color:var(--text)}
  .ds-cancel-btn:hover{background:var(--border2)}
  .ds-confirm-btn{background:rgba(210,153,34,.1);color:var(--gold);border-color:rgba(210,153,34,.4);opacity:.5;cursor:not-allowed}
  .ds-confirm-btn.ds-btn-ready{opacity:1;cursor:pointer}
  .ds-confirm-btn.ds-btn-ready:hover{background:var(--gold);color:#111;border-color:var(--gold)}

  /* ── REMOTE CURSOR ── */
  #remote-cursor{position:fixed;pointer-events:none;z-index:7000;transition:left .05s,top .05s}
  .rcursor-dot{width:12px;height:12px;border-radius:50%;background:var(--red);opacity:.8}
  .rcursor-name{font-size:10px;color:var(--red);font-weight:700;margin-top:2px;white-space:nowrap}

  .remote-drag-ghost{
    position:fixed;pointer-events:none;z-index:6999;border-radius:5px;
    border:2px solid var(--red);
    box-shadow:0 0 16px rgba(218,54,51,.6),0 8px 32px rgba(0,0,0,.6);
    overflow:hidden;transition:left .04s linear,top .04s linear;opacity:.86;
  }
  .remote-drag-face{
    width:100%;height:100%;border-radius:3px;background-size:cover;background-position:center;
    transform:rotate(180deg);
  }
  .card-back-ghost{
    width:100%;height:100%;border-radius:3px;
    background-image:url("https://s6.imgcdn.dev/Ybr42q.jpg");
    background-size:cover;background-position:center;transform:rotate(180deg);
  }
  .ghost-label{
    position:absolute;bottom:3px;left:0;right:0;text-align:center;
    font-size:9px;font-weight:700;color:var(--red);
    background:rgba(0,0,0,.6);padding:1px 0;white-space:nowrap;overflow:hidden;
  }

  :global(::-webkit-scrollbar){width:3px;height:3px}
  :global(::-webkit-scrollbar-track){background:transparent}

  /* ── MULTI-SELECT ── */
  /* SELECTION BOX (กรอบเลือกการ์ด) */
  :global(.selection-box){
    position:absolute;
    border:2px dashed rgba(56,139,253,.8);
    background:rgba(56,139,253,.1);
    pointer-events:none;
    z-index:900;
    border-radius:3px;
  }
  /* การ์ดที่ถูกเลือก — ไฮไลท์สีฟ้า */
  :global(.card.selected){
    box-shadow:0 0 0 2px rgba(56,139,253,.9), 0 0 12px rgba(56,139,253,.5) !important;
    z-index:50 !important;
  }
  /* ctx menu rotate-all */
  :global(.ctx-rotate-all){color:#58a6ff;font-weight:700}
  :global(.ctx-rotate-all:hover){background:rgba(56,139,253,.15)!important}
</style>
