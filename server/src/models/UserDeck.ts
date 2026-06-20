import mongoose, { Schema, Document } from 'mongoose';

export interface IUserDeck extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  cards: string[];
  leader: string;
  donCount: number;
  updatedAt: Date;
}

const UserDeckSchema = new Schema({
  userId: { type: mongoose.Types.ObjectId, required: true, ref: 'User', index: true },
  name: { type: String, required: true },
  cards: [{ type: String }],
  leader: { type: String },
  donCount: { type: Number, default: 10 },
  updatedAt: { type: Date, default: Date.now }
});

export const UserDeck = mongoose.model<IUserDeck>('UserDeck', UserDeckSchema);
