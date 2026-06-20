export interface CardData {
  id: string;
  cardId?: string;
  name: string;
  type: string;
  cost: number;
  power: number;
  rarity: string;
  color: string;
  effect: string;
  art: string;
  imageUrl?: string;
  searchName?: string; // Pre-lowercased for fast filtering
  attribute?: string;
  counter?: string;
  feature?: string;
  card_set?: string;
  life?: string;
}

export interface CardState {
  el?: HTMLElement;
  data: CardData;
  cid: string;
  owner: string;
  faceDown: boolean;
  tapped: boolean;
  rotation: number;
  inHand: boolean;
  isDon?: boolean;
  counter?: number;
  spawning?: boolean;
  dropAnim?: boolean;
  x?: number;
  y?: number;
  zoneId?: string;
}

export interface AttackLine {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  owner: 'mine' | 'opp';
  createdAt: number;
}

export interface Zone {
  id: string;
  side: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  snap: 'center' | 'grid';
  cols?: number;
  rows?: number;
  count?: boolean;
}
