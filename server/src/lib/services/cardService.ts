import { Collection, ObjectId } from 'mongodb';
import { getDb } from '../mongo';
import { Card, CreateCardInput, UpdateCardInput, COLLECTIONS } from '../../types/database';

export class CardService {
  private async getCollection(): Promise<Collection<Card>> {
    const db = await getDb();
    return db.collection<Card>(COLLECTIONS.CARDS);
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

    const collection = await this.getCollection();
    const result = await collection.insertOne(card);
    return { ...card, _id: result.insertedId };
  }

  async findCardById(id: string): Promise<Card | null> {
    const collection = await this.getCollection();
    return collection.findOne({ _id: new ObjectId(id) });
  }

  async findCardByNumber(cardNumber: string): Promise<Card | null> {
    const collection = await this.getCollection();
    return collection.findOne({ cardNumber });
  }

  async updateCard(id: string, input: UpdateCardInput): Promise<Card | null> {
    const updateData = { ...input, updatedAt: new Date() };

    const collection = await this.getCollection();
    await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    return this.findCardById(id);
  }

  async deleteCard(id: string): Promise<boolean> {
    const collection = await this.getCollection();
    const result = await collection.deleteOne({ _id: new ObjectId(id) });
    return result.deletedCount > 0;
  }

  async listCards(limit = 50, skip = 0, country?: string): Promise<Card[]> {
    const collection = await this.getCollection();
    const filter = country ? { country } : {};
    
    return collection
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  async bulkCreateCards(cards: CreateCardInput[]): Promise<Card[]> {
    const collection = await this.getCollection();
    const cardsToInsert = cards.map(card => ({
      userId: new ObjectId(card.userId),
      cardNumber: card.cardNumber,
      cardType: card.cardType,
      expiryMonth: card.expiryMonth,
      expiryYear: card.expiryYear,
      cvv: card.cvv,
      cardholderName: card.cardholderName,
      billingAddress: card.billingAddress,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const result = await collection.insertMany(cardsToInsert);
    return Object.values(result.insertedIds).map((id, index) => ({
      ...cardsToInsert[index],
      _id: id,
    })) as Card[];
  }

  async getCardsByCountry(country: string): Promise<Card[]> {
    const collection = await this.getCollection();
    return collection.find({ country, isActive: true }).toArray();
  }

  async countCards(country?: string): Promise<number> {
    const collection = await this.getCollection();
    const filter = country ? { country } : {};
    return collection.countDocuments(filter);
  }

  async getCountryStats(): Promise<{ country: string; count: number }[]> {
    const collection = await this.getCollection();
    const result = await collection
      .aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$country', count: { $sum: 1 } } },
        { $project: { country: '$_id', count: 1, _id: 0 } },
        { $sort: { count: -1 } }
      ])
      .toArray();
    
    return result as { country: string; count: number }[];
  }
} 