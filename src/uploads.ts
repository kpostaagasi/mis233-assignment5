// Kamil Postaağası, 2023501030
import { join } from "@std/path";

export const MAX_BYTES = 1_000_000; // 1 MB

/** The allowed types, with the first bytes every such file starts with. */
const TYPES = {
  "image/png": { ext: ".png", magic: [0x89, 0x50, 0x4e, 0x47] },
  "image/jpeg": { ext: ".jpg", magic: [0xff, 0xd8, 0xff] },
} as const;
type Mime = keyof typeof TYPES;

export type UploadCheck =
  | { ok: true; file: File; mime: Mime }
  | { ok: false; status: 400 | 413 | 415; error: string };

const isMime = (t: string): t is Mime => t in TYPES;

/**
 * The three checks of the handout, in order: is it a file (400), is it small enough (413),
 * is it a PNG or JPEG (415). The type a browser sends can be faked, so the first bytes of
 * the file must match it as well.
 */
export async function checkUpload(value: unknown): Promise<UploadCheck> {
  if (!(value instanceof File)) {
    return { ok: false, status: 400, error: 'file required (form field "file")' };
  }
  if (value.size > MAX_BYTES) {
    return { ok: false, status: 413, error: "file too large (max 1 MB)" };
  }
  if (!isMime(value.type)) {
    return { ok: false, status: 415, error: "only image/png and image/jpeg are allowed" };
  }
  const head = new Uint8Array(await value.slice(0, 4).arrayBuffer());
  if (!TYPES[value.type].magic.every((b, i) => head[i] === b)) {
    return {
      ok: false,
      status: 415,
      error: "the file content is not a real " + value.type,
    };
  }
  return { ok: true, file: value, mime: value.type };
}

/** Save under a random name; the user's file name is never used on our disk. */
export async function saveUpload(dir: string, file: File, mime: Mime): Promise<string> {
  await Deno.mkdir(dir, { recursive: true });
  const name = crypto.randomUUID() + TYPES[mime].ext;
  await Deno.writeFile(join(dir, name), new Uint8Array(await file.arrayBuffer()));
  return name;
}

export function contentTypeOf(name: string): string {
  return name.endsWith(".png") ? "image/png" : "image/jpeg";
}

/** Our own generated names only: a UUID and .png or .jpg. Nothing like "../". */
export const SAFE_NAME = /^[0-9a-f-]{36}\.(png|jpg)$/;

export async function removeUpload(dir: string, name: string | null) {
  if (!name || !SAFE_NAME.test(name)) return;
  await Deno.remove(join(dir, name)).catch(() => {}); // already gone is fine
}
