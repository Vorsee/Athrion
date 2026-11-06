// Accounts under 16 (032) can't pay for anything. Before 032 runs, the function is missing:
// nobody is a minor then, since sign-up was 16 and over.
export async function isMinor(supabase, userId) {
  const { data, error } = await supabase.rpc('is_minor', { p_user: userId })
  if (error) return false
  return data === true
}
export const MINOR_MESSAGE = "Purchases aren't available on accounts under 16."
