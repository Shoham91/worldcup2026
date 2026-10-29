import "server-only";
import { cookies } from "next/headers";
import crypto from "node:crypto";

const COOKIE = "wc26_session";
const SECRET = process.env.SESSION_SECRET ?? "dev-secret-change-me";

// token = "<userId>.<hmac>"  — stateless, signed with the server secret.
function sign(userId: number): string {
  const hmac = crypto
    .createHmac("sha256", SECRET)
    .update(String(userId))
    .digest("hex");
  return `${userId}.${hmac}`;
}

function verify(token: string | undefined): number | null {
  if (!token) return null;
  const [idPart, sig] = token.split(".");
  if (!idPart || !sig) return null;
  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(idPart)
    .digest("hex");
  // constant-time compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const id = Number(idPart);
  return Number.isInteger(id) ? id : null;
}

export async function createSession(userId: number): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, sign(userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 60, // 60 days
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function getSessionUserId(): Promise<number | null> {
  const store = await cookies();
  return verify(store.get(COOKIE)?.value);
}
