import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { Button, Card, Segmented, SectionTitle, IconButton, ExerciseRow, BigNumber, StatTiles, InfoButton, Fact, EmptyState, SkeletonRows, Skeleton, InlineError, RankChip } from './ui/index.js'
import { Toggle } from './ReminderSettings.jsx'
import {
  saveNickname, setOnLeaderboard, searchNicknames, sendFriendRequest, respondFriendRequest, removeFriend,
  fetchFriends, fetchLeaderboard, fetchMyPoints, fetchMyMonths, inviteUrl,
} from '../lib/socialApi.js'
import { POINT_RULES, MONTHLY_TARGET, PRIZE_PLACES, levelFor, monthName, daysLeftInMonth, trophiesFrom, NICKNAME_RE, cleanNickname } from '../lib/points.js'

const inputCls = 'w-full bg-raised border border-line focus:border-neon-stroke text-ink placeholder:text-placeholder rounded-xl py-3 text-sm outline-none transition-colors'

// ── Nickname ─────────────────────────────────────────────────────────────────

export function NicknameCard({ current, onSaved, onCancel }) {
  const [value, setValue] = useState(current || '')
  const [error, setError] = useState('')
  const [busy, setBusy]   = useState(false)
  const nick = cleanNickname(value)
  const valid = NICKNAME_RE.test(nick)

  async function save() {
    if (!valid) return
    setBusy(true); setError('')
    try {
      onSaved(await saveNickname(nick))
    } catch (e) {
      setError(e.message || 'Could not save the nickname')
      setBusy(false)
    }
  }

  return (
    <Card hero>
      <div className="font-bold text-xl text-ink">{current ? 'Change your nickname' : 'Pick a nickname'}</div>
      <p className="text-sm text-ink-2 mt-1">It's how friends find you and the name on the leaderboard. Your real name stays private.</p>
      <div className="relative mt-4">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted font-semibold" aria-hidden="true">@</span>
        <input className={`${inputCls} pl-8 pr-4 font-semibold`} aria-label="Nickname" placeholder="nickname"
          autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={21}
          value={value} onChange={e => { setValue(e.target.value); setError('') }}
          onKeyDown={e => e.key === 'Enter' && save()} />
      </div>
      <p className={`text-xs mt-2 ${error ? 'text-danger' : 'text-muted'}`} role={error ? 'alert' : undefined}>
        {error || '3–20 letters, numbers or underscores.'}
      </p>
      <div className="flex gap-2 mt-3">
        {onCancel && <Button variant="secondary" className="flex-1" onClick={onCancel}>Cancel</Button>}
        <Button className="flex-1" onClick={save} disabled={!valid || busy || nick === current}>
          {busy ? 'Saving…' : 'Save nickname'}
        </Button>
      </div>
    </Card>
  )
}

// ── Leaderboard ──────────────────────────────────────────────────────────────

function Stars({ count }) {
  return (
    <span className="inline-flex text-neon-ink" aria-label={`${count} of 3 stars`}>
      {[1, 2, 3].map(i => <Icon key={i} icon={i <= count ? 'mdi:star' : 'mdi:star-outline'} width={13} aria-hidden="true" />)}
    </span>
  )
}

function PointsInfo() {
  return (
    <InfoButton title="How points work">
      <div className="space-y-3">
        {POINT_RULES.map(([icon, pts, text]) => (
          <div key={icon} className="flex items-center gap-3">
            <Icon icon={icon} width={20} className="text-neon-ink flex-shrink-0" aria-hidden="true" />
            <span className="font-bold text-ink tabular-nums w-8">+{pts}</span>
            <span className="text-sm text-ink-2">{text}</span>
          </div>
        ))}
      </div>
      <p className="text-sm text-ink-2 mt-5">
        Points reset on the 1st. The top {PRIZE_PLACES} on Everyone win a medal and a free month of Pro.
        Already paying? Your next payment moves a month later.
        Hit {MONTHLY_TARGET} workout days to earn that month's badge.
      </p>
      <p className="text-sm text-ink-2 mt-3">
        Every month's points add up to your level: Rookie, Regular, Athlete, Elite, then Legend, with three stars in each.
      </p>
    </InfoButton>
  )
}

