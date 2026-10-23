// The modules that read and write Supabase. Checks each call goes to the right table,
// is scoped to the signed-in user where it writes, and surfaces errors.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { sb, USER } from '../helpers/supabaseMock.js'

vi.mock('../../src/lib/supabase.js', () => ({ supabase: sb.supabase }))

import * as api from '../../src/lib/api.js'
import * as fit from '../../src/lib/fitnessApi.js'
import * as prog from '../../src/lib/progressApi.js'
import * as group from '../../src/lib/groupApi.js'

beforeEach(() => { sb.reset(); vi.unstubAllGlobals() })
const ok = data => ({ data, error: null })
const fail = message => ({ data: null, error: { message, code: 'X' } })
const last = table => sb.queriesFor(table).at(-1)

describe('api.js', () => {
  it('saves the profile for the signed-in user with an upsert', async () => {
    sb.set('user_profiles', ok({ id: 1 }))
    await api.saveUserProfile({ sex: 'male', height_cm: 180, weight_lb: 180, age: 30 })
    const [row, opts] = sb.op(last('user_profiles'), 'upsert')
    expect(row).toMatchObject({ user_id: USER.id, sex: 'male' })
    expect(opts).toEqual({ onConflict: 'user_id' })
  })
  it('saves goals and fetches the profile', async () => {
    sb.set('user_profiles', ok({ calorie_goal: 2000 }))
    await api.saveGoals({ calorie_goal: 2000, protein_goal: 150, carb_goal: 200 })
    expect(await api.fetchUserProfile()).toEqual({ calorie_goal: 2000 })
  })
  it('throws database errors', async () => {
    sb.set('user_profiles', fail('nope'))
    await expect(api.fetchUserProfile()).rejects.toMatchObject({ message: 'nope' })
  })
  it('creates and updates custom workouts', async () => {
    sb.set('custom_workouts', ok({ id: 'w1' }))
    await api.saveCustomWorkout('Push', ['Bench'])
    expect(sb.op(last('custom_workouts'), 'insert')[0]).toEqual({ user_id: USER.id, name: 'Push', exercises: ['Bench'] })
    await api.saveCustomWorkout('Push 2', ['Bench'], 'w1')
    expect(sb.op(last('custom_workouts'), 'eq')).toEqual(['id', 'w1'])
    await api.deleteCustomWorkout('w1')
    expect(sb.op(last('custom_workouts'), 'delete')).toEqual([])
    sb.set('custom_workouts', ok([]))
    expect(await api.fetchCustomWorkouts()).toEqual([])
  })
  it('logs workouts and reads history newest first', async () => {
    sb.set('workout_logs', ok({ id: 'l1' }))
    await api.saveWorkoutEntry({ date: '2026-10-23', name: 'Legs', duration: '40min', volume: 5000, sets: [] })
    expect(sb.op(last('workout_logs'), 'insert')[0]).toMatchObject({ user_id: USER.id, name: 'Legs', volume: 5000 })
    sb.set('workout_logs', ok([]))
    await api.fetchWorkoutHistory()
    expect(sb.op(last('workout_logs'), 'order')).toEqual(['created_at', { ascending: false }])
  })
  it('reports Pro only for status "pro", and false on errors', async () => {
    sb.set('subscriptions', ok({ status: 'pro' }))
    expect(await api.fetchSubscriptionStatus()).toBe(true)
    sb.set('subscriptions', ok({ status: 'free' }))
    expect(await api.fetchSubscriptionStatus()).toBe(false)
    sb.set('subscriptions', () => { throw new Error('offline') })
    expect(await api.fetchSubscriptionStatus()).toBe(false)
  })
  it('totals calories when saving the day log', async () => {
    sb.set('calorie_logs', ok({ id: 'c1' }))
    await api.saveTodayCalorieLog('2026-10-23', [{ kcal: 300 }, { kcal: 450 }, {}])
    expect(sb.op(last('calorie_logs'), 'insert')[0]).toMatchObject({ user_id: USER.id, date: '2026-10-23', total_calories: 750 })
    await api.saveTodayCalorieLog('2026-10-23', [{ kcal: 100 }], 'c1')
    expect(sb.op(last('calorie_logs'), 'update')[0]).toEqual({ foods: [{ kcal: 100 }], total_calories: 100 })
    sb.set('calorie_logs', ok([]))
    await api.fetchCalorieLogs()
    await api.fetchTodayCalorieLog('2026-10-23')
    expect(sb.op(last('calorie_logs'), 'eq')).toEqual(['date', '2026-10-23'])
  })
})

