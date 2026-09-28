"use client";

import { useState } from "react";
import Link from "next/link";
import { brand } from "@/config/brand";
import { games } from "@/games";
import type { GameId } from "@/lib/game/types";

export function LobbyShell() {
  const [gameId, setGameId] = useState<GameId>("secret-director");
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [inLobby, setInLobby] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const game = games[gameId];

  function enterPreview(join: boolean) {
    if (!nickname.trim()) { setError("사용할 닉네임을 입력해 주세요."); return; }
    if (join && !/^[A-Z0-9]{6}$/.test(roomCode)) { setError("영문 또는 숫자 6자리 방 코드를 입력해 주세요."); return; }
    setError(""); setReady(false); setInLobby(true);
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-7 sm:px-10 sm:py-10">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
        <Link className="text-lg font-black tracking-tight" href="/">{brand.name}<span className="text-lime-300"> ✳</span></Link>
        <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-stone-300">EARLY PLAYTEST · UI PREVIEW</span>
      </header>
      <section className="mb-10 mt-14 max-w-3xl">
        <p className="mb-5 text-xs font-bold tracking-[0.2em] text-lime-300">친구들만 오세요. 판은 우리가 짤게요.</p>
        <h1 className="text-4xl font-black leading-tight tracking-tight sm:text-6xl">오늘, 가장 수상한 건<br /><span className="text-lime-300">당신의 친구.</span></h1>
        <p className="mt-6 max-w-xl leading-7 text-stone-400">평범한 단체 채팅에 비밀 미션 한 스푼.<br />AI는 뒤에서 돕고, 웃긴 순간은 우리가 만드는 파티게임.</p>
        <div className="mt-6 flex flex-wrap gap-3 text-sm text-stone-300"><span>4–8명의 친구</span><span aria-hidden="true">·</span><span>브라우저 하나면 OK</span><span aria-hidden="true">·</span><span>인간 90 / AI 10</span></div>
      </section>
      <div className="grid items-start gap-7 lg:grid-cols-[1.25fr_1fr]">
        <section aria-labelledby="games-heading">
          <h2 id="games-heading" className="mb-4 text-sm font-semibold text-stone-300">01 / 오늘의 게임을 골라요</h2>
          <div className="space-y-3">
            {Object.values(games).map((entry, index) => (
              <button key={entry.id} type="button" disabled={inLobby} aria-pressed={gameId === entry.id} onClick={() => setGameId(entry.id)} className={`w-full rounded-2xl border p-6 text-left transition ${gameId === entry.id ? "border-lime-300 bg-lime-300/5" : "border-white/10 bg-white/[0.025] hover:border-white/30"} disabled:cursor-default`}>
                <div className="mb-5 flex justify-between text-xs font-semibold tracking-wider text-stone-400"><span>FORMAT 0{index + 1}</span><span className={gameId === entry.id ? "text-lime-300" : ""}>{gameId === entry.id ? "선택됨 ●" : "○"}</span></div>
                <h3 className="text-xl font-bold">{entry.title}</h3><p className="mt-2 font-medium text-stone-200">{entry.tagline}</p><p className="mt-3 text-sm leading-6 text-stone-400">{entry.description}</p>
                <p className="mt-5 text-xs text-stone-400">{entry.minPlayers}–{entry.maxPlayers}명 · 대화 라운드 {entry.durationSeconds / 60}분</p>
              </button>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-white/10 bg-[#202322] p-6 sm:p-8" aria-labelledby="lobby-heading">
          <p className="mb-5 text-xs font-semibold tracking-wider text-lime-300">02 / 친구들과 모여요</p>
          <h2 id="lobby-heading" className="text-2xl font-bold">{inLobby ? "대기실 미리보기" : "오늘의 출연자는?"}</h2>
          <p className="mb-6 mt-3 text-sm leading-6 text-stone-400">이 화면은 로컬 데모예요. 실제 방 생성·입장과 친구 초대는 아직 연결되지 않았어요.</p>
          {!inLobby ? (
            <form onSubmit={(event) => { event.preventDefault(); enterPreview(false); }}>
              <label htmlFor="nickname" className="mb-2 block text-sm">닉네임</label>
              <input id="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={16} autoComplete="nickname" placeholder="친구들이 알아볼 이름" aria-describedby="form-error" />
              <button type="submit" className="primary mt-4 w-full">새 방 화면 미리보기 <span aria-hidden="true">↗</span></button>
              <div className="my-6 flex items-center gap-3 text-xs text-stone-500"><span className="h-px flex-1 bg-white/10" />또는 코드로 입장 연습<span className="h-px flex-1 bg-white/10" /></div>
              <label htmlFor="room-code" className="mb-2 block text-sm">방 코드</label>
              <div className="flex gap-2"><input id="room-code" value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} maxLength={6} placeholder="ABC123" autoCapitalize="characters" spellCheck={false} aria-describedby="form-error" className="min-w-0 flex-1 uppercase tracking-widest" /><button type="button" className="secondary shrink-0" onClick={() => enterPreview(true)}>미리보기</button></div>
              <p id="form-error" role="alert" className="mt-3 min-h-6 text-sm text-amber-300">{error}</p>
            </form>
          ) : (
            <div>
              <div className="rounded-xl border border-white/10 bg-black/10 p-4"><div className="flex items-center justify-between gap-3"><span className="break-all font-semibold">{nickname.trim()} <span className="text-xs text-stone-500">나</span></span><span className={ready ? "text-sm text-lime-300" : "text-sm text-stone-400"}>{ready ? "준비 완료" : "준비 중"}</span></div><p className="mt-5 text-sm text-stone-500">나머지 3–7자리는 친구들을 위한 자리예요.</p></div>
              <button type="button" aria-pressed={ready} className="primary mt-4 w-full" onClick={() => setReady(!ready)}>{ready ? "준비 취소" : "준비 완료"}</button>
              <button type="button" disabled className="secondary mt-3 w-full">게임 시작 · 연결 준비 중</button>
              <p className="mt-3 text-xs leading-5 text-stone-400" role="status">Ready 상태는 이 화면에서만 바뀌어요. 실제 게임은 4–8명이 모두 준비하면 시작하도록 구현할 예정이에요.</p>
              <button type="button" className="mt-6 text-sm text-stone-400 underline underline-offset-4" onClick={() => { setInLobby(false); setReady(false); }}>게임 선택으로 돌아가기</button>
            </div>
          )}
          <div className="mt-7 border-t border-white/10 pt-5"><h3 className="mb-3 text-sm font-semibold">이렇게 놀아요</h3><ol className="space-y-2 text-sm leading-6 text-stone-400">{game.rules.map((rule, index) => <li key={rule}><span className="mr-2 text-lime-300">0{index + 1}</span>{rule}</li>)}</ol></div>
        </section>
      </div>
      <footer className="mt-12 border-t border-white/10 py-6 text-xs leading-6 text-stone-500">우리의 첫 번째 질문: 채팅만으로, 친구들과 정말 웃을 수 있을까?</footer>
    </main>
  );
}
