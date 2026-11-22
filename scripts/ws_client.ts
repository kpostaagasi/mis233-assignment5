// Kamil Postaağası, 2023501030
// Bonus 13: a small client that plays "the other tab". It logs in, opens the WebSocket and
// prints every event. Make a change with curl or the UI and watch it appear here.
// Run: deno run -A scripts/ws_client.ts demo@example.com demo-pass-1 [http://localhost:8000]
const [email, password, base = "http://localhost:8000"] = Deno.args;
if (!email || !password) {
  console.error("usage: deno run -A scripts/ws_client.ts <email> <password> [base-url]");
  Deno.exit(1);
}

const res = await fetch(`${base}/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});
if (!res.ok) {
  console.error(`login failed: ${res.status} ${await res.text()}`);
  Deno.exit(1);
}
const { token } = await res.json();

const ws = new WebSocket(`${base.replace(/^http/, "ws")}/ws?token=${token}`);
ws.onopen = () => console.log(`[${new Date().toISOString()}] connected as ${email}`);
ws.onmessage = (e) => console.log(`[${new Date().toISOString()}] ${e.data}`);
ws.onclose = (e) => console.log(`closed (${e.code})`);
