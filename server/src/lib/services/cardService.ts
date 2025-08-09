import { Collection, ObjectId } from 'mongodb';
import { getDatabase } from '../database';
import { Card, CreateCardInput, UpdateCardInput, COLLECTIONS } from '../../types/database';

export class CardService {
  private collection: Collection<Card>;

  constructor() {
    this.collection = getDatabase().collection<Card>(COLLECTIONS.CARDS);
  }

  async createCard(input: CreateCardInput): Promise<Card> {
    const card: Omit<Card, '_id'> = {
      userId: new ObjectId(input.userId),
      cardNumber: input.cardNumber,
      cardType: input.cardType,
      expiryMonth: input.expiryMonth,
      expiryYear: input.expiryYear,
      cvv: input.cvv,
      cardholderName: input.cardholderName,
      billingAddress: input.billingAddress,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await this.collection.insertOne(card);
    return { ...card, _id: result.insertedId };
  }

  async createManyCards(inputs: CreateCardInput[]): Promise<Card[]> {
    const cards: Omit<Card, '_id'>[] = inputs.map(input => ({
      userId: new ObjectId(input.userId),
      cardNumber: input.cardNumber,
      cardType: input.cardType,
      expiryMonth: input.expiryMonth,
      expiryYear: input.expiryYear,
      cvv: input.cvv,
      cardholderName: input.cardholderName,
      billingAddress: input.billingAddress,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const result = await this.collection.insertMany(cards);
    return cards.map((card, index) => ({ ...card, _id: result.insertedIds[index] }));
  }

  async findCardById(id: string): Promise<Card | null> {
    return this.collection.findOne({ _id: new ObjectId(id) });
  }

  async findCardsByUserId(userId: string, limit = 50, skip = 0): Promise<Card[]> {
    return this.collection
      .find({ userId: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  async findCardByNumber(cardNumber: string): Promise<Card | null> {
    return this.collection.findOne({ cardNumber });
  }

  async updateCard(id: string, input: UpdateCardInput): Promise<Card | null> {
    const updateData = { ...input, updatedAt: new Date() };

    await this.collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    return this.findCardById(id);
  }

  async deleteCard(id: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ _id: new ObjectId(id) });
    return result.deletedCount > 0;
  }

  async deleteCardsByUserId(userId: string): Promise<number> {
    const result = await this.collection.deleteMany({ userId: new ObjectId(userId) });
    return result.deletedCount;
  }

  async listCards(limit = 50, skip = 0): Promise<Card[]> {
    return this.collection
      .find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  async countCardsByUserId(userId: string): Promise<number> {
    return this.collection.countDocuments({ userId: new ObjectId(userId) });
  }

  async countActiveCardsByUserId(userId: string): Promise<number> {
    return this.collection.countDocuments({ 
      userId: new ObjectId(userId), 
      isActive: true 
    });
  }

  async updateLastUsed(id: string): Promise<void> {
    await this.collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { lastUsed: new Date(), updatedAt: new Date() } }
    );
  }

  async getCardsByCountry(country: string): Promise<Card[]> {
    return this.collection
      .find({ 'billingAddress.country': country })
      .sort({ createdAt: -1 })
      .toArray();
  }

  async getTopCountries(): Promise<Array<{ country: string; count: number }>> {
    const result = await this.collection.aggregate([
      { $group: { _id: '$billingAddress.country', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $project: { country: '$_id', count: 1, _id: 0 } }
    ]).toArray();

    return result as Array<{ country: string; count: number }>;
  }
} 