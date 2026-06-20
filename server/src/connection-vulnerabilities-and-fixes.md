# ช่องโหว่เรื่องการเชื่อมต่อ + วิธีแก้

> โปรเจกต์: Svelte + Colyseus Card Game
> วันที่วิเคราะห์: 2026-06-20

---

## สรุปปัญหาหลัก (จากที่ผู้ใช้รายงาน)

เมื่อกดรีเฟรชเว็บ:
- การ์ดที่วางอยู่บนบอร์ด **หายทั้งหมด**
- การ์ดบนมือ **หายทั้งหมด**
- กอง Deck / Don!! **ไม่หาย** (แต่เป็นเพียง label ของ Zone ที่ render ตลอดเวลา)
- จำนวนกองถูกรีเซ็ต (เช่น Deck count กลับเป็นค่า default)
- จั่วการ์ดแล้วขึ้นว่า "สำรับหมด!" เพราะ `myDeck` ว่าง

---

## ช่องโหว่และบั๊กทั้งหมด (เรียงตามความรุนแรง)

---

### 🔴 ช่องโหว่ #1: ไม่มี `beforeunload` → ส่ง `going_away` ไม่ได้ → Server ยุบห้องทันที

**ไฟล์ที่เกี่ยวข้อง:**
- `client/src/routes/+page.svelte` (บรรทัด ~502-572 onMount)
- `client/src/lib/systems/NetworkingSystem.svelte.ts` (บรรทัด 454-462)

**ปัญหา:**

`NetworkingSystem.svelte.ts` มี `_registerBeforeUnload()` ที่ส่ง `going_away` ไปยัง server ก่อนที่หน้าเว็บจะ refresh แต่ `+page.svelte` (ซึ่งเป็นไฟล์ที่ทำงานจริง) **ไม่เคยเรียก** `_registerBeforeUnload()` และก็ไม่มี `beforeunload` handler ของตัวเอง

เมื่อผู้เล่นกด F5:
1. หน้าเว็บเริ่ม unload → WebSocket ตัดการเชื่อมต่อ
2. Server ได้รับ `onLeave(client, consented=false)`
3. แต่ `goingAway` Set ไม่มี sessionId นี้ (เพราะไม่เคยส่ง `going_away` มา)
4. จึง `isRefresh = false` → เข้าเงื่อนไข `allowReconnection(client, 60)`
5. แต่ถ้า `onDestroy` ของ Svelte เรียก `room?.leave()` ก่อน (clean leave) → `consented = true`
6. Server เห็น `consented && !isRefresh` → **ยุบห้องทันที** (`this.disconnect()`)
7. เมื่อหน้าเว็บโหลดใหม่ → reconnect token ใช้ไม่ได้แล้วเพราะห้องถูกทำลาย

**วิธีแก้:**

เพิ่ม `beforeunload` handler ใน `+page.svelte` ใน onMount:

```typescript
// ใน onMount() หลังจากที่ room ถูกสร้างหรือ reconnect สำเร็จ
function registerBeforeUnload() {
  const handler = () => {
    if (room) room.send('going_away', {});
  };
  window.addEventListener('beforeunload', handler);
  return handler;
}

let unloadHandler: (() => void) | null = null;

// เมื่อ join/reconnect สำเร็จ:
unloadHandler = registerBeforeUnload();

// ใน onDestroy:
onDestroy(() => {
  if (unloadHandler) {
    window.removeEventListener('beforeunload', unloadHandler);
    unloadHandler = null;
  }
  // อย่าเรียก room?.leave() ถ้าต้องการให้ server รอ reconnect
  // ให้เรียกเฉพาะเมื่อผู้เล่นกด "ออกจากห้อง" จริงๆ
});
```

และแก้ `onDestroy` ให้ **ไม่เรียก** `room?.leave()` โดยอัตโนมัติ:

```typescript
onDestroy(() => {
  // ถ้าเป็น refresh → ส่ง going_away แล้ว → ไม่ต้อง leave
  // ถ้าเป็นการออกจริง → leaveRoom() จะเรียก room.leave() เอง
  // ถ้าเป็น component unmount อื่น → ควร leave
  if (unloadHandler) {
    window.removeEventListener('beforeunload', unloadHandler);
    unloadHandler = null;
  }
  // ไม่เรียก room?.leave() ที่นี่ — ปล่อยให้ server จัดการผ่าน allowReconnection
});
```

---

