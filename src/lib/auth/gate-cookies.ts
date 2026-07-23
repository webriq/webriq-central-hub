import { cookies } from "next/headers";

export async function setGateCookie(name: string, value: string, maxAgeSeconds: number) {
  const cookieStore = await cookies();
  cookieStore.set(name, value, {
    httpOnly: true,
    secure: true,
    path: "/v2",
    sameSite: "lax",
    maxAge: maxAgeSeconds,
  });
}

export async function clearGateCookie(name: string) {
  const cookieStore = await cookies();
  cookieStore.set(name, "", { maxAge: 0, path: "/v2", httpOnly: true });
}
