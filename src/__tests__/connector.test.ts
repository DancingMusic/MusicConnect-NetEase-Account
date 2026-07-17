import { describe, expect, it, vi } from "vitest";
import type { MusicConnectorHostContext } from "@dancingmusic/music-connect";
import { NeteaseAccountConnector } from "../index";

const AUTH_CONFIG = { cookie: "MUSIC_U=session-secret; __csrf=csrf-value" };

function hostWith(
  handler: (operation: string, params: Record<string, unknown>) => unknown,
): MusicConnectorHostContext & { officialProviderRequest: ReturnType<typeof vi.fn> } {
  return {
    officialProviderRequest: vi.fn(async (operation: string, params: Record<string, unknown> = {}) => (
      handler(operation, params)
    )),
  };
}

function detailedSong(overrides: Record<string, unknown> = {}) {
  return {
    id: 12345,
    name: "晴天",
    ar: [{ id: 1, name: "周杰伦" }],
    al: { id: 2, name: "叶惠美", picUrl: "http://p1.music.126.net/cover.jpg" },
    dt: 269000,
    fee: 0,
    ...overrides,
  };
}

describe("NeteaseAccountConnector (contract)", () => {
  it("declares a zero-config desktop account variant", () => {
    const connector = new NeteaseAccountConnector();
    expect(connector.meta).toMatchObject({
      id: "netease-cloud-music-account",
      familyId: "netease-cloud-music",
      variant: "account",
      authRequirement: "required",
      supportedHosts: ["desktop"],
      version: "0.3.1",
    });
    expect(connector.meta.capabilities).toEqual(expect.arrayContaining(["search", "stream", "lyrics", "playlist", "login"]));
    expect(connector.meta.configSchema?.some(field => field.key === "apiBaseUrl")).not.toBe(true);
    expect(connector.meta.configSchema?.some(field => field.key === "cookie")).not.toBe(true);
  });

  it("reports login and host capability gaps instead of returning a fake empty catalog", async () => {
    const withoutLogin = new NeteaseAccountConnector();
    await withoutLogin.init({}, hostWith(() => ({})));
    await expect(withoutLogin.search({ keyword: "周杰伦" })).rejects.toThrow("NETEASE_LOGIN_REQUIRED");

    const withoutProvider = new NeteaseAccountConnector();
    await withoutProvider.init(AUTH_CONFIG);
    await expect(withoutProvider.listPlaylists!()).rejects.toThrow("NETEASE_OFFICIAL_PROVIDER_UNAVAILABLE");
  });

  it("returns the safe official profile and membership summary with authenticated status", async () => {
    const connector = new NeteaseAccountConnector();
    await connector.init(AUTH_CONFIG, hostWith(operation => {
      expect(operation).toBe("netease.account.profile");
      return {
        code: 200,
        profile: {
          userId: 9988,
          nickname: "无花果树上无花果",
          avatarUrl: "http://p1.music.126.net/avatar.jpg",
          vipType: 110,
        },
        account: { vipType: 11 },
      };
    }));

    await expect(connector.login({ intent: "status" })).resolves.toMatchObject({
      status: "authenticated",
      user: {
        id: "9988",
        name: "无花果树上无花果",
        avatarUrl: "https://p1.music.126.net/avatar.jpg",
      },
      membership: { active: true, label: "黑胶VIP", tier: "黑胶VIP" },
    });
  });

  it("keeps an authenticated status when the optional profile summary is unavailable", async () => {
    const connector = new NeteaseAccountConnector();
    await connector.init(AUTH_CONFIG, hostWith(() => {
      throw new Error("NETEASE_OFFICIAL_REQUEST_FAILED_503");
    }));
    const result = await connector.login({ intent: "status" });
    expect(result).toMatchObject({ status: "authenticated" });
    expect(result.user).toBeUndefined();
    expect(result.membership).toBeUndefined();
  });

  it("searches through the official host proxy and enriches provider artwork", async () => {
    const host = hostWith((operation, params) => {
      if (operation === "netease.catalog.search") {
        expect(params).toEqual({ keyword: "周杰伦", page: 2, pageSize: 10 });
        return {
          code: 200,
          result: {
            songCount: 1,
            songs: [{
              id: 12345,
              name: "晴天",
              artists: [{ id: 1, name: "周杰伦" }],
              album: { id: 2, name: "叶惠美" },
              duration: 269000,
            }],
          },
        };
      }
      if (operation === "netease.track.detail") {
        expect(params).toEqual({ ids: [12345] });
        return { code: 200, songs: [detailedSong()] };
      }
      throw new Error(`unexpected operation ${operation}`);
    });
    const connector = new NeteaseAccountConnector();
    await connector.init(AUTH_CONFIG, host);

    const result = await connector.search({ keyword: "周杰伦", page: 2, pageSize: 10 });
    expect(result).toMatchObject({ total: 1, page: 2, pageSize: 10 });
    expect(result.tracks[0]).toMatchObject({
      id: "netease:12345",
      title: "晴天",
      artist: "周杰伦",
      album: "叶惠美",
      coverUrl: "https://p1.music.126.net/cover.jpg",
      durationSec: 269,
    });
    expect(JSON.stringify(host.officialProviderRequest.mock.calls)).not.toContain("session-secret");
  });

  it("returns official stream metadata and preserves locked tracks as null", async () => {
    const host = hostWith((operation, params) => {
      expect(operation).toBe("netease.track.stream");
      if (params.id === 12345) {
        return { code: 200, data: [{ id: 12345, url: "https://m801.music.126.net/file.mp3", br: 320000, type: "mp3", expi: 1200 }] };
      }
      return { code: 200, data: [{ id: params.id, url: null, br: 0, type: null, expi: 0 }] };
    });
    const connector = new NeteaseAccountConnector();
    await connector.init(AUTH_CONFIG, host);

    await expect(connector.getStreamUrl("netease:12345")).resolves.toMatchObject({
      url: "https://m801.music.126.net/file.mp3",
      format: "mp3",
      bitrate: 320000,
    });
    await expect(connector.getStreamUrl("netease:67890")).resolves.toBeNull();
  });

  it("loads lyrics through the official host proxy", async () => {
    const host = hostWith((operation, params) => {
      expect(operation).toBe("netease.track.lyrics");
      expect(params).toEqual({ id: 12345 });
      return { code: 200, lrc: { lyric: "[00:01.00]晴天" }, tlyric: { lyric: "[00:01.00]Sunny day" } };
    });
    const connector = new NeteaseAccountConnector();
    await connector.init(AUTH_CONFIG, host);

    await expect(connector.getLyrics!("netease:12345")).resolves.toMatchObject({
      text: "[00:01.00]晴天",
      translated: "[00:01.00]Sunny day",
      timeline: [{ time: 1, text: "晴天", translated: "Sunny day" }],
    });
  });

  it("lists the signed-in account playlists with HTTPS artwork", async () => {
    const host = hostWith((operation, params) => {
      if (operation === "netease.account.profile") return { code: 200, profile: { userId: 9988 } };
      expect(operation).toBe("netease.account.playlists");
      expect(params).toEqual({ userId: 9988, page: 2, pageSize: 12 });
      return {
        code: 200,
        more: false,
        playlist: [{
          id: 991010,
          name: "经典华语",
          description: "时光长河里的好歌",
          coverImgUrl: "http://p2.music.126.net/playlist.jpg",
          trackCount: 100,
          creator: { nickname: "网易云音乐" },
        }],
      };
    });
    const connector = new NeteaseAccountConnector();
    await connector.init(AUTH_CONFIG, host);

    const result = await connector.listPlaylists!({ page: 2, pageSize: 12 });
    expect(result.playlists[0]).toMatchObject({
      id: "netease-playlist:991010",
      name: "经典华语",
      coverUrl: "https://p2.music.126.net/playlist.jpg",
      trackCount: 100,
      curator: "网易云音乐",
    });
  });

  it("keeps public playlist discovery explicit", async () => {
    const host = hostWith((operation, params) => {
      expect(operation).toBe("netease.playlist.list");
      expect(params).toEqual({ category: "全部", page: 1, pageSize: 12, sort: "new" });
      return { code: 200, total: 0, playlists: [] };
    });
    const connector = new NeteaseAccountConnector();
    await connector.init(AUTH_CONFIG, host);
    await expect(connector.listPlaylists!({ category: "public", page: 1, pageSize: 12, sort: "new" }))
      .resolves.toMatchObject({ total: 0, playlists: [] });
  });

  it("paginates public playlist tracks without losing total or artwork", async () => {
    const songs = Array.from({ length: 45 }, (_, index) => detailedSong({
      id: index + 1,
      name: `歌曲 ${index + 1}`,
      al: { id: 2, name: "歌单专辑", picUrl: "http://p3.music.126.net/track.jpg" },
    }));
    const host = hostWith((operation, params) => {
      expect(operation).toBe("netease.playlist.tracks");
      expect(params).toEqual({ playlistId: 991010, page: 2, pageSize: 20 });
      return { code: 200, playlist: { trackCount: 45, tracks: songs } };
    });
    const connector = new NeteaseAccountConnector();
    await connector.init(AUTH_CONFIG, host);

    const result = await connector.getPlaylistTracks!("netease-playlist:991010", { page: 2, pageSize: 20 });
    expect(result).toMatchObject({ total: 45, page: 2, pageSize: 20 });
    expect(result.tracks).toHaveLength(20);
    expect(result.tracks[0]).toMatchObject({ id: "netease:21", coverUrl: "https://p3.music.126.net/track.jpg" });
  });

  it("propagates official provider failures instead of clearing the catalog", async () => {
    const connector = new NeteaseAccountConnector();
    await connector.init(AUTH_CONFIG, hostWith(() => {
      throw new Error("NETEASE_OFFICIAL_REQUEST_FAILED_503");
    }));
    await expect(connector.listPlaylists!()).rejects.toThrow("NETEASE_OFFICIAL_REQUEST_FAILED_503");
  });

  it("starts official desktop cookie capture without proxy polling", async () => {
    const connector = new NeteaseAccountConnector();
    await connector.init();

    const result = await connector.login({ intent: "start" });
    expect(result).toMatchObject({
      status: "pending",
      flow: "browser",
      flowId: "netease-web-cookie",
      actions: [{
        type: "open-url",
        url: "https://music.163.com/#/login",
        cookieCapture: { provider: "netease", requiredCookieNames: ["MUSIC_U"] },
      }],
    });
    expect(result.nextPollMs).toBeUndefined();
  });

  it("validates captured MUSIC_U and never returns a secret configPatch", async () => {
    const connector = new NeteaseAccountConnector();
    await connector.init();

    await expect(connector.login({
      intent: "continue",
      flowId: "netease-web-cookie",
      input: { cookie: "__csrf=missing-login-cookie" },
    })).resolves.toMatchObject({ status: "error" });

    const authenticated = await connector.login({
      intent: "continue",
      flowId: "netease-web-cookie",
      input: { cookie: "MUSIC_U=session-secret; __csrf=csrf-value" },
    });
    expect(authenticated.status).toBe("authenticated");
    expect(authenticated.configPatch).toBeUndefined();
    expect(JSON.stringify(authenticated)).not.toContain("session-secret");
  });

  it("accepts a host-vault cookie and logs out without exposing it", async () => {
    const connector = new NeteaseAccountConnector();
    await connector.init(AUTH_CONFIG, hostWith(() => ({})));
    await expect(connector.login({ intent: "status" })).resolves.toMatchObject({ status: "authenticated" });

    const logout = await connector.login({ intent: "logout" });
    expect(logout).toMatchObject({ status: "anonymous" });
    expect(logout.configPatch).toBeUndefined();
    expect(JSON.stringify(logout)).not.toContain("session-secret");
    await expect(connector.search({ keyword: "周杰伦" })).rejects.toThrow("NETEASE_LOGIN_REQUIRED");
  });
});