### 🔴 ช่องโหว่ #2: `onDestroy` เรียก `room?.leave()` → Server เข้าใจผิดว่าออกจริง

**ไฟล์ที่เกี่ยวข้อง:**
- `client/src/routes/+page.svelte` (บรรทัด 2558-2560)

**ปัญหา:**

```typescript
onDestroy(() => {
  room?.leave();
});
```

`room.leave()` เป็นการออกจากห้องแบบ "consented" (ตั้งใจออก) เมื่อ Svelte ทำลาย component จากการ refresh หน้าเว็บ `onDestroy` จะถูกเรียก และ `room.leave()` จะถูกส่งไปยัง server ทำให้ server เห็น `consented=true` และยุบห้องทันที

**วิธีแก้:**

แยก "ออกจากห้องจริง" กับ "component unmount จาก refresh":

```typescript
let isIntentionalLeave = false;

function leaveRoom() {
  isIntentionalLeave = true;
  if (unloadHandler) {
    window.removeEventListener('beforeunload', unloadHandler);
    unloadHandler = null;
  }
  room?.leave();
  room = null;
  gameStarted = false;
  clearReconnectInfo();
}

onDestroy(() => {
  if (isIntentionalLeave) {
    // ออกจริง → leave ไปแล้ว
    return;
  }
  // refresh/close → ส่ง going_away (ถ้ายังไม่ได้ส่ง)
  if (room) {
    room.send('going_away', {});
    // ไม่เรียก room.leave() — ปล่อยให้ server รอ reconnect
  }
});
```

---

### 🔴 ช่องโหว่ #3: DON Card ไม่ส่ง `cardId` → กู้คืนตอน Reconnect ไม่ได้

**ไฟล์ที่เกี่ยวข้อง:**
- `client/src/lib/systems/DonSystem.svelte.ts` (บรรทัด 69)
- `server/src/index.ts` (บรรทัด 232-244)
- `client/src/routes/+page.svelte` → `rebuildBoardFromState` (บรรทัด 834-845)

**ปัญหา:**

เมื่อสร้าง DON card ใหม่ จะส่งเฉพาะ `cid`, `x`, `y` ไปยัง server:

```typescript
// DonSystem.svelte.ts บรรทัด 69
networkingSystem.send('don_card_spawn', { cid, x: px, y: py });
// ❌ ไม่มี cardId!
```

Server จึงเก็บ `CardOnField` ที่ `cardId = ""`:

```typescript
// server/src/index.ts บรรทัด 232-244
this.onMessage("don_card_spawn", (client, data) => {
  const card = new CardOnField();
  card.id = data.cid;
  card.x = data.x;
  card.y = data.y;
  card.isDon = true;
  card.owner = client.sessionId;
  ps.field.set(data.cid, card);
  // ❌ card.cardId ไม่ถูก set → default เป็น ""
});
```

ตอน `rebuildBoardFromState` จะตรวจ `CARD_MAP[card.cardId]`:

```typescript
myPs.field.forEach((card: any, cid: string) => {
  const data = CARD_MAP[card.cardId]; // CARD_MAP[""] → undefined!
  if (!data) { return; } // ← DON cards ถูกข้ามทั้งหมด
  // ...
});
```

ผลลัพธ์: DON cards ที่วางอยู่บนบอร์ด **หายทั้งหมด** หลัง refresh

**วิธีแก้:**

**ฝั่ง Client** — ส่ง `cardId` ไปด้วย:

```typescript
// DonSystem.svelte.ts → spawnDonCard()
networkingSystem.send('don_card_spawn', { cid, cardId: 'don', x: px, y: py });
```

**ฝั่ง Server** — เก็บ `cardId` ด้วย:

```typescript
// server/src/index.ts
this.onMessage("don_card_spawn", (client, data) => {
  const ps = this.getPlayerState(client);
  if (ps) {
    const card = new CardOnField();
    card.id = data.cid;
    card.cardId = data.cardId || 'don';  // ✅ เก็บ cardId
    card.x = data.x;
    card.y = data.y;
    card.isDon = true;
    card.owner = client.sessionId;
    ps.field.set(data.cid, card);
  }
  relay(client, "don_card_spawn", data);
});
```

**ฝั่ง Client rebuild** — เพิ่ม fallback สำหรับ DON cards:

