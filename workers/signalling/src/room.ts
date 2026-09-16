import { DurableObject } from 'cloudflare:workers';
import {
  ROOM_TTL_MS,
  claimOffer,
  isLive,
  publishOffer,
  takeAnswer,
  withAnswer,
  withTable
} from './roomLogic';
import type { AnswerPayload, SeatSummary, TableRecord } from './roomLogic';

const STORAGE_KEY = 'room';

/**
 * One table's handshakes, one at a time. Holds the seat list a joiner picks
 * from, the offer currently on the table, and the single answer in flight.
 *
 * The Durable Object's job here is only to wire storage and the alarm to the
 * pure logic in `roomLogic.ts` — including the compare-and-swap that makes
 * one code safe for a whole table, which is a read-modify-write and is
 * therefore correct only because a Durable Object serialises its own calls.
 */
export class SignallingRoom extends DurableObject<Env> {
  private async live(): Promise<TableRecord | undefined> {
    const record = await this.ctx.storage.get<TableRecord>(STORAGE_KEY);
    if (isLive(record, Date.now())) return record;
    if (record !== undefined) await this.ctx.storage.deleteAll();
    return undefined;
  }

  private async keep(record: TableRecord): Promise<void> {
    await this.ctx.storage.put(STORAGE_KEY, record);
    // The backstop for a host that goes away mid-game. `live()` also checks
    // the window on every read, so an alarm that fires late — or, in tests,
    // never — still cannot serve a room whose host has gone quiet.
    await this.ctx.storage.setAlarm(record.touchedAt + ROOM_TTL_MS);
  }

  async createTable(
    seats: readonly SeatSummary[],
    sdp: string,
    ticket: string
  ): Promise<'created' | 'taken'> {
    if ((await this.live()) !== undefined) return 'taken';
    await this.keep(withTable(seats, sdp, ticket, Date.now()));
    return 'created';
  }

  /** What a joiner sees before committing: who is at this table, and whether
   *  there is an offer free to take right now. */
  async summary(): Promise<{ seats: readonly SeatSummary[]; open: boolean } | null> {
    const record = await this.live();
    if (record === undefined) return null;
    return { seats: record.seats, open: record.offer !== null };
  }

  /** Takes the offer off the table. `null` means somebody else is already
   *  mid-handshake — a real answer for a joiner, not an error. */
  async claim(): Promise<{ sdp: string; ticket: string } | null> {
    const record = await this.live();
    if (record === undefined) return null;
    const { record: next, claimed } = claimOffer(record);
    if (claimed === null) return null;
    await this.keep(next);
    return claimed;
  }

  async submitAnswer(answer: AnswerPayload): Promise<boolean> {
    const record = await this.live();
    if (record === undefined) return false;
    const next = withAnswer(record, answer);
    if (next === null) return false;
    await this.keep(next);
    return true;
  }

  /** `found: false` (no such table, or its host went quiet) is a different
   *  fact than `found: true, answer: null` (nobody is joining right now) —
   *  the host polling this needs to tell "still waiting" from "gone". */
  async takeAnswer(
    seats: readonly SeatSummary[]
  ): Promise<{ found: true; answer: AnswerPayload | null } | { found: false }> {
    const record = await this.live();
    if (record === undefined) return { found: false };
    const { record: next, answer } = takeAnswer(record, seats, Date.now());
    await this.keep(next);
    return { found: true, answer };
  }

  /** The host putting the next offer out under the same code, once it has
   *  connected whoever answered last. */
  async publishOffer(seats: readonly SeatSummary[], sdp: string, ticket: string): Promise<boolean> {
    const record = await this.live();
    if (record === undefined) return false;
    await this.keep(publishOffer(record, seats, sdp, ticket, Date.now()));
    return true;
  }

  async alarm(): Promise<void> {
    // Only if nothing has touched it since the alarm was set — a host still
    // polling keeps pushing the window out, and each `keep` re-arms this.
    if ((await this.live()) === undefined) await this.ctx.storage.deleteAll();
  }
}