export function LeaderboardTab({ me, onMeChange, onAddFriends }) {
  const [scope, setScope]   = useState('friends')
  const [rows, setRows]     = useState({})   // scope → rows
  const [mine, setMine]     = useState(null)
  const [months, setMonths] = useState([])
  const [error, setError]   = useState(false)
  const [tick, setTick]     = useState(0)

  useEffect(() => {
    setError(false)
    Promise.all([fetchMyPoints(), fetchMyMonths()])
      .then(([p, m]) => { setMine(p); setMonths(m) })
      .catch(() => setError(true))
  }, [tick])

  useEffect(() => {
    fetchLeaderboard(scope)
      .then(r => setRows(prev => ({ ...prev, [scope]: r })))
      .catch(() => setError(true))
  }, [scope, tick, me.on_leaderboard])

  async function toggleListed(on) {
    onMeChange({ ...me, on_leaderboard: on })
    try { await setOnLeaderboard(on) } catch { onMeChange(me) }
  }

  if (error) return <InlineError onRetry={() => setTick(t => t + 1)}>Could not load the leaderboard.</InlineError>

  const list = rows[scope]
  const myRow = list?.find(r => r.is_me)
  const level = levelFor(mine?.lifetime ?? 0)
  const days = mine?.workout_days ?? 0
  const trophies = trophiesFrom(months)
  const now = new Date()
  const left = daysLeftInMonth(now)

  return (
    <div className="space-y-4">
      <Card hero>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-neon-ink">{monthName(now)} · {left} day{left === 1 ? '' : 's'} left</div>
            {mine ? <BigNumber value={mine.points} unit="pts" className="mt-1" /> : <Skeleton className="h-10 w-28 mt-2" />}
          </div>
          <PointsInfo />
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <Fact icon="mdi:trophy-outline">Top {PRIZE_PLACES} on Everyone win a free month of Pro</Fact>
        </div>
        <StatTiles className="mt-4" items={[
          [scope === 'friends' ? 'Among friends' : 'On Everyone', myRow?.place ? `#${myRow.place}` : '–'],
          ['Workout days', `${days}/${MONTHLY_TARGET}`],
          ['Level', level.name],
        ]} />
        <div className="mt-4">
          <div className="h-1.5 rounded-full bg-raised overflow-hidden" role="progressbar" aria-label="Monthly target"
            aria-valuemin={0} aria-valuemax={MONTHLY_TARGET} aria-valuenow={Math.min(days, MONTHLY_TARGET)}>
            <div className="h-full bg-neon rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, (days / MONTHLY_TARGET) * 100)}%` }} />
          </div>
          <p className="text-xs text-muted mt-1.5">
            {days >= MONTHLY_TARGET
              ? `${monthName(now).split(' ')[0]} badge earned`
              : `${MONTHLY_TARGET - days} more workout day${MONTHLY_TARGET - days === 1 ? '' : 's'} for the ${monthName(now).split(' ')[0]} badge`}
          </p>
        </div>
        <div className="flex items-center gap-2 mt-3 text-xs text-ink-2">
          <Stars count={level.stars} />
          <span>{level.next ? `${level.toNext} pts to ${level.next}` : 'Top level'}</span>
        </div>
      </Card>

      <Segmented kind="choice" label="Leaderboard" options={[['friends', 'Friends'], ['everyone', 'Everyone']]} value={scope} onChange={setScope} />

      {!list ? <SkeletonRows rows={4} label="Loading leaderboard" />
        : scope === 'friends' && list.length <= 1 ? (
          <EmptyState icon="mdi:account-multiple-plus-outline" title="Add friends to compete"
            action="Add friends" actionIcon="mdi:account-plus-outline" onAction={onAddFriends}>
            Your friends and you, ranked by points this month.
          </EmptyState>
        ) : (
          <ol className="space-y-1.5" aria-label={`${scope === 'friends' ? 'Friends' : 'Everyone'} leaderboard`}>
            {list.map(r => <BoardRow key={r.nickname} row={r} />)}
          </ol>
        )}

      {scope === 'everyone' && (
        <div className="flex items-center justify-between gap-3 bg-surface border border-line rounded-2xl px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-ink">Show me on Everyone</div>
            <div className="text-xs text-muted">Only your nickname and points. Friends always see you.</div>
          </div>
          <Toggle on={me.on_leaderboard} onChange={toggleListed} label="Show me on Everyone" />
        </div>
      )}

      <section>
        <SectionTitle>Trophies</SectionTitle>
        {trophies.length ? (
          <div className="space-y-1.5">
            {trophies.map(t => (
              <ExerciseRow key={t.key} icon={t.kind === 'medal' ? 'mdi:medal' : 'mdi:calendar-star'} name={t.title} meta={monthName(t.month)}
                value={t.kind === 'medal' ? `#${t.place}` : null} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Finish a month in the top {PRIZE_PLACES} on Everyone, or with {MONTHLY_TARGET} workout days, to earn your first.</p>
        )}
      </section>
    </div>
  )
}

function BoardRow({ row }) {
  const level = levelFor(row.lifetime)
  return (
    <li className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border ${row.is_me ? 'bg-neon-tint border-neon-stroke/30' : 'bg-raised border-transparent'}`}>
      {row.place ? <RankChip rank={row.place} /> : <span className="text-xs text-muted w-7 text-center">–</span>}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-ink truncate">@{row.nickname}{row.is_me && <span className="text-muted font-normal"> (you)</span>}</div>
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <Stars count={level.stars} /><span>{level.name}</span>
          {row.medals > 0 && <span className="inline-flex items-center gap-0.5"><Icon icon="mdi:medal-outline" width={13} aria-hidden="true" />{row.medals}</span>}
          {!row.place && <span>· hidden from Everyone</span>}
        </div>
      </div>
      <span className="text-sm font-bold text-neon-ink tabular-nums flex-shrink-0">{row.points}</span>
    </li>
  )
}

// ── Friends ──────────────────────────────────────────────────────────────────

export function FriendsTab({ me, invite, onInviteDone, onEditNickname }) {
  const [friends, setFriends] = useState(null)
  const [error, setError]     = useState(false)
  const [query, setQuery]     = useState('')
  const [hits, setHits]       = useState([])
  const [msg, setMsg]         = useState(null)  // { ok, text }
  const [busy, setBusy]       = useState(false)
  const [confirm, setConfirm] = useState(null)  // friendship id being removed
  const [shared, setShared]   = useState(false)

  const load = () => fetchFriends().then(f => { setFriends(f); setError(false) }).catch(() => setError(true))
  useEffect(() => { load() }, [])

  // Suggestions while typing
  useEffect(() => {
    const q = cleanNickname(query)
    if (q.length < 2) { setHits([]); return }
    const t = setTimeout(() => searchNicknames(q, me.nickname).then(setHits).catch(() => setHits([])), 250)
    return () => clearTimeout(t)
  }, [query, me.nickname])

  async function add(nickname) {
    const nick = cleanNickname(nickname)
    if (!nick) return
    setBusy(true); setMsg(null)
    try {
      const res = await sendFriendRequest(nick)
      setMsg({ ok: true, text: res === 'friends' ? `You and @${nick} are friends` : `Request sent to @${nick}` })
      setQuery(''); setHits([])
      load()
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    }
    setBusy(false)
  }

  async function act(fn) {
    try { await fn(); await load() } catch { setError(true) }
    setConfirm(null)
  }

  async function share() {
    const url = inviteUrl(me.nickname)
    try {
      if (navigator.share) await navigator.share({ title: 'ATHRION', text: `Add me on ATHRION: @${me.nickname}`, url })
      else { await navigator.clipboard.writeText(url); setShared(true); setTimeout(() => setShared(false), 2000) }
    } catch {} // closing the share sheet is not an error
  }

  const incoming = friends?.filter(f => f.status === 'pending' && f.incoming) ?? []
  const outgoing = friends?.filter(f => f.status === 'pending' && !f.incoming) ?? []
  const accepted = friends?.filter(f => f.status === 'accepted') ?? []
  const showInvite = invite && invite !== me.nickname && !accepted.some(f => f.nickname === invite)

  return (
    <div className="space-y-4">
      <Card hero>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-muted">Your nickname</div>
            <div className="font-bold text-2xl text-ink truncate">@{me.nickname}</div>
          </div>
          <IconButton icon="mdi:pencil-outline" label="Change nickname" onClick={onEditNickname} />
        </div>
        <Button full variant="secondary" icon={shared ? 'mdi:check' : 'mdi:share-variant-outline'} className="mt-4" onClick={share}>
          {shared ? 'Link copied' : 'Share invite link'}
        </Button>
      </Card>

      {showInvite && (
        <Card tone="neon">
          <div className="text-sm text-ink"><span className="font-bold">@{invite}</span> invited you to be friends.</div>
          <div className="flex gap-2 mt-3">
            <Button variant="secondary" className="flex-1" onClick={onInviteDone}>Not now</Button>
            <Button className="flex-1" disabled={busy} onClick={async () => { await add(invite); onInviteDone() }}>Add @{invite}</Button>
          </div>
        </Card>
      )}

      <Card>
        <SectionTitle>Add a friend</SectionTitle>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted font-semibold" aria-hidden="true">@</span>
            <input className={`${inputCls} pl-8 pr-4`} aria-label="Friend's nickname" placeholder="nickname"
              autoCapitalize="none" autoCorrect="off" spellCheck={false}
              value={query} onChange={e => { setQuery(e.target.value); setMsg(null) }}
              onKeyDown={e => e.key === 'Enter' && add(query)} />
          </div>
          <Button onClick={() => add(query)} disabled={busy || cleanNickname(query).length < 3}>Add</Button>
        </div>
        {hits.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Matching nicknames">
            {hits.map(n => (
              <button key={n} type="button" onClick={() => add(n)}
                className="press min-h-[36px] px-3 rounded-full bg-raised border border-line text-sm text-ink-2 hover:border-neon-stroke/40">
                @{n}
              </button>
            ))}
          </div>
        )}
        {msg && <p role="status" className={`text-sm mt-2 ${msg.ok ? 'text-neon-ink' : 'text-danger'}`}>{msg.text}</p>}
      </Card>

      {error && <InlineError onRetry={load}>Could not load your friends.</InlineError>}
      {!friends && !error && <SkeletonRows rows={3} label="Loading friends" />}

      {incoming.length > 0 && (
        <section>
          <SectionTitle>Requests</SectionTitle>
          <div className="space-y-1.5">
            {incoming.map(f => (
              <ExerciseRow key={f.id} icon="mdi:account-clock-outline" name={`@${f.nickname}`} meta="Wants to be friends">
                <IconButton icon="mdi:check" label={`Accept @${f.nickname}`} onClick={() => act(() => respondFriendRequest(f.id, true))} />
                <IconButton icon="mdi:close" tone="danger" label={`Decline @${f.nickname}`} onClick={() => act(() => respondFriendRequest(f.id, false))} />
              </ExerciseRow>
            ))}
          </div>
        </section>
      )}

      {friends && (
        <section>
          <SectionTitle>Friends{accepted.length ? ` · ${accepted.length}` : ''}</SectionTitle>
          {accepted.length === 0 ? (
            <EmptyState icon="mdi:account-multiple-plus-outline" title="No friends yet">
              Share your invite link, or add someone by their nickname.
            </EmptyState>
          ) : (
            <div className="space-y-1.5">
              {accepted.map(f => (
                <ExerciseRow key={f.id} icon="mdi:account-outline" name={`@${f.nickname}`}>
                  {confirm === f.id ? <>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>Keep</Button>
                    <Button size="sm" variant="danger" onClick={() => act(() => removeFriend(f.id))}>Remove</Button>
                  </> : (
                    <IconButton icon="mdi:account-remove-outline" label={`Remove @${f.nickname}`} onClick={() => setConfirm(f.id)} />
                  )}
                </ExerciseRow>
              ))}
            </div>
          )}
        </section>
      )}

      {outgoing.length > 0 && (
        <section>
          <SectionTitle>Sent</SectionTitle>
          <div className="space-y-1.5">
            {outgoing.map(f => (
              <ExerciseRow key={f.id} icon="mdi:account-arrow-right-outline" name={`@${f.nickname}`} meta="Waiting for them to accept">
                <IconButton icon="mdi:close" label={`Cancel request to @${f.nickname}`} onClick={() => act(() => removeFriend(f.id))} />
              </ExerciseRow>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