```typescript
// rebuildBoardFromState()
myPs.field.forEach((card: any, cid: string) => {
  // ✅ สำหรับ DON cards ใช้ hardcoded data แทน CARD_MAP lookup
  if (card.isDon) {
    cards[cid] = {
      cid,
      owner: 'mine',
      isDon: true,
      faceDown: false,
      tapped: card.isTapped,
      rotation: card.rotation,
      inHand: false,
      counter: card.counter || undefined,
      x: card.x,
      y: card.y,
      data: {
        name: 'DON!!',
        id: 'don',
        art: '#3a2a00',
        type: '',
        cost: 0,
        power: 0,
        rarity: '',
        color: '',
        effect: '',
      },
    };
    return;
  }
  const data = CARD_MAP[card.cardId];
  if (!data) return;
  // ... สร้าง card ปกติ
});
```

---

### 🟠 ช่องโหว่ #4: `buildDeck()` ไม่ได้ sync ไปยัง Server → Reconnect กู้ Deck ไม่ได้

**ไฟล์ที่เกี่ยวข้อง:**
- `client/src/lib/systems/DeckSystem.svelte.ts` (บรรทัด 15-37)
- `client/src/routes/+page.svelte` → `startGame()` (บรรทัด 908)

**ปัญหา:**

`buildDeck()` สร้าง `myDeck` ฝั่ง client แต่ **ไม่ได้เรียก** `syncDeckState()`:

```typescript
buildDeck(dbCards, dbDonCount) {
  gameCycleSystem.myDeck = [];
  // ... เพิ่มการ์ดลง myDeck ...
  gameCycleSystem.shuffle(gameCycleSystem.myDeck);
  gameCycleSystem.myDeckCount = gameCycleSystem.myDeck.length;
  // ❌ ไม่มี networkingSystem.syncDeckState()
}
```

Server จะได้รับเฉพาะ `deck_count` (จำนวน) แต่ไม่ได้รับ `sync_deck` (card IDs):

```typescript
// startGame() ส่งแค่ count:
setTimeout(() => send('deck_count', {count: myDeck.length}), 700);
```

ผลลัพธ์: `PlayerState.deck` ใน server เป็น ArraySchema ว่าง → ตอน reconnect `myPs.deck` ว่าง → `myDeck` กู้คืนไม่ได้ → จั่วการ์ดไม่ได้

`syncDeckState()` จะถูกเรียกครั้งแรกเมื่อ `drawCard()` ทำงาน แต่ถ้าผู้เล่น refresh ก่อนจั่วเลย server จะไม่มี deck data เลย

**วิธีแก้:**

เพิ่ม `syncDeckState()` หลัง `buildDeck()`:

```typescript
// ใน startGame() / resetBoard() หลัง buildDeck():
buildDeck();
networkingSystem.syncDeckState();  // ✅ sync deck ไปยัง server ทันที
networkingSystem.syncHandState();  // ✅ sync hand ด้วย (ตอนแรกว่างแต่ก็ไม่เสียหาย)
```

หรือใน `DeckSystem.buildDeck()`:

```typescript
buildDeck(dbCards: Record<string, number>, dbDonCount: number) {
  gameCycleSystem.myDeck = [];
  // ... เพิ่มการ์ด ...
  gameCycleSystem.shuffle(gameCycleSystem.myDeck);
  gameCycleSystem.myDeckCount = gameCycleSystem.myDeck.length;
  networkingSystem.syncDeckState();  // ✅ sync ทันทีหลังสร้าง deck
}
```

---

### 🟠 ช่องโหว่ #5: สถานะ Dual Architecture — ข้อมูลไม่ซิงค์กัน

**ไฟล์ที่เกี่ยวข้อง:**
- `client/src/routes/+page.svelte` (3766 บรรทัด, มี state ของตัวเอง)
- `client/src/lib/systems/*.svelte.ts` (มี state แยกต่างหาก)

**ปัญหา:**

`+page.svelte` มี state ของตัวเอง:
- `cards`, `myHand`, `myDeck`, `myTrash`, `myLifeCards`
- `CARD_MAP`, `CARD_DB`
- `myLife`, `oppLife`, `myDon`, `oppDon`, etc.

ในขณะที่ระบบ modular ก็มี state ของตัวเอง:
- `cardStateSystem.cards`, `gameCycleSystem.myHand`, `gameCycleSystem.myDeck`
- `cardDatabaseSystem.cardMap`, `cardDatabaseSystem.cardDb`
- `gameCycleSystem.myLife`, `gameCycleSystem.oppLife`, etc.

เมื่อ `+page.svelte` ทำงาน มันจะอัพเดท state ของตัวเอง แต่ **ไม่ได้อัพเดท state ของ systems** และในทางกลับกัน ถ้า systems ทำงาน มันก็ไม่ได้อัพเดท state ของ page

