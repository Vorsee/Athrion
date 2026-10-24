// Reminder rules with no Deno or database dependencies, so they can be unit tested.

const DAY = 86400000

export function localParts(timezone: string, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: 'numeric', hourCycle: 'h23', weekday: 'long',
    }).formatToParts(now).map(p => [p.type, p.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday: parts.weekday }
}

// Consecutive weeks (Monday-based, UTC) with a workout, not counting the current week
export function streakBeforeThisWeek(dates: string[], now = new Date()) {
  const weekKey = (d: Date) => {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7))
    return m.getTime()
  }
  const weeks = new Set(dates.map(d => weekKey(new Date(d))))
  let cursor = weekKey(now) - 7 * DAY
  let streak = 0
  while (weeks.has(cursor)) { streak++; cursor -= 7 * DAY }
  return { streak, trainedThisWeek: weeks.has(weekKey(now)) }
}

// The reminder to send today, or null when there's no reason to send one
export function chooseMessage(planData: any, dates: string[], settings: any, local: ReturnType<typeof localParts>, now = new Date()) {
  // Trained on today's date in the user's own timezone (a late workout last night doesn't count)
  const tz = settings.timezone || 'UTC'
  const localDate = (d: string) => { try { return localParts(tz, new Date(d)).date } catch { return localParts('UTC', new Date(d)).date } }
  const trainedToday = dates.some(d => localDate(d) === local.date)

  const today = planData?.weeklySchedule?.find((d: any) => d.day === local.weekday)
  if (today?.type === 'workout' && !trainedToday) {
    const n = today.workout?.exercises?.length ?? 0
    return {
      title: 'Time to train 💪',
      body: `Today: ${today.title}${n ? ` · ${n} exercises` : ''}${today.durationMinutes ? ` · ~${today.durationMinutes} min` : ''}`,
      tag: 'workout-day',
    }
  }

  if (settings.streak_warnings && local.weekday === 'Sunday') {
    const { streak, trainedThisWeek } = streakBeforeThisWeek(dates, now)
    if (streak > 0 && !trainedThisWeek) {
      return {
        title: `Your ${streak}-week streak ends tonight 🔥`,
        body: 'One workout today keeps it alive.',
        tag: 'streak',
      }
    }
  }
  return null
}
