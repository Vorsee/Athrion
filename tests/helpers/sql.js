// The applied migrations live in supabase/schema.sql, one section per original file
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SCHEMA = readFileSync(join(__dirname, '../../supabase/schema.sql'), 'utf8')

// The text of one migration, by its heading: sqlSection('011_notifications')
export function sqlSection(id) {
  const start = SCHEMA.indexOf(`-- ═══ ${id}`)
  if (start < 0) throw new Error(`No section ${id} in supabase/schema.sql`)
  const next = SCHEMA.indexOf('\n-- ═══ ', start + 1)
  return SCHEMA.slice(start, next < 0 ? undefined : next)
}