ตัวอย่าง:
- Page สร้างการ์ดด้วย `createCardState()` ของ page → `cards[cid]` ของ page ถูกเพิ่ม
- แต่ `cardStateSystem.cards[cid]` ไม่ถูกเพิ่ม
- เมื่อ `NetworkingSystem.rebuildBoardFromState()` ทำงาน มันอัพเดท `cardStateSystem.cards` แต่ไม่ได้อัพเดท page's `cards`
- ผลลัพธ์: การ์ดหายเพราะ page อ่านจาก `cards` ของตัวเอง ซึ่งไม่ถูกอัพเดท

**วิธีแก้ (ระยะยาว):**

ย้าย logic ทั้งหมดจาก `+page.svelte` ไปยัง systems แล้วให้ page เป็นเพียง view layer:

```
+page.svelte (View only)
  ├── อ่าน state จาก systems
  ├── เรียก methods ของ systems
  └── ไม่มี state ของตัวเอง
```

**วิธีแก้ (ระยะสั้น):**

ให้ page import และใช้ state จาก systems โดยตรง:

```svelte
<script>
  import { cardStateSystem } from '$lib/systems/CardStateSystem.svelte';
  import { gameCycleSystem } from '$lib/systems/GameCycleSystem.svelte';

  // ใช้ reactive state จาก systems แทนสร้างใหม่
  let cards = $derived(cardStateSystem.cards);
  let myHand = $derived(gameCycleSystem.myHand);
  let myDeck = $derived(gameCycleSystem.myDeck);
  // ... ฯลฯ
</script>
```

---

### 🟠 ช่องโหว่ #6: Reconnect Token หมดอายุไม่ตรงกัน

**ไฟล์ที่เกี่ยวข้อง:**
- `client/src/routes/+page.svelte` (บรรทัด 488) — 5 นาที
- `client/src/lib/systems/NetworkingSystem.svelte.ts` (บรรทัด 81) — 10 นาที

**ปัญหา:**

```typescript
// +page.svelte
if (Date.now() - (parsed.savedAt ?? 0) > 5 * 60 * 1000) { // 5 นาที

// NetworkingSystem.svelte.ts
if (Date.now() - (parsed.savedAt ?? 0) > 10 * 60 * 1000) { // 10 นาที
```

ถ้า page ใช้ logic ของตัวเอง มันจะหมดอายุเร็วกว่า ทำให้ reconnect ล้มเหลวแม้ server ยังรออยู่

**วิธีแก้:**

ใช้ค่าเดียวกันทั้งสองที่ หรือกำหนดเป็น constant:

```typescript
// constants.ts หรือไฟล์ร่วม
export const RECONNECT_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 นาที

// +page.svelte และ NetworkingSystem.svelte.ts ใช้ค่าเดียวกัน
import { RECONNECT_TOKEN_TTL_MS } from './constants';
```

---

### 🟠 ช่องโหว่ #7: Race Condition — `assign_role` มาก่อน `setupRoom()`

**ไฟล์ที่เกี่ยวข้อง:**
- `client/src/routes/+page.svelte` (บรรทัด 536-540)

**ปัญหา:**

```typescript
// onMount
room = await client.reconnect<GameState>(saved.token, GameState);
// reconnect() resolve → server อาจส่ง assign_role มาแล้ว
setupRoom(); // ถ้า assign_role มาก่อนนี้ → handler ยังไม่ถูกลงทะเบียน → ข้อความสูญหาย
```

เมื่อ `assign_role` สูญหาย:
- `client_ready` ไม่ถูกส่ง
- Server ไม่ส่ง `game_restore`
- (แต่ onMount จัดการ rebuild เองอยู่แล้ว จึงอาจไม่เห็นปัญหาชัดเจน)

**วิธีแก้:**

ลงทะเบียน message handlers ก่อน reconnect หรือจัดการ message queue:

```typescript
// วิธีที่ 1: สร้าง handler ก่อน reconnect
const tempHandlers: Array<{type: string, data: any}> = [];
const originalOnMessage = room?.onMessage?.bind(room);

// วิธีที่ 2: ส่ง client_ready ใน onMount หลัง setupRoom() เสมอ
room = await client.reconnect<GameState>(saved.token, GameState);
setupRoom();
// ส่ง client_ready อีกครั้งเพื่อให้แน่ใจ
room.send('client_ready', {});
```

