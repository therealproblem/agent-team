import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_LOCAL_PORT = 8765;
const MAX_BODY_BYTES = 1024 * 1024;

function configuredSecret(): string | undefined {
  return process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || undefined;
}

function localPort(): number {
  const raw = process.env.TELEGRAM_WEBHOOK_LOCAL_PORT?.trim();
  if (!raw) return DEFAULT_LOCAL_PORT;
  const port = Number(raw);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : DEFAULT_LOCAL_PORT;
}

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
}

function safeEqual(a: string | undefined, b: string): boolean {
  return typeof a === "string" && a.length === b.length && a === b;
}

export async function POST(req: Request, ctx: { params: Promise<{ secret: string }> }) {
  const secret = configuredSecret();
  if (!secret) return unauthorized();

  const params = await ctx.params;
  const pathSecret = params.secret;
  const headerSecret = req.headers.get("x-telegram-bot-api-secret-token") ?? undefined;
  if (!safeEqual(pathSecret, secret) || !safeEqual(headerSecret, secret)) {
    return unauthorized();
  }

  const body = await req.text();
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "Payload too large." }, { status: 413 });
  }
  try {
    JSON.parse(body);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  let forwarded: Response;
  try {
    forwarded = await fetch(`http://127.0.0.1:${localPort()}/telegram/update`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": secret,
      },
      body,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Local Telegram receiver unavailable." }, { status: 503 });
  }

  if (!forwarded.ok) {
    const status = forwarded.status >= 500 ? 503 : forwarded.status;
    return NextResponse.json(
      { ok: false, error: status === 503 ? "Local Telegram receiver unavailable." : "Local Telegram receiver rejected update." },
      { status },
    );
  }

  return NextResponse.json({ ok: true });
}
