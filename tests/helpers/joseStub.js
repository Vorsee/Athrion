// npm:jose in Edge Functions (send-reminders' apns.ts). The tests run without the APNS_* secrets,
// so Apple push is skipped and these are never called.
export async function importPKCS8() { return {} }
export class SignJWT {
  setProtectedHeader() { return this }
  setIssuer() { return this }
  setIssuedAt() { return this }
  async sign() { return 'test.jwt' }
}
