/**
 * 관리자 관찰 화면 (/admin) — 몇 명으로 많이 플레이했는지, 게임별 완주율, 재플레이율 등.
 * 서버 ADMIN_TOKEN이 설정돼 있으면 토큰을 입력해야 한다.
 */
import { useCallback, useEffect, useState } from 'react';
import type { CountRow, StatsReport } from '@backstage/shared';
import s from './Admin.module.css';

type Stats = StatsReport & { catalog: { id: string; name: string; ai: string; robloxCandidate: boolean }[]; liveRooms: number };

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
const TOKEN_KEY = 'backstage.adminToken';
const EVENT_LABEL: Record<string, string> = {
  room_created: '방 생성',
  player_joined: '입장',
  player_left: '퇴장',
  match_started: '매치 시작',
  match_completed: '매치 완료',
  game_started: '게임 시작',
  game_completed: '게임 완료',
  game_aborted: '게임 중단',
  play_again: '한 판 더',
  settings_changed: '설정 변경',
};
const PHASE_LABEL: Record<string, string> = { lobby: '대기실', intro: '전광판', playing: '게임 중', game_result: '게임 결과', final: '최종 결과' };

function CountTable({ title, rows, keyLabel, fmt = (k) => k }: { title: string; rows: CountRow[]; keyLabel: string; fmt?: (k: string) => string }) {
  const total = rows.reduce((a, r) => a + r.count, 0);
  return (
    <section className="card">
      <div className="card-title">{title}</div>
      {rows.length === 0 ? (
        <p className="faint">아직 데이터가 없어요.</p>
      ) : (
        <table className={s.table}>
          <thead>
            <tr>
              <th>{keyLabel}</th>
              <th>횟수</th>
              <th>비율</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{fmt(r.key)}</td>
                <td>{r.count}</td>
                <td>{pct(total ? r.count / total : null)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function Admin() {
  const [token, setToken] = useState(() => {
    try {
      return sessionStorage.getItem(TOKEN_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [days, setDays] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await fetch(`/api/admin/stats?days=${days}`, { headers: { 'x-admin-token': token } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? '불러오지 못했어요.');
      setStats(j);
      try {
        sessionStorage.setItem(TOKEN_KEY, token);
      } catch {
        /* 무시 */
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [days, token]);

  useEffect(() => {
    load();
  }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  const name = (id: string) => stats?.catalog.find((c) => c.id === id)?.name ?? id;

  return (
    <main className="page stack">
      <header className="row">
        <h1 className="display" style={{ color: 'var(--c-marquee)' }}>
          관찰 데이터
        </h1>
        <span className="spacer" />
        <div className="row" role="group" aria-label="기간">
          {[
            [0, '전체'],
            [7, '7일'],
            [1, '오늘'],
          ].map(([d, l]) => (
            <button key={d} className="chip" aria-pressed={days === d} onClick={() => setDays(Number(d))}>
              {l}
            </button>
          ))}
        </div>
      </header>

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <input className="input" style={{ maxWidth: 280 }} type="password" placeholder="관리자 토큰 (설정된 경우)" value={token} onChange={(e) => setToken(e.target.value)} />
        <button className="btn btn-sm" type="submit">
          새로고침
        </button>
        {error && <span style={{ color: 'var(--c-bad)' }}>{error}</span>}
      </form>

      {stats && (
        <>
          <div className={s.kpis}>
            {[
              ['지금 열린 방', stats.liveRooms],
              ['만든 방', stats.totals.rooms],
              ['매치 시작', stats.totals.matchesStarted],
              ['매치 완료', stats.totals.matchesCompleted],
              ['완료한 게임', stats.totals.gamesCompleted],
              ['재플레이율', pct(stats.totals.replayRate)],
            ].map(([k, v]) => (
              <div key={k} className={`card ${s.kpi}`}>
                <span className="label">{k}</span>
                <strong className="display">{v}</strong>
              </div>
            ))}
          </div>
          <p className="faint" style={{ fontSize: 'var(--fs-xs)', margin: 0 }}>
            재플레이율 = ‘한 판 더’ 수 ÷ 완료된 매치 수. 닉네임·채팅 내용은 기록하지 않아요.
          </p>

          <div className={s.grid2}>
            <CountTable title="몇 명으로 많이 플레이했나 (매치 시작 인원)" rows={stats.matchesByPlayerCount} keyLabel="인원" fmt={(k) => `${k}명`} />
            <CountTable title="방 라운드(게임 수) 설정" rows={stats.matchesByGameRounds} keyLabel="게임 수" fmt={(k) => `${k}개`} />
          </div>

          <section className="card">
            <div className="card-title">게임별</div>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>게임</th>
                  <th>AI</th>
                  <th>시작</th>
                  <th>완료</th>
                  <th>중단</th>
                  <th>완주율</th>
                  <th>평균 시간</th>
                  <th>인원 분포</th>
                </tr>
              </thead>
              <tbody>
                {stats.games.map((g) => {
                  const c = stats.catalog.find((x) => x.id === g.gameId);
                  return (
                    <tr key={g.gameId}>
                      <td>
                        {name(g.gameId)}
                        {c?.robloxCandidate && <span className="badge" style={{ marginLeft: 6 }}>Roblox 후보</span>}
                      </td>
                      <td>{c?.ai ?? '—'}</td>
                      <td>{g.started}</td>
                      <td>{g.completed}</td>
                      <td>{g.aborted}</td>
                      <td>{pct(g.completionRate)}</td>
                      <td>{g.avgDurationSec === null ? '—' : `${g.avgDurationSec}초`}</td>
                      <td>{g.byPlayerCount.map((r) => `${r.key}명×${r.count}`).join(', ') || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <div className={s.grid2}>
            <CountTable title="어느 단계에서 나갔나" rows={stats.leavesByPhase} keyLabel="단계" fmt={(k) => PHASE_LABEL[k] ?? k} />
            <section className="card">
              <div className="card-title">최근 이벤트</div>
              <ul className={s.events}>
                {stats.recent.map((e, i) => (
                  <li key={i}>
                    <span className="faint">{new Date(e.at).toLocaleString('ko-KR')}</span> {EVENT_LABEL[e.type] ?? e.type}
                    {'gameId' in e && ` · ${name(e.gameId)}`}
                    {'playerCount' in e && ` · ${e.playerCount}명`}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </main>
  );
}
