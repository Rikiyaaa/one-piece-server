/**
 * Card Interaction System
 */
export const CardInteractionSystem = {
    createCardEl(data: any, faceDown: boolean, owner: 'mine' | 'opp') {
        // Create DOM element for card
        return document.createElement('div');
    },

    setupCardInteraction(cid: string) {
        // Bind drag and drop, double-click, context menu
    }
};
