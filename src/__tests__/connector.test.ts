import { afterEach, describe, expect, it, vi } from "vitest";
import { NeteaseAccountConnector } from "../index";

const BASE = "https://mock-netease.test";

function mockFetch(handler: (url: string) => unknown) {
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = typeof input === "string" ? input : input.toString();
    return Promise.resolve(new Response(JSON.stringify(handler(url)), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
  });
}

describe("NeteaseAccountConnector (contract)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("declares a distinct desktop account variant", async () => {
    const c = new NeteaseAccountConnector();
    expect(c.meta.id).toBe("netease-cloud-music-account");
    expect(c.meta.familyId).toBe("netease-cloud-music");
    expect(c.meta.capabilities).toContain("search");
    expect(c.meta.capabilities).toContain("stream");
    expect(c.meta.capabilities).toContain("login");
    expect(c.meta.variant).toBe("account");
    expect(c.meta.authRequirement).toBe("required");
    expect(c.meta.supportedHosts).toEqual(["desktop"]);
    expect(c.meta.configSchema?.find(f => f.key === "apiBaseUrl")?.required).toBe(false);
    expect(c.meta.configSchema?.find(f => f.key === "cookie")).toBeUndefined();
  });

  it("does not bind to an unowned public proxy by default", async () => {
    const c = new NeteaseAccountConnector();
    await c.init();
    expect(await c.search({ keyword: "周杰伦" })).toEqual({ tracks: [], total: 0, page: 1, pageSize: 20 });
  });

  it("rejects unsafe gateway addresses", async () => {
    const c = new NeteaseAccountConnector();
    await expect(c.init({ apiBaseUrl: "http://gateway.example.com" })).rejects.toThrow("HTTPS");
    await expect(c.init({ apiBaseUrl: "https://user:secret@gateway.example.com" })).rejects.toThrow("内嵌凭据");
  });

  it("search returns track-shaped results", async () => {
    mockFetch((url) => {
      expect(url).toContain("/cloudsearch");
      expect(url).toContain(BASE);
      return {
        code: 200,
        result: {
          songCount: 1,
          songs: [{
            id: 12345,
            name: "晴天",
            ar: [{ id: 1, name: "周杰伦" }],
            al: { id: 2, name: "叶惠美", picUrl: "https://img/cover.jpg" },
            dt: 269000,
            fee: 0,
          }],
        },
      };
    });
    const c = new NeteaseAccountConnector();
    await c.init({ apiBaseUrl: BASE });
    const r = await c.search({ keyword: "周杰伦", pageSize: 10 });
    expect(r.tracks).toHaveLength(1);
    const t = r.tracks[0];
    expect(t.id).toBe("netease:12345");
    expect(t.title).toBe("晴天");
    expect(t.artist).toBe("周杰伦");
    expect(t.album).toBe("叶惠美");
    expect(t.coverUrl).toBe("https://img/cover.jpg");
    expect(t.durationSec).toBe(269);
  });

  it("getStreamUrl returns a playable url + format", async () => {
    mockFetch((url) => {
      expect(url).toContain("/song/url/v1");
      return {
        code: 200,
        data: [{
          id: 12345,
          url: "https://m801.music.126.net/path/file.mp3",
          br: 320000,
          type: "mp3",
          expi: 1200,
        }],
      };
    });
    const c = new NeteaseAccountConnector();
    await c.init({ apiBaseUrl: BASE });
    const info = await c.getStreamUrl("netease:12345");
    expect(info).not.toBeNull();
    expect(info!.url).toMatch(/^https?:\/\//);
    expect(info!.format).toBe("mp3");
  });

  it("getStreamUrl returns null for locked tracks (paid / unavailable)", async () => {
    mockFetch(() => ({ code: 200, data: [{ id: 12345, url: null, br: 0, type: "", expi: 0 }] }));
    const c = new NeteaseAccountConnector();
    await c.init({ apiBaseUrl: BASE });
    expect(await c.getStreamUrl("netease:12345")).toBeNull();
  });

  it("listPlaylists returns playlist-shaped results", async () => {
    mockFetch((url) => {
      expect(url).toContain("/top/playlist");
      return {
        code: 200,
        total: 1,
        playlists: [{
          id: 991010,
          name: "经典华语",
          description: "时光长河里的好歌",
          coverImgUrl: "https://p1.music.126.net/cover.jpg",
          trackCount: 100,
          creator: { nickname: "网易云音乐" },
        }],
      };
    });
    const c = new NeteaseAccountConnector();
    await c.init({ apiBaseUrl: BASE });
    const r = await c.listPlaylists!();
    expect(r.playlists).toHaveLength(1);
    const p = r.playlists[0];
    expect(p.id).toBe("netease-playlist:991010");
    expect(p.name).toBe("经典华语");
    expect(p.coverUrl).toContain("p1.music.126.net");
    expect(p.trackCount).toBe(100);
    expect(p.curator).toBe("网易云音乐");
    expect(p.externalUrl).toContain("music.163.com");
  });

  it("listPlaylists forwards sort param to upstream order=new", async () => {
    let sawOrder = "";
    mockFetch((url) => {
      const m = url.match(/[?&]order=([^&]+)/);
      if (m) sawOrder = m[1];
      return { code: 200, total: 0, playlists: [] };
    });
    const c = new NeteaseAccountConnector();
    await c.init({ apiBaseUrl: BASE });
    await c.listPlaylists!({ sort: "new" });
    expect(sawOrder).toBe("new");
    await c.listPlaylists!({ sort: "hot" });
    expect(sawOrder).toBe("hot");
  });

  it("getPlaylistTracks returns the playlist's songs", async () => {
    mockFetch((url) => {
      expect(url).toContain("/playlist/track/all");
      expect(url).toContain("id=991010");
      return {
        code: 200,
        songs: [{
          id: 12345, name: "晴天",
          ar: [{ id: 1, name: "周杰伦" }],
          al: { id: 2, name: "叶惠美", picUrl: "https://x/c.jpg" },
          dt: 269000, fee: 0,
        }],
      };
    });
    const c = new NeteaseAccountConnector();
    await c.init({ apiBaseUrl: BASE });
    const r = await c.getPlaylistTracks!("netease-playlist:991010");
    expect(r.tracks).toHaveLength(1);
    expect(r.tracks[0].id).toBe("netease:12345");
  });

  it("starts official desktop cookie capture without proxy polling", async () => {
    const c = new NeteaseAccountConnector();
    await c.init();

    const result = await c.login({ intent: "start" });
    expect(result.status).toBe("pending");
    expect(result.flow).toBe("browser");
    expect(result.flowId).toBe("netease-web-cookie");
    expect(result.nextPollMs).toBeUndefined();
    expect(result.actions).toHaveLength(1);
    expect(result.actions?.[0]).toMatchObject({
      type: "open-url",
      url: "https://music.163.com/#/login",
      cookieCapture: {
        provider: "netease",
        requiredCookieNames: ["MUSIC_U"],
      },
    });
  });

  it("validates captured MUSIC_U and never returns a secret configPatch", async () => {
    const c = new NeteaseAccountConnector();
    await c.init();

    const invalid = await c.login({
      intent: "continue",
      flowId: "netease-web-cookie",
      input: { cookie: "__csrf=missing-login-cookie" },
    });
    expect(invalid.status).toBe("error");

    const authenticated = await c.login({
      intent: "continue",
      flowId: "netease-web-cookie",
      input: { cookie: "MUSIC_U=session-secret; __csrf=csrf-value" },
    });
    expect(authenticated.status).toBe("authenticated");
    expect(authenticated.configPatch).toBeUndefined();
    expect(JSON.stringify(authenticated)).not.toContain("session-secret");
    expect((await c.login({ intent: "status" })).status).toBe("authenticated");
  });

  it("accepts a host-vault cookie through init and logs out without a secret patch", async () => {
    const c = new NeteaseAccountConnector();
    await c.init({ cookie: "MUSIC_U=vault-secret" });
    expect((await c.login({ intent: "status" })).status).toBe("authenticated");

    const logout = await c.login({ intent: "logout" });
    expect(logout.status).toBe("anonymous");
    expect(logout.configPatch).toBeUndefined();
    expect(JSON.stringify(logout)).not.toContain("vault-secret");
    expect((await c.login({ intent: "status" })).status).toBe("anonymous");
  });

  it("never sends an injected account cookie to the configurable anonymous catalog gateway", async () => {
    const requestedUrls: string[] = [];
    mockFetch((url) => {
      requestedUrls.push(url);
      if (url.includes("/cloudsearch")) {
        return { code: 200, result: { songCount: 0, songs: [] } };
      }
      return { code: 200 };
    });

    const c = new NeteaseAccountConnector();
    await c.init({ apiBaseUrl: BASE, cookie: "MUSIC_U=session-secret; __csrf=csrf-value" });
    await c.search({ keyword: "周杰伦" });
    expect(requestedUrls).toHaveLength(1);
    expect(requestedUrls[0]).not.toContain("cookie");
    expect(requestedUrls[0]).not.toContain("MUSIC_U");
    expect(requestedUrls[0]).not.toContain("session-secret");
  });
});