---

### 🟡 ช่องโหว่ #8: บั๊กใน `rebuildBoardFromState` — เช็คผิดตัวแปร

**ไฟล์ที่เกี่ยวข้อง:**
- `client/src/routes/+page.svelte` (บรรทัด ~880)

**ปัญหา:**

```typescript
// กู้ life cards
const savedLife: string[] = Array.from(myPs.lifeCards ?? []);
if (savedDeck.length > 0) {  // ❌ ผิด! ควรเป็น savedLife.length > 0
  myLifeCards = [...savedLife];
}
```

ตรวจสอบ `savedDeck.length` แทนที่จะเป็น `savedLife.length` ทำให้ life cards กู้คืนผิดพลาด

**วิธีแก้:**

```typescript
const savedLife: string[] = Array.from(myPs.lifeCards ?? []);
if (savedLife.length > 0) {  // ✅ แก้เป็น savedLife
  myLifeCards = [...savedLife];
}
```

---

### 🟡 ช่องโหว่ #9: ไม่มี Server-side Validation — Client เป็น Authority

**ไฟล์ที่เกี่ยวข้อง:**
- `server/src/index.ts` — ทุก message handler

**ปัญหา:**

Server เป็นแค่ relay ไม่ validate logic เกม:
- ผู้เล่นคนใดก็ได้สามารถส่ง `card_spawn` เพื่อสร้างการ์ดไม่จำกัด
- ผู้เล่นสามารถเปลี่ยน `life_change` ของฝั่งตรงข้าม
- ผู้เล่นสามารถ `don_change` ให้ตัวเองมี DON ไม่จำกัด
- ไม่มีการตรวจสอบว่าการ์ดที่ spawn มาอยู่ใน deck จริงหรือไม่

**วิธีแก้ (เบื้องต้น):**

เพิ่ม validation ขั้นพื้นฐานใน server:

```typescript
this.onMessage("card_spawn", (client, data) => {
  const ps = this.getPlayerState(client);
  if (!ps) return;
  // ✅ ตรวจสอบว่าการ์ดนี้ไม่ได้อยู่บนบอร์ดแล้ว
  if (ps.field.has(data.cid)) return;
  // ✅ ตรวจสอบจำนวนการ์ดบนบอร์ดไม่เกินที่กำหนด
  if (ps.field.size > 20) return;
  // ... สร้าง CardOnField และ relay
});

this.onMessage("don_change", (client, data) => {
  const ps = this.getPlayerState(client);
  if (!ps) return;
  // ✅ ป้องกันค่าติดลบหรือเกินจำนวน
  if (data.total < 0 || data.spent < 0 || data.spent > data.total) return;
  ps.donTotal = data.total;
  ps.donSpent = data.spent;
  relay(client, "don_change", data);
});
```

---

### 🟡 ช่องโหว่ #10: `cardDatabaseSystem.cardMap` กับ `CARD_MAP` ของ Page แยกกัน

**ไฟล์ที่เกี่ยวข้อง:**
- `client/src/routes/+page.svelte` — `CARD_MAP`
- `client/src/lib/systems/CardDatabaseSystem.svelte.ts` — `cardDatabaseSystem.cardMap`

**ปัญหา:**

Page มี `CARD_MAP` ของตัวเองที่สร้างจาก `loadCardDB()` ของ page
Systems ใช้ `cardDatabaseSystem.cardMap` ที่สร้างจาก `cardDatabaseSystem.loadCardDB()`

ถ้าทั้งสองโหลดจากไฟล์ JSON เดียวกัน ID ควรตรงกัน แต่:
- Page โหลดก่อนใน onMount
- Systems อาจโหลดทีหลัง
- ถ้าการแปลง ID ไม่เหมือนกัน → lookup จะ fail

**วิธีแก้:**

ใช้ `cardDatabaseSystem.cardMap` ที่เดียว และเอา `CARD_MAP` ของ page ออก:

```typescript
// +page.svelte
import { cardDatabaseSystem } from '$lib/systems/CardDatabaseSystem.svelte';

// แทนที่ CARD_MAP ของ page ด้วย:
const CARD_MAP = $derived(cardDatabaseSystem.cardMap);
```

---

### 🟡 ช่องโหว่ #11: DON!! Attach System ใช้ Method ที่ไม่มีอยู่

**ไฟล์ที่เกี่ยวข้อง:**
- `client/src/lib/systems/DonSystem.svelte.ts` (บรรทัด 82-87, 106, 111-113, 120-125, 142, 190-194)
- `client/src/lib/systems/CardStateSystem.svelte.ts`

