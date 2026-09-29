import type { PlayerPublic } from '@backstage/shared';
import { Avatar } from '../../ui/Avatar';
import s from './WordGames.module.css';

/** [현재 순위] — 이번 라운드 획득 점수와 게임 누적 점수. 누적 → 라운드 점수 순, 같은 누적은 같은 순위 */
export function Standings({ rows, players, meId }: { rows: { id: string; round: number; total: number }[]; players: PlayerPublic[]; meId: string }) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const sorted = [...rows].sort((a, b) => b.total - a.total || b.round - a.round);
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  return (
    <section className={s.standings} data-testid="standings">
      <h3 className={s.standingsTitle}>[현재 순위]</h3>
      <table className={s.table}>
        <thead>
          <tr>
            <th className={s.num}>#</th>
            <th>이름</th>
            <th className={s.num}>라운드</th>
            <th className={s.num}>누적</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const rank = sorted.findIndex((x) => x.total === r.total) + 1;
            const p = byId.get(r.id);
            return (
              <tr key={r.id} className={r.id === meId ? s.meRow : ''}>
                <td className={s.num}>{rank}</td>
                <td>
                  <span className={s.personHead}>
                    {p && <Avatar avatar={p.avatar} size={22} />}
                    {p?.nickname ?? '?'}
                  </span>
                </td>
                <td className={s.num}>{sign(r.round)}</td>
                <td className={s.num}>
                  <strong>{r.total}</strong>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
