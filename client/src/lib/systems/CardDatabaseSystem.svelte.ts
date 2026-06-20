import type { CardData } from '../types';

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

const COLOR_MAP: Record<string, string> = {red:'#c0392b',green:'#27ae60',blue:'#2980b9',purple:'#8e44ad',black:'#2c3e50',yellow:'#d4ac0d',multicolor:'#7f8c8d'};

class CardDatabaseSystem {
  cardDb = $state<CardData[]>([...DEFAULT_CARD_DB]);
  cardMap = $state<Record<string, CardData>>(Object.fromEntries(DEFAULT_CARD_DB.map(c => [c.id, c])));
  dbLoaded = $state(false);

  rebuildMap() {
    const map: Record<string, CardData> = {};
    for (let i = 0; i < this.cardDb.length; i++) {
      const c = this.cardDb[i];
      map[c.id] = c;
    }
    this.cardMap = map;
  }

  colorToArt(color: string) {
    const f = String(color || '').split('/')[0].trim().toLowerCase();
    return COLOR_MAP[f] || '#34495e';
  }

  normalizeType(t: string) {
    const u = String(t || '').trim().toUpperCase();
    if (u === 'CHARACTER') return 'Character';
    if (u === 'LEADER') return 'Leader';
    if (u === 'EVENT') return 'Event';
    if (u === 'STAGE') return 'Stage';
    return t || 'Card';
  }

  async loadCardDB(addLogCallback: (msg: string, side: string) => void) {
    if (this.dbLoaded) return;
    try {
      const r = await fetch('/onepiece_full_onelog_translated.json');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const rows = await r.json();
      if (!Array.isArray(rows)) throw new Error('not array');
      const cards = rows.map((raw: any, i: number): CardData => {
        const cardId = String(raw.card_id || raw.id || raw.db_id || `json-${i}`);
        const uid = raw.db_id != null ? `db-${raw.db_id}` : cardId;
        return {
          id: uid, cardId,
          name: raw.name || cardId, type: this.normalizeType(raw.type),
          cost: parseInt(raw.cost) || 0, power: parseInt(raw.power) || 0,
          rarity: String(raw.rarity || 'C').toUpperCase(),
          color: raw.color || '', effect: raw.effect || '',
          art: this.colorToArt(raw.color), imageUrl: raw.image_url || '',
          attribute: raw.attribute || '', counter: raw.counter != null ? String(raw.counter) : '',
          feature: raw.feature || '', card_set: raw.card_set || '', life: raw.life != null ? String(raw.life) : '',
        };
      }).filter((c: CardData) => c.id && c.name);
      if (!cards.length) throw new Error('empty');
      this.cardDb = cards;
      this.rebuildMap();
      addLogCallback(`โหลด JSON ${this.cardDb.length} ใบ`, 'system');
    } catch (e: any) {
      this.cardDb = [...DEFAULT_CARD_DB];
      this.rebuildMap();
      addLogCallback(`ใช้เด็คตัวอย่าง (${e.message})`, 'system');
    }
    this.dbLoaded = true;
  }
}

export const cardDatabaseSystem = new CardDatabaseSystem();
