import { createHash } from 'node:crypto';

/**
 * WBI signing for bilibili web APIs.
 *
 * Since 2023 bilibili signs most `wbi/*` endpoints with `wts` + `w_rid`:
 *   1. fetch img_key / sub_key from /x/web-interface/nav (no login needed)
 *   2. mixin_key = permute(img_key + sub_key)[:32]   (table below)
 *   3. sort params, add wts, strip !'()* from values
 *   4. w_rid = md5(urlencode(params) + mixin_key)
 *
 * Reference: SocialSisterYi/bilibili-API-collect (WBI 签名章节).
 * Pure functions only — no I/O, deterministic given wts, so unit tests can
 * pin exact signatures.
 */

/** Standard 64-position permutation used to derive the mixin key. */
export const MIXIN_KEY_ENC_TAB: readonly number[] = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

/** Derive the 32-char mixin key from img_key + sub_key. */
export function getMixinKey(imgKey: string, subKey: string): string {
  const orig = imgKey + subKey;
  return MIXIN_KEY_ENC_TAB.map((i) => orig[i])
    .join('')
    .slice(0, 32);
}

/**
 * Sign `params` with the mixin key. Returns a NEW params object including
 * `wts` and `w_rid`. Pass `wts` explicitly in tests for deterministic output.
 */
export function signParams(
  params: Record<string, string | number>,
  mixinKey: string,
  wts: number = Math.floor(Date.now() / 1000),
): Record<string, string> {
  const withWts: Record<string, string | number> = { ...params, wts };

  // sort by key, coerce to string, strip characters bilibili rejects
  const cleaned: Record<string, string> = {};
  for (const key of Object.keys(withWts).sort()) {
    cleaned[key] = String(withWts[key]!).replace(/[!'()*]/g, '');
  }

  const query = new URLSearchParams(cleaned).toString();
  const wRid = createHash('md5').update(query + mixinKey).digest('hex');
  return { ...cleaned, w_rid: wRid };
}

/** Extract the key basename from a wbi_img URL (`.../xxxx.png` → `xxxx`). */
export function extractKeyFromWbiUrl(url: string): string {
  const file = url.slice(url.lastIndexOf('/') + 1);
  const dot = file.indexOf('.');
  return dot === -1 ? file : file.slice(0, dot);
}