describe('fitnessApi.js', () => {
  const fp = { primaryGoal: 'build_muscle', activityLevel: 'very_active', workoutDaysPerWeek: 4 }
  it('maps the camelCase profile to snake_case columns with safe defaults', async () => {
    sb.set('fitness_profiles', ok({}))
    await fit.saveFitnessProfile(fp)
    const [row] = sb.op(last('fitness_profiles'), 'upsert')
    expect(row).toMatchObject({ user_id: USER.id, primary_goal: 'build_muscle', workout_days_per_week: 4, secondary_goals: [], injuries: '', onboarding_completed: false })
  })
  it('round-trips profile and nutrition rows through the payload converters', () => {
    const row = { primary_goal: 'lose_weight', workout_days_per_week: 3, onboarding_completed: true }
    expect(fit.dbProfileToPayload(row)).toMatchObject({ primaryGoal: 'lose_weight', workoutDaysPerWeek: 3, availableEquipment: [], onboardingCompleted: true })
    expect(fit.dbNutritionToPayload({ calorie_target: 2000, protein_grams: 150 })).toMatchObject({ calorieTarget: 2000, proteinGrams: 150, safetyFlags: [] })
  })
  it('saves nutrition targets and reads the latest', async () => {
    sb.set('nutrition_targets', ok({ id: 'n1' }))
    await fit.saveNutritionTarget({ calorieTarget: 2100, proteinGrams: 160 })
    expect(sb.op(last('nutrition_targets'), 'insert')[0]).toMatchObject({ user_id: USER.id, calorie_target: 2100, safety_flags: [] })
    await fit.fetchLatestNutritionTarget()
    expect(sb.op(last('nutrition_targets'), 'limit')).toEqual([1])
  })
  it('calls the plan Edge Function with the user token and mode', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ plan: { id: 'p1' } }) }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await fit.generatePlan(fp, { calorieTarget: 2000 }, 'adapt')).toEqual({ id: 'p1' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://test.supabase.co/functions/v1/generate-fitness-plan')
    expect(init.headers.Authorization).toBe('Bearer jwt-token')
    expect(JSON.parse(init.body).mode).toBe('adapt')
  })
  it('surfaces Edge Function errors and requires a session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429, json: async () => ({ error: 'Please wait before generating another plan.' }) })))
    await expect(fit.generatePlan(fp, {})).rejects.toThrow('Please wait')
    sb.state.user = null
    await expect(fit.generatePlan(fp, {})).rejects.toThrow('Not authenticated')
  })
  it('reads the active plan and saves edits and check-ins', async () => {
    sb.set('fitness_plans', ok({ id: 'p1' }))
    expect(await fit.fetchActivePlan()).toEqual({ id: 'p1' })
    expect(sb.op(last('fitness_plans'), 'eq')).toEqual(['status', 'active'])
    await fit.updatePlanData('p1', { week: 2 })
    expect(sb.op(last('fitness_plans'), 'update')[0].plan_data).toEqual({ week: 2 })
    sb.set('progress_checkins', ok({ id: 'c1' }))
    await fit.saveCheckin({ weight_lb: 180 })
    expect(sb.op(last('progress_checkins'), 'insert')[0]).toEqual({ weight_lb: 180, user_id: USER.id })
    await fit.fetchLatestCheckin()
    await fit.fetchFitnessProfile()
  })
})

describe('progressApi.js', () => {
  it('upserts one measurement per day', async () => {
    sb.set('body_measurements', ok({ id: 'm1' }))
    await prog.saveMeasurement({ date: '2026-10-23', weight_lb: 180 })
    expect(sb.op(last('body_measurements'), 'upsert')).toEqual([{ date: '2026-10-23', weight_lb: 180, user_id: USER.id }, { onConflict: 'user_id,date' }])
    await prog.deleteMeasurement('m1')
    sb.set('body_measurements', ok([]))
    await prog.fetchMeasurements()
  })
  it('stamps health rows with the user and accepts one or many', async () => {
    sb.set('daily_health', ok(null))
    await prog.saveDailyHealth({ date: '2026-10-23', steps: 9000 })
    expect(sb.op(last('daily_health'), 'upsert')[0][0]).toMatchObject({ user_id: USER.id, steps: 9000 })
    sb.set('daily_health', ok([]))
    await prog.fetchDailyHealth(7)
  })
  it('stores photos in the user folder of the private bucket', async () => {
    sb.set('progress_photos', ok({ id: 'ph1' }))
    await prog.uploadProgressPhoto({ name: 'me.PNG', type: 'image/png' }, { date: '2026-10-23', pose: 'front' })
    const [path, , opts] = sb.bucket.upload.mock.calls[0]
    expect(path).toMatch(new RegExp(`^${USER.id}/2026-10-23-front-\\d+\\.png$`))
    expect(opts.contentType).toBe('image/png')
    expect(sb.supabase.storage.from).toHaveBeenCalledWith('progress-photos')
  })
  it('returns photos with short-lived signed URLs', async () => {
    sb.set('progress_photos', ok([{ id: 1, storage_path: 'u/a.jpg' }]))
    const photos = await prog.fetchProgressPhotos()
    expect(photos[0].url).toBe('https://signed/u/a.jpg')
    expect(sb.bucket.createSignedUrls).toHaveBeenCalledWith(['u/a.jpg'], 3600)
    sb.set('progress_photos', ok([]))
    expect(await prog.fetchProgressPhotos()).toEqual([])
  })
  it('deletes the file and the row', async () => {
    sb.set('progress_photos', ok(null))
    await prog.deleteProgressPhoto({ id: 1, storage_path: 'u/a.jpg' })
    expect(sb.bucket.remove).toHaveBeenCalledWith(['u/a.jpg'])
  })
  it('awards badges idempotently and skips empty lists', async () => {
    sb.set('user_badges', ok(null))
    await prog.awardBadges([])
    expect(sb.queriesFor('user_badges')).toHaveLength(0)
    await prog.awardBadges(['first_pr'])
    expect(sb.op(last('user_badges'), 'upsert')[1]).toMatchObject({ ignoreDuplicates: true })
    sb.set('user_badges', ok([]))
    await prog.fetchBadges()
  })
  it('saves reminder settings and push subscriptions', async () => {
    sb.set('reminder_settings', ok(null))
    await prog.saveReminderSettings({ enabled: true, reminder_hour: 18 })
    expect(sb.op(last('reminder_settings'), 'upsert')[0]).toMatchObject({ user_id: USER.id, enabled: true })
    await prog.fetchReminderSettings()
    sb.set('push_subscriptions', ok(null))
    await prog.savePushSubscription({ toJSON: () => ({ endpoint: 'https://push/1', keys: { p256dh: 'p', auth: 'a' } }) })
    expect(sb.op(last('push_subscriptions'), 'upsert')[0]).toEqual({ user_id: USER.id, endpoint: 'https://push/1', p256dh: 'p', auth: 'a' })
    await prog.deletePushSubscription('https://push/1')
  })
  it('turns check-ins into dated weigh-ins', async () => {
    sb.set('progress_checkins', ok([{ created_at: '2026-10-20T10:00:00Z', weight_lb: 181 }]))
    expect(await prog.fetchCheckinWeights()).toEqual([{ date: '2026-10-20', weight_lb: 181 }])
  })
})