**ปัญหา:**

`DonSystem.svelte.ts` เรียก methods/properties บน `cardStateSystem` ที่ **ไม่มีอยู่จริง**:

| อ้างอิงใน DonSystem | มีใน CardStateSystem? |
|---|---|
| `cardStateSystem.donAttachMap` | ❌ ไม่มี |
| `cardStateSystem.donAttachPicking` | ❌ ไม่มี |
| `cardStateSystem.getDonsAttachedTo()` | ❌ ไม่มี |
| `cardStateSystem.DON_ATTACH_OFFSET_X` | ❌ ไม่มี |
| `cardStateSystem.DON_ATTACH_OFFSET_Y` | ❌ ไม่มี |
| `cardStateSystem.detachDon()` | ❌ ไม่มี |

เมื่อผู้เล่นพยายามแปะ DON!! กับการ์ด → runtime error → ฟีเจอร์ใช้ไม่ได้

**วิธีแก้:**

เพิ่ม properties และ methods ที่ขาดหายไปใน `CardStateSystem`:

```typescript
// CardStateSystem.svelte.ts
class CardStateSystem {
  // ... existing code ...

  // ✅ เพิ่ม DON attach state
  donAttachMap = $state<Record<string, string>>({});  // donCid → targetCid
  donAttachPicking = $state<string | null>(null);
  static DON_ATTACH_OFFSET_X = 15;
  static DON_ATTACH_OFFSET_Y = 20;

  getDonsAttachedTo(targetCid: string): string[] {
    return Object.entries(this.donAttachMap)
      .filter(([_, target]) => target === targetCid)
      .map(([donCid]) => donCid);
  }

  detachDon(donCid: string): string | null {
    const targetCid = this.donAttachMap[donCid];
    if (!targetCid) return null;
    const newMap = { ...this.donAttachMap };
    delete newMap[donCid];
    this.donAttachMap = newMap;
    return targetCid;
  }
}
```

---

### 🟢 ช่องโหว่ #12: Reconnect กลับมาแล้วไม่เตือนคู่ต่อสู้ให้ชัดเจน

**ไฟล์ที่เกี่ยวข้อง:**
- `server/src/index.ts` (บรรทัด 464-473)

**ปัญหา:**

เมื่อผู้เล่น reconnect สำเร็จ server broadcast `player_reconnected` แต่:
- ฝั่ง client แสดงแค่ log message เล็กๆ
- ไม่มี UI indicator ว่า "กำลังรอคู่ต่อสู้เชื่อมต่อกลับ" ตอนที่อีกฝั่งหลุด
- ไม่มี countdown แสดงเวลาที่เหลือในการ reconnect (60s)

**วิธีแก้:**

เพิ่ม UI overlay แสดงสถานะการเชื่อมต่อของคู่ต่อสู้:

```svelte
{#if !connected && gameStarted}
  <div class="reconnect-overlay">
    คู่ต่อสู้หลุดการเชื่อมต่อ... รอการเชื่อมต่อกลับ
    <span class="countdown">{reconnectCountdown}s</span>
  </div>
{/if}
```

---

## สรุปลำดับความสำคัญในการแก้ไข

| ลำดับ | ช่องโหว่ | ความรุนแรง | ผลกระทบโดยตรงต่อปัญหา "การ์ดหายตอน refresh" |
|---:|---|---|---|
| 1 | #1 ไม่มี beforeunload/going_away | 🔴 วิกฤต | ⭐⭐⭐ ห้องถูกยุบ → กู้คืนไม่ได้เลย |
| 2 | #2 onDestroy เรียก room.leave() | 🔴 วิกฤต | ⭐⭐⭐ ห้องถูกยุบ → กู้คืนไม่ได้เลย |
| 3 | #3 DON card ไม่ส่ง cardId | 🔴 วิกฤต | ⭐⭐⭐ DON cards บนบอร์ดหายหลัง refresh |
| 4 | #4 buildDeck ไม่ sync | 🟠 สูง | ⭐⭐⭐ กอง deck ว่าง → จั่วไม่ได้หลัง refresh |
| 5 | #5 Dual Architecture | 🟠 สูง | ⭐⭐ state ไม่ sync → การ์ดหาย |
| 6 | #6 Token หมดอายุไม่ตรง | 🟠 สูง | ⭐⭐ reconnect ล้มเหลว |
| 7 | #7 Race Condition | 🟠 สูง | ⭐ client_ready สูญหาย |
| 8 | #8 เช็คผิดตัวแปร | 🟡 กลาง | ⭐ life cards กู้คืนผิด |
| 9 | #9 ไม่มี Server Validation | 🟡 กลาง | — (ด้านความปลอดภัย) |
| 10 | #10 cardMap ซ้ำซ้อน | 🟡 กลาง | ⭐ lookup fail → การ์ดหาย |
| 11 | #11 DON Attach พัง | 🟡 กลาง | — (ฟีเจอร์ใช้ไม่ได้) |
| 12 | #12 ไม่เตือนคู่ต่อสู้ | 🟢 ต่ำ | — (UX) |

