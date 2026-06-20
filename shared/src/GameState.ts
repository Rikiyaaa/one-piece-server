import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";

export class CardOnField extends Schema {
  @type("string") id: string = "";
  @type("string") cardId: string = "";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("boolean") faceDown: boolean = false;
  @type("number") rotation: number = 0;
  @type("boolean") isTapped: boolean = false;
  @type("string") owner: string = ""; // session ID
  @type("boolean") isDon: boolean = false;
  @type("number") counter: number = 0;
}

export class PlayerState extends Schema {
  @type("string") name: string = "Player";
  @type("number") life: number = 5;
  @type("number") donTotal: number = 10;
  @type("number") donSpent: number = 0;
  @type("number") handCount: number = 0;
  @type("number") deckCount: number = 50;
  @type({ map: CardOnField }) field = new MapSchema<CardOnField>();
  // ── เพิ่มเพื่อ reconnect recovery ──
  @type(["string"]) hand = new ArraySchema<string>();   // cardId ในมือ
  @type(["string"]) deck = new ArraySchema<string>();   // cardId ในกอง (top = index 0)
  @type(["string"]) lifeCards = new ArraySchema<string>(); // cardId ในโซน life
  @type(["string"]) trashCards = new ArraySchema<string>(); // cardId ในทิ้ง
}

export class GameState extends Schema {
  @type("string") phase: string = "Refresh";
  @type("number") turn: number = 1;
  @type("string") player1SessionId: string = "";
  @type("string") player2SessionId: string = "";
  @type(PlayerState) player1 = new PlayerState();
  @type(PlayerState) player2 = new PlayerState();
}
