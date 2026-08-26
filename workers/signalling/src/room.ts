import { DurableObject } from 'cloudflare:workers';
import { ROOM_TTL_MS, isLive, withAnswer, withOffer } from './roomLogic';
import type { AnswerPayload, OfferPayload, RoomRecord } from './roomLogic';

const STORAGE_KEY = 'room';

/**
 * One table's handshake, and nothing else. Holds exactly one offer and, once
 * it exists, exactly one answer — a room is not a chat, it is a single
 * exchange that either completes or expires. The Durable Object's job here is
 * only to wire storage and the alarm to the pure logic in `roomLogic.ts`.
 */
export class SignallingRoom extends DurableObject<Env> {
  private async live(): Promise<RoomRecord | undefined> {
    const record = await this.ctx.storage.get<RoomRecord>(STORAGE_KEY);
    if (isLive(record, Date.now())) return record;
    if (record !== undefined) await this.ctx.storage.deleteAll();
    return undefined;
  }

  async createOffer(offer: OfferPayload): Promise<'created' | 'taken'> {
    if ((await this.live()) !== undefined) return 'taken';
    const record = withOffer(offer, Date.now());
    await this.ctx.storage.put(STORAGE_KEY, record);
    // A room nobody finishes joining must not linger forever — the alarm is
    // the backstop; `live()` also checks the TTL on every read, so an alarm
    // that fires late (or, in tests, never) still can't serve a stale room.
    await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
    return 'created';
  }

  async getOffer(): Promise<OfferPayload | null> {
    const record = await this.live();
    return record?.offer ?? null;
  }

  async submitAnswer(answer: AnswerPayload): Promise<boolean> {
    const record = await this.live();
    if (record === undefined) return false;
    await this.ctx.storage.put(STORAGE_KEY, withAnswer(record, answer));
    return true;
  }

  /** `found: false` (no such room, or it expired) is a different fact than
   *  `found: true, answer: null` (the room is live, nobody has answered yet)
   *  — the host polling this needs to tell "still waiting" from "gone". */
  async getAnswer(): Promise<{ found: true; answer: AnswerPayload | null } | { found: false }> {
    const record = await this.live();
    if (record === undefined) return { found: false };
    return { found: true, answer: record.answer };
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}
