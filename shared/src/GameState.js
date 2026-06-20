"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameState = exports.PlayerState = exports.CardOnField = void 0;
const schema_1 = require("@colyseus/schema");
class CardOnField extends schema_1.Schema {
    id = "";
    cardId = "";
    x = 0;
    y = 0;
    faceDown = false;
    rotation = 0;
    isTapped = false;
    owner = ""; // session ID
    isDon = false;
    counter = 0;
}
exports.CardOnField = CardOnField;
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], CardOnField.prototype, "id", void 0);
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], CardOnField.prototype, "cardId", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], CardOnField.prototype, "x", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], CardOnField.prototype, "y", void 0);
__decorate([
    (0, schema_1.type)("boolean"),
    __metadata("design:type", Boolean)
], CardOnField.prototype, "faceDown", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], CardOnField.prototype, "rotation", void 0);
__decorate([
    (0, schema_1.type)("boolean"),
    __metadata("design:type", Boolean)
], CardOnField.prototype, "isTapped", void 0);
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], CardOnField.prototype, "owner", void 0);
__decorate([
    (0, schema_1.type)("boolean"),
    __metadata("design:type", Boolean)
], CardOnField.prototype, "isDon", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], CardOnField.prototype, "counter", void 0);
class PlayerState extends schema_1.Schema {
    name = "Player";
    life = 5;
    donTotal = 10;
    donSpent = 0;
    handCount = 0;
    deckCount = 50;
    field = new schema_1.MapSchema();
    // ── เพิ่มเพื่อ reconnect recovery ──
    hand = new schema_1.ArraySchema(); // cardId ในมือ
    deck = new schema_1.ArraySchema(); // cardId ในกอง (top = index 0)
    lifeCards = new schema_1.ArraySchema(); // cardId ในโซน life
    trashCards = new schema_1.ArraySchema(); // cardId ในทิ้ง
}
exports.PlayerState = PlayerState;
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], PlayerState.prototype, "name", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], PlayerState.prototype, "life", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], PlayerState.prototype, "donTotal", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], PlayerState.prototype, "donSpent", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], PlayerState.prototype, "handCount", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], PlayerState.prototype, "deckCount", void 0);
__decorate([
    (0, schema_1.type)({ map: CardOnField }),
    __metadata("design:type", Object)
], PlayerState.prototype, "field", void 0);
__decorate([
    (0, schema_1.type)(["string"]),
    __metadata("design:type", Object)
], PlayerState.prototype, "hand", void 0);
__decorate([
    (0, schema_1.type)(["string"]),
    __metadata("design:type", Object)
], PlayerState.prototype, "deck", void 0);
__decorate([
    (0, schema_1.type)(["string"]),
    __metadata("design:type", Object)
], PlayerState.prototype, "lifeCards", void 0);
__decorate([
    (0, schema_1.type)(["string"]),
    __metadata("design:type", Object)
], PlayerState.prototype, "trashCards", void 0);
class GameState extends schema_1.Schema {
    phase = "Refresh";
    turn = 1;
    player1SessionId = "";
    player2SessionId = "";
    player1 = new PlayerState();
    player2 = new PlayerState();
}
exports.GameState = GameState;
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], GameState.prototype, "phase", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], GameState.prototype, "turn", void 0);
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], GameState.prototype, "player1SessionId", void 0);
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], GameState.prototype, "player2SessionId", void 0);
__decorate([
    (0, schema_1.type)(PlayerState),
    __metadata("design:type", Object)
], GameState.prototype, "player1", void 0);
__decorate([
    (0, schema_1.type)(PlayerState),
    __metadata("design:type", Object)
], GameState.prototype, "player2", void 0);
