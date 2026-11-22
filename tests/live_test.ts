// Kamil Postaağası, 2023501030
import { assertEquals } from "@std/assert";
import { LiveHub, type SocketLike } from "../src/live.ts";
import { freshApp, login, send } from "./helpers.ts";

class FakeSocket implements SocketLike {
  readyState = 1;
  got: unknown[] = [];
  send(data: string) {
    this.got.push(JSON.parse(data));
  }
}

Deno.test("GET /ws with a bad or missing token is 401, before any upgrade", async () => {
  const app = await freshApp();
  const missing = await app.request("/ws");
  const bad = await app.request("/ws?token=not-a-token");
  assertEquals([missing.status, bad.status], [401, 401]);
  assertEquals((await bad.json()).error, "unauthorized");
});

Deno.test("hub: an event reaches only the owner's open sockets", () => {
  const hub = new LiveHub();
  const tab1 = new FakeSocket();
  const tab2 = new FakeSocket();
  const stranger = new FakeSocket();
  const closed = new FakeSocket();
  closed.readyState = 3;
  hub.add(1, tab1);
  hub.add(1, tab2);
  hub.add(1, closed);
  hub.add(2, stranger);
  hub.publish(1, { type: "deleted", task: { id: 9 } });
  assertEquals([tab1.got.length, tab2.got.length, stranger.got.length], [1, 1, 0]);
  assertEquals(closed.got.length, 0);
  hub.remove(1, tab1);
  hub.remove(1, tab2);
  hub.remove(1, closed);
  assertEquals(hub.count(1), 0);
});

Deno.test("two real WebSockets: a task made in one 'tab' appears in the other at once", async () => {
  const app = await freshApp();
  const token = await login(app);
  const other = await login(app, "other@example.com");
  const server = Deno.serve({ port: 0, onListen() {} }, app.fetch);
  const url = `ws://localhost:${server.addr.port}/ws?token=`;

  const open = (t: string) =>
    new Promise<{ ws: WebSocket; messages: unknown[] }>((resolve) => {
      const ws = new WebSocket(url + t);
      const messages: unknown[] = [];
      ws.onmessage = (e) => messages.push(JSON.parse(e.data));
      ws.onopen = () => resolve({ ws, messages });
    });
  const mine = await open(token);
  const theirs = await open(other);
  await new Promise((r) => setTimeout(r, 50)); // let the server run onopen

  const created = await (await send(app, "POST", "/api/tasks", { title: "live!" }, token))
    .json();
  await new Promise((r) => setTimeout(r, 100));
  assertEquals(mine.messages, [{ type: "created", task: created }]);
  assertEquals(theirs.messages, []); // the other user hears nothing

  for (const { ws } of [mine, theirs]) {
    const closed = new Promise((r) => (ws.onclose = r));
    ws.close();
    await closed;
  }
  await server.shutdown();
});
