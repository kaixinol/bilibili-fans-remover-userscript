import { md5 } from "../crypto/md5";

const mixinKeyEncTab = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52
] as const;

const getMixinKey = (origin: string): string =>
  mixinKeyEncTab.map((index) => origin[index]).join("").slice(0, 32);

export function encWbi(
  params: Record<string, string | number>,
  imgKey: string,
  subKey: string
): string {
  const mixinKey = getMixinKey(imgKey + subKey);
  const currentTime = Math.round(Date.now() / 1000);
  const characterFilter = /[!'()*]/g;
  const enrichedParams: Record<string, string | number> = { ...params, wts: currentTime };

  const query = Object.keys(enrichedParams)
    .sort()
    .map((key) => {
      const value = String(enrichedParams[key]).replace(characterFilter, "");
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    })
    .join("&");

  return `${query}&w_rid=${md5(query + mixinKey)}`;
}
