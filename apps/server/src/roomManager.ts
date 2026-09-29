/** 방 목록 관리 — 방 코드 발급, 조회, 빈 방 정리. */
import type { Clock } from './clock.js';
import type { EventSink } from './analytics.js';
import type { ServerGame } from './games/types.js';
import { Room, type RoomTransport } from './room.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class RoomManager {
  private rooms = new Map<string, Room>();

  constructor(
    private games: ServerGame[],
    private clock: Clock,
    private sink: EventSink,
    private transport: RoomTransport,
    private random: () => number = Math.random,
  ) {}

  create(): Room {
    let code = '';
    do {
      code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(this.random() * CODE_CHARS.length)]).join('');
    } while (this.rooms.has(code));
    const room = new Room(code, this.games, this.clock, this.sink, this.transport, (r) => this.rooms.delete(r.code), this.random);
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(String(code ?? '').trim().toUpperCase());
  }

  count(): number {
    return this.rooms.size;
  }
}
