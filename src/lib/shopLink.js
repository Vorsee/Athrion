// Share links into the coach shop: athrion.app/shop/<product id> and /shop/coach/<coach id>.
// Signed out they open a public preview; the link is remembered so it opens after sign-up.
const PATH = /^\/shop\/(coach\/)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i
const KEY = 'athrion_shop_link'

// { kind: 'product' | 'coach', id } or null
export function parseShopPath(pathname) {
  const m = PATH.exec(pathname)
  return m ? { kind: m[1] ? 'coach' : 'product', id: m[2].toLowerCase() } : null
}

export const productLink = id => `${window.location.origin}/shop/${id}`
export const coachLink = id => `${window.location.origin}/shop/coach/${id}`

// The openTarget string App uses: shop:<product>: or shopcoach:<coach>
export const shopTarget = link => (link.kind === 'coach' ? `shopcoach:${link.id}` : `shop:${link.id}:`)

export function rememberShopLink(link) {
  try { localStorage.setItem(KEY, JSON.stringify(link)) } catch {}
}
export function readShopLink() {
  try {
    const link = JSON.parse(localStorage.getItem(KEY))
    return link?.id && (link.kind === 'product' || link.kind === 'coach') ? link : null
  } catch { return null }
}
export function clearShopLink() {
  try { localStorage.removeItem(KEY) } catch {}
}

// The phone's share sheet, or copy the link. true when it was copied (to say so).
export async function shareLink(url, text) {
  try {
    if (navigator.share) { await navigator.share({ title: 'ATHRION', text, url }); return false }
    await navigator.clipboard.writeText(url)
    return true
  } catch { return false } // closing the share sheet is not an error
}