---

## แผนภาพ: สาเหตุหลักของ "การ์ดหายตอน refresh"

```
ผู้เล่นกด F5 (Refresh)
        │
        ▼
  beforeunload ไม่มี handler
        │
        ▼
  going_away ไม่ถูกส่งไป server
        │
        ▼
  onDestroy → room.leave() (consented=true)
        │
        ▼
  Server: consented && !isRefresh → ยุบห้องทันที
        │
        ▼
  หน้าเว็บโหลดใหม่ → reconnect token ใช้ไม่ได้ (ห้องหายแล้ว)
        │
        ▼
  กลับไปหน้า Lobby → การ์ดทั้งหมดหาย
```

**ถ้า reconnect สำเร็จ (กรณีที่ onDestroy ไม่ทันทำงาน):**

```
reconnect สำเร็จ → rebuildBoardFromState()
        │
        ├── myPs.field.forEach → CARD_MAP[card.cardId]
        │       │
        │       ├── card.cardId = "" (DON cards) → ❌ undefined → ข้าม
        │       └── card.cardId = "db-123" → ✅ พบ → สร้างการ์ด
        │
        ├── myPs.hand → CARD_MAP[cardId] → ถ้า sync_hand ไม่เคยส่ง → ว่าง
        │
        ├── myPs.deck → ถ้า sync_deck ไม่เคยส่ง → ว่าง → จั่วไม่ได้
        │
        └── myPs.lifeCards → เช็คผิดตัวแปร (savedDeck แทน savedLife)
```

---

## โค้ดตัวอย่าง: แก้ไขทั้งหมดใน `+page.svelte`

