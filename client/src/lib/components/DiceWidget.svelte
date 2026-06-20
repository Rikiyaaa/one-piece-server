<script lang="ts">
  import { onDestroy } from 'svelte';

  let {
    numDice = 2,
    sides = 6,
    onRollDone = (_total: number, _values: number[]) => {},
  }: {
    numDice?: number;
    sides?: number;
    onRollDone?: (total: number, values: number[]) => void;
  } = $props();

  const FACE_ROT: Record<number, [number, number]> = {
    1: [0,    0  ],
    2: [-90,  0  ],
    3: [0,   -90 ],
    4: [0,    90 ],
    5: [90,   0  ],
    6: [0,   180 ],
  };

  const DOT_MAP: Record<number,[number,number][]> = {
    1: [[50,50]],
    2: [[30,30],[70,70]],
    3: [[30,30],[50,50],[70,70]],
    4: [[30,30],[70,30],[30,70],[70,70]],
    5: [[30,25],[70,25],[50,50],[30,75],[70,75]],
    6: [[25,22],[75,22],[25,50],[75,50],[25,78],[75,78]],
  };

  const FACE_DEFS = [
    { xfm:`rotateY(0deg) translateZ(45px)`,   val:1 },
    { xfm:`rotateY(180deg) translateZ(45px)`, val:6 },
    { xfm:`rotateX(90deg) translateZ(45px)`,  val:2 },
    { xfm:`rotateX(-90deg) translateZ(45px)`, val:5 },
    { xfm:`rotateY(-90deg) translateZ(45px)`, val:3 },
    { xfm:`rotateY(90deg) translateZ(45px)`,  val:4 },
  ];

  let values     = $state<number[]>(Array.from({ length: numDice }, () => 1));
  let rotations  = $state<[number,number][]>(Array.from({ length: numDice }, () => [0,0]));
  let rolling    = $state(false);
  let show       = $state(false);
  let finalTotal = $state(0);   // ← เก็บ total จริงๆ ที่คำนวณได้จาก final array

  let portalEl: HTMLDivElement | null = null;

  function removePortal() {
    if (portalEl?.parentNode) portalEl.parentNode.removeChild(portalEl);
    portalEl = null;
  }
  onDestroy(removePortal);

  function randFace() { return Math.floor(Math.random() * sides) + 1; }
  function faceRot(v: number): [number,number] { return FACE_ROT[v] ?? [0,0]; }

  function dotSvg(dots: [number,number][]) {
    return `<svg viewBox="0 0 100 100" style="width:72px;height:72px">
      ${dots.map(([cx,cy]) => `<circle cx="${cx}" cy="${cy}" r="10" fill="#1a1a2e"/>`).join('')}
    </svg>`;
  }

  function dieHtml(rx: number, ry: number, isRolling: boolean) {
    const facesHtml = FACE_DEFS.map(f => `
      <div style="position:absolute;width:90px;height:90px;border-radius:14px;
        background:#f5f0e8;border:2px solid rgba(0,0,0,0.08);
        display:flex;align-items:center;justify-content:center;
        transform:${f.xfm};box-shadow:inset 0 2px 4px rgba(0,0,0,0.1);">
        ${sides===6 ? dotSvg(DOT_MAP[f.val]??[[50,50]]) : `<span style="font-size:32px;font-weight:900;color:#1a1a2e">${f.val}</span>`}
      </div>`).join('');
    return `
      <div style="width:90px;height:90px;perspective:340px">
        <div style="width:90px;height:90px;position:relative;transform-style:preserve-3d;
          transform:rotateX(${rx}deg) rotateY(${ry}deg);
          transition:${isRolling ? 'none' : 'transform 0.35s ease-out'};">
          ${facesHtml}
        </div>
      </div>`;
  }

  // รับทุก argument โดยตรง — ไม่ใช้ closure เพื่อป้องกัน stale value
  function renderPortal(
    vals: number[],
    rots: [number,number][],
    isRolling: boolean,
    total: number
  ) {
    if (!portalEl) {
      portalEl = document.createElement('div');
      document.body.appendChild(portalEl);
    }
    const diceHtml = vals.map((v, i) => {
      const [rx, ry] = isRolling ? (rots[i] ?? [0,0]) : faceRot(v);
      return dieHtml(rx, ry, isRolling);
    }).join('');

    portalEl.innerHTML = `
      <div style="position:fixed;inset:0;z-index:99999;
        display:flex;align-items:center;justify-content:center;
        background:rgba(0,0,0,0.6);backdrop-filter:blur(6px);">
        <div style="display:flex;flex-direction:column;align-items:center;gap:28px;
          padding:48px 64px;border-radius:24px;
          background:rgba(13,17,27,0.95);
          border:1px solid rgba(61,139,255,0.3);
          box-shadow:0 0 80px rgba(61,139,255,0.12),0 32px 64px rgba(0,0,0,0.7);">
          <div style="font-size:13px;font-weight:700;color:#8b99b5;letter-spacing:2px;text-transform:uppercase">
            ${isRolling ? '🎲 กำลังทอย...' : '🎲 ผลลัพธ์'}
          </div>
          <div style="display:flex;gap:32px;align-items:center;justify-content:center;flex-wrap:wrap">
            ${diceHtml}
          </div>
        </div>
      </div>`;
  }

  $effect(() => {
    if (show) {
      // อ่านค่า reactive โดยตรงจาก $state แล้วส่งเป็น args
      renderPortal(values, rotations, rolling, finalTotal);
    } else {
      if (portalEl) portalEl.innerHTML = '';
    }
  });

  export function roll(preset?: number[]) {
    if (rolling) return;
    rolling = true;
    show    = true;

    const TOTAL_MS = 1600;
    const TICK_MS  = 60;
    let elapsed    = 0;
    const n        = numDice;

    const baseRx = Array.from({ length: n }, () => Math.random() * 900 + 540);
    const baseRy = Array.from({ length: n }, () => Math.random() * 900 + 540);

    const timer = setInterval(() => {
      elapsed += TICK_MS;
      const ease = 1 - Math.pow(elapsed / TOTAL_MS, 0.5);

      rotations = Array.from({ length: n }, (_, i) => [
        baseRx[i] * ease,
        baseRy[i] * ease,
      ]) as [number,number][];

      values = Array.from({ length: n }, () => randFace());

      if (elapsed >= TOTAL_MS) {
        clearInterval(timer);

        const final = (preset && preset.length === n)
          ? preset
          : Array.from({ length: n }, () => randFace());

        // คำนวณ total จาก final array ตรงๆ แล้วเก็บใน state แยก
        const total = final.reduce((s, v) => s + v, 0);
        finalTotal = total;        // ← set ก่อน

        rotations = final.map(v => faceRot(v)) as [number,number][];
        values    = [...final];    // spread เพื่อให้ $effect detect ว่า reference เปลี่ยน
        rolling   = false;

        onRollDone(total, final);

        setTimeout(() => { show = false; }, 3000);
      }
    }, TICK_MS);
  }
</script>
