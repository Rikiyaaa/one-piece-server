// DeckBuilderSystem.ts

export interface DeckState {
    leader: string | null;
    cards: Record<string, number>;
}

export const DB_STATE: DeckState = {
    leader: null,
    cards: {}
};

export function initDeckBuilder() {
    // TODO: Implement Deck Builder features
}
