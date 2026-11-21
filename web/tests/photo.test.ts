import { describe, expect, it } from "vitest";
import { MAX_PHOTO_BYTES, parsePhoto, sniffImage } from "@/lib/photo";

const b64 = (b: Buffer) => b.toString("base64");
const jpeg = (w: number, h: number, tail: number[] = []) =>
  Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0),
    0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, ...new Array(9).fill(0),
    0xff, 0xda, 0x00, 0x02, 0xff, 0xd9, ...tail,
  ]);
const png = (w: number, h: number) => {
  const b = Buffer.alloc(8 + 25 + 12);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "latin1");
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]).copy(b, 33);
  return b;
};
const webp = (w: number, h: number) => {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "latin1");
  b.writeUInt32LE(22, 4);
  b.write("WEBPVP8X", 8, "latin1");
  b.writeUInt32LE(10, 16);
  b.writeUIntLE(w - 1, 24, 3);
  b.writeUIntLE(h - 1, 27, 3);
  return b;
};

describe("photo of text: input checks", () => {
  it("accepts JPEG, PNG and WebP by their bytes, with or without a data: prefix", () => {
    expect(parsePhoto(`data:image/jpeg;base64,${b64(jpeg(1600, 1200))}`)).toMatchObject({ mime: "image/jpeg", width: 1600, height: 1200 });
    expect(parsePhoto(b64(png(800, 600)))).toMatchObject({ mime: "image/png", width: 800, height: 600 });
    expect(parsePhoto(b64(webp(1024, 768)))).toMatchObject({ mime: "image/webp", width: 1024, height: 768 });
  });

  it("ignores the claimed type: a PNG sent as image/jpeg is a PNG", () => {
    expect(parsePhoto(`data:image/jpeg;base64,${b64(png(10, 10))}`)).toMatchObject({ mime: "image/png" });
  });

  it("refuses SVG with script, HEIC, GIF and HTML", () => {
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`);
    expect(parsePhoto(`data:image/svg+xml;base64,${b64(svg)}`)).toEqual({ error: "image must be a JPEG, PNG or WebP photo" });
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic"), Buffer.alloc(30)]);
    expect(parsePhoto(b64(heic))).toHaveProperty("error");
    expect(parsePhoto(b64(Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(40)])))).toHaveProperty("error");
    expect(parsePhoto(b64(Buffer.from("<html><body><script>alert(1)</script></body></html>")))).toHaveProperty("error");
  });

  it("refuses polyglots: bytes after the end marker", () => {
    const zip = [...Buffer.from("PK\u0003\u0004<script>alert(1)</script>")];
    expect(sniffImage(jpeg(100, 100))).not.toBeNull();
    expect(sniffImage(jpeg(100, 100, zip))).toBeNull();
    expect(sniffImage(Buffer.concat([png(10, 10), Buffer.from("<html>")]))).toBeNull();
    expect(sniffImage(Buffer.concat([webp(10, 10), Buffer.from("<html>")]))).toBeNull();
  });

  it("refuses oversized files and 10k x 10k headers", () => {
    expect(parsePhoto("A".repeat(Math.ceil(MAX_PHOTO_BYTES / 3) * 4 + 4))).toEqual({ error: "photo is too large" });
    expect(parsePhoto(b64(jpeg(10_000, 10_000)))).toEqual({ error: "photo is too large" });
    expect(parsePhoto(b64(png(4097, 10)))).toEqual({ error: "photo is too large" });
    expect(parsePhoto(b64(jpeg(0, 0)))).toEqual({ error: "photo is too large" });
  });

  it("one photo per message; junk is refused", () => {
    const one = b64(jpeg(10, 10));
    expect(parsePhoto([one, one])).toEqual({ error: "one photo per message" });
    expect(parsePhoto(undefined)).toHaveProperty("error");
    expect(parsePhoto({ data: one })).toHaveProperty("error");
    expect(parsePhoto("not base64 !!")).toEqual({ error: "image must be base64" });
    expect(parsePhoto(b64(Buffer.alloc(5)))).toHaveProperty("error");
  });
});