```typescript
// ════════════════════════════════════════════════
//   1. เพิ่ม beforeunload + แก้ onDestroy
// ════════════════════════════════════════════════

let isIntentionalLeave = false;
let unloadHandler: (() => void) | null = null;

function registerBeforeUnload() {
  if (unloadHandler) return; // ลงทะเบียนครั้งเดียว
  const handler = () => {
    if (room) room.send('going_away', {});
  };
  window.addEventListener('beforeunload', handler);
  unloadHandler = handler;
}

function unregisterBeforeUnload() {
  if (unloadHandler) {
    window.removeEventListener('beforeunload', unloadHandler);
    unloadHandler = null;
  }
}

// เรียกหลังจาก join/reconnect สำเร็จ:
// registerBeforeUnload();

function leaveRoom() {
  isIntentionalLeave = true;
  unregisterBeforeUnload();
  room?.leave();
  room = null;
  gameStarted = false;
  lobbyView = 'form';
  connected = false;
  matchInitialized = false;
  lobbyFading = false;
  clearReconnectInfo();
}

onDestroy(() => {
  if (isIntentionalLeave) return;
  // refresh/close → ส่ง going_away แต่ไม่ leave
  if (room) room.send('going_away', {});
  unregisterBeforeUnload();
});

// ════════════════════════════════════════════════
//   2. แก้ rebuildBoardFromState
// ════════════════════════════════════════════════

function rebuildBoardFromState(state: any) {
  if (!state) return;
  cards = {};
  nextCid = 1;

  const amPlayer1 = room ? state.player1SessionId === room.sessionId : isHost;
  const myPs = amPlayer1 ? state.player1 : state.player2;
  const oppPs = amPlayer1 ? state.player2 : state.player1;
  if (!myPs || !oppPs) return;
  isHost = amPlayer1;

  myLife = myPs.life; oppLife = oppPs.life;
  myDon = myPs.donTotal; myDonSpent = myPs.donSpent;
  oppDon = oppPs.donTotal; oppDonSpent = oppPs.donSpent;
  oppHandCount = oppPs.handCount;
  myDeckCount = myPs.deckCount; oppDeckCount = oppPs.deckCount;
  phase = PHASES.indexOf(state.phase) >= 0 ? PHASES.indexOf(state.phase) : 0;
  turn = state.turn;

  // ✅ กู้การ์ดบนบอร์ด (field) — รองรับ DON cards
  myPs.field.forEach((card: any, cid: string) => {
    if (card.isDon) {
      // DON card — ใช้ hardcoded data
      cards[cid] = {
        cid, owner: 'mine', isDon: true,
        faceDown: false, tapped: card.isTapped,
        rotation: card.rotation, inHand: false,
        counter: card.counter || undefined,
        x: card.x, y: card.y,
        data: { name: 'DON!!', id: 'don', art: '#3a2a00', type: '', cost: 0, power: 0, rarity: '', color: '', effect: '' },
      };
    } else {
      const data = CARD_MAP[card.cardId];
      if (!data) return;
      cards[cid] = {
        data, cid, owner: 'mine', faceDown: card.faceDown,
        tapped: card.isTapped, rotation: card.rotation,
        inHand: false, isDon: false,
        counter: card.counter || undefined,
        x: card.x, y: card.y,
      };
    }
    const n = parseInt(cid.replace(/\D/g, ''), 10);
    if (!isNaN(n) && n >= nextCid) nextCid = n + 1;
  });

  // ✅ กู้ opp field (เหมือนเดิม แต่เพิ่ม DON handling)
  oppPs.field.forEach((card: any, cid: string) => {
    if (card.isDon) {
      const { x, y } = remoteM(card.x, card.y);
      cards[cid] = {
        cid, owner: 'opp', isDon: true,
        faceDown: false, tapped: card.isTapped,
        rotation: card.rotation, inHand: false,
        counter: card.counter || undefined, x, y,
        data: { name: 'DON!!', id: 'don', art: '#3a2a00', type: '', cost: 0, power: 0, rarity: '', color: '', effect: '' },
      };
    } else {
      const data = CARD_MAP[card.cardId];
      if (!data) return;
      const { x, y } = remoteM(card.x, card.y);
      cards[cid] = {
        data, cid, owner: 'opp', faceDown: card.faceDown,
        tapped: card.isTapped, rotation: card.rotation,
        inHand: false, isDon: false,
        counter: card.counter || undefined, x, y,
      };
    }
  });

  // ✅ กู้มือ (hand)
  const savedHand: string[] = Array.from(myPs.hand ?? []);
  myHand = [];
  savedHand.forEach((cardId: string) => {
    const data = CARD_MAP[cardId]; if (!data) return;
    const cid = createCardState(data, false, 'mine');
    cards[cid].inHand = true;
    myHand.push(cid);
  });
  myHandCount = myHand.length;

  // ✅ กู้กองสำรับ (deck) — ไม่มีเงื่อนไข length > 0 (ถ้าว่างก็ตั้งค่าว่าง)
  const savedDeck: string[] = Array.from(myPs.deck ?? []);
  myDeck = [...savedDeck];
  myDeckCount = myDeck.length;

  // ✅ แก้บั๊ก: เช็ค savedLife แทน savedDeck
  const savedLife: string[] = Array.from(myPs.lifeCards ?? []);
  myLifeCards = [...savedLife];

  const savedTrash: string[] = Array.from(myPs.trashCards ?? []);
  myTrash = [...savedTrash];
}

// ════════════════════════════════════════════════
//   3. เพิ่ม syncDeckState หลัง buildDeck
// ════════════════════════════════════════════════

// ใน startGame() และ resetBoard():
buildDeck();
syncDeckState();    // ✅ เพิ่มบรรทัดนี้
syncLifeCards();    // ✅ เพิ่มบรรทัดนี้
```

---

## โค้ดตัวอย่าง: แก้ไขฝั่ง Server

```typescript
// ════════════════════════════════════════════════
//   1. เก็บ cardId สำหรับ DON cards
// ════════════════════════════════════════════════

this.onMessage("don_card_spawn", (client, data) => {
  const ps = this.getPlayerState(client);
  if (ps) {
    const card = new CardOnField();
    card.id = data.cid;
    card.cardId = data.cardId || 'don';  // ✅ เก็บ cardId
    card.x = data.x;
    card.y = data.y;
    card.isDon = true;
    card.owner = client.sessionId;
    ps.field.set(data.cid, card);
  }
  relay(client, "don_card_spawn", data);
});
```

---

*สิ้นสุดเอกสาร*
