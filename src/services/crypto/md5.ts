export const md5 = (message: string): string => {
  const buffer = new TextEncoder().encode(message);
  const n = buffer.length;

  // 更加语义化的字数组初始化
  const words = new Uint32Array((((n + 8) >> 6) + 1) << 4);
  for (let i = 0; i < n; i++) words[i >> 2] |= buffer[i] << ((i % 4) * 8);
  words[n >> 2] |= 0x80 << ((n % 4) * 8);
  words[words.length - 2] = n * 8;

  let [a, b, c, d] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];

  // 预计算常量（可以在模块级缓存以提升性能）
  const K = Uint32Array.from(
    { length: 64 },
    (_, i) => (Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0,
  );
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5,
    9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11,
    16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10,
    15, 21,
  ];

  const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n));

  for (let i = 0; i < words.length; i += 16) {
    let [A, B, C, D] = [a, b, c, d];

    for (let j = 0; j < 64; j++) {
      let f, g;
      if (j < 16) {
        f = (B & C) | (~B & D);
        g = j;
      } else if (j < 32) {
        f = (D & B) | (~D & C);
        g = (5 * j + 1) % 16;
      } else if (j < 48) {
        f = B ^ C ^ D;
        g = (3 * j + 5) % 16;
      } else {
        f = C ^ (B | ~D);
        g = (7 * j) % 16;
      }

      const temp = D;
      D = C;
      C = B;
      // 使用 | 0 强制进行 32 位有符号运算，有助于引擎优化
      const x = (A + f + K[j] + words[i + g]) | 0;
      B = (B + rotl(x, S[j])) | 0;
      A = temp;
    }
    a = (a + A) | 0;
    b = (b + B) | 0;
    c = (c + C) | 0;
    d = (d + D) | 0;
  }

  // 使用 DataView 优雅地输出小端序十六进制
  const outBuf = new ArrayBuffer(16);
  const view = new DataView(outBuf);
  [a, b, c, d].forEach((val, i) => view.setUint32(i * 4, val, true));

  return Array.from(new Uint8Array(outBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};