// CardDatabaseSystem.ts

export interface Card {
    id: string;
    cardId: string;
    name: string;
    type: string;
    cost: number;
    power: number;
    rarity: string;
    color: string;
    effect: string;
    art: string;
    imageUrl: string;
}

export const DEFAULT_CARD_DB: Card[] = [
    // TODO: Hardcode 20 cards
];

export const CARD_MAP: Record<string, Card> = {};

export function loadCardDatabase() {
    // TODO: Implement External JSON Loader via fetch()
}