describe('groupApi.js', () => {
  it('creates a room with a readable 6-character code and joins the host', async () => {
    sb.set('group_sessions', ok({ id: 's1' }))
    sb.set('group_participants', ok(null))
    await group.createGroupSession({ exercises: ['Squat'], totalSets: 3, restSecs: 60, displayName: 'Sam' })
    const [row] = sb.op(last('group_sessions'), 'insert')
    expect(row.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
    expect(row).toMatchObject({ host_id: USER.id, status: 'lobby' })
    expect(sb.op(last('group_participants'), 'insert')[0]).toEqual({ session_id: 's1', user_id: USER.id, display_name: 'Sam' })
  })
  it('joins by code (case-insensitive) and ignores "already joined"', async () => {
    sb.set('group_sessions', ok([{ id: 's1' }]))
    sb.set('group_participants', { data: null, error: { code: '23505' } })
    expect(await group.joinGroupSession('abc123', 'Kim')).toEqual({ id: 's1' })
    expect(sb.op(last('group_sessions'), 'eq')).toEqual(['code', 'ABC123'])
  })
  it('rejects unknown codes', async () => {
    sb.set('group_sessions', ok([]))
    await expect(group.joinGroupSession('ZZZZZZ', 'Kim')).rejects.toThrow('Room not found')
  })
  it('updates, starts and ends sessions and logs sets', async () => {
    sb.set('group_sessions', ok({ id: 's1' }))
    await group.updateSessionExercises('s1', ['A'], 4, 90)
    await group.updateExercisesOnly('s1', ['B'])
    await group.startGroupSession('s1')
    expect(sb.op(last('group_sessions'), 'update')[0]).toEqual({ status: 'active' })
    await group.endGroupSession('s1')
    expect(sb.op(last('group_sessions'), 'update')[0]).toEqual({ status: 'done' })
    await group.fetchGroupSession('s1')
    sb.set('group_sets', ok(null))
    await group.logGroupSet({ sessionId: 's1', displayName: 'Sam', exercise: 'A', setNum: 1, weight: 100, reps: 5 })
    expect(sb.op(last('group_sets'), 'insert')[0]).toMatchObject({ user_id: USER.id, set_num: 1 })
    expect(await group.fetchGroupSets('s1')).toEqual([])
    sb.set('group_participants', ok(null))
    expect(await group.fetchParticipants('s1')).toEqual([])
  })
  it('subscribes to realtime changes filtered to the session and unsubscribes', () => {
    const unsub = group.subscribeToGroupSession('s1', { onSet: vi.fn(), onParticipant: vi.fn(), onSessionUpdate: vi.fn() })
    const filters = sb.channel.on.mock.calls.map(c => c[1].filter)
    expect(filters).toEqual(['session_id=eq.s1', 'session_id=eq.s1', 'id=eq.s1'])
    unsub()
    expect(sb.supabase.removeChannel).toHaveBeenCalled()
  })
  it('team helpers call their tables (note: teams tables do not exist in the live database)', async () => {
    sb.supabase.rpc.mockResolvedValueOnce({ data: { error: 'Team not found' }, error: null })
    await expect(group.joinTeamByCode('X', 'Sam')).rejects.toThrow('Team not found')
    sb.set('teams', ok([]))
    expect(await group.fetchMyTeams()).toEqual([])
  })
})
