import { Schema, model, Document } from 'mongoose';

interface IToken extends Document {
  name: string;
  symbol: string;
  totalSupply: number;
  decimalPlaces: number;
  issuerAddress: string;
  createdAt: Date;
}

const tokenSchema = new Schema<IToken>({
  name:           { type: String, required: true },
  symbol:         { type: String, required: true },
  totalSupply:    { type: Number, required: true },
  decimalPlaces:  { type: Number, required: true },
  issuerAddress:  { type: String, required: true },
  createdAt:      { type: Date, default: Date.now },
});

export default model<IToken>('Token', tokenSchema);
