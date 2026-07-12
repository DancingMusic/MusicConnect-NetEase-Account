import type {
  MusicConnector,
  MusicConnectorMeta,
  MusicSearchResult,
  MusicStreamInfo,
  MusicLyrics,
  MusicListQuery,
  MusicTrack,
  MusicPlaylist,
  MusicPlaylistList,
  MusicPlaylistQuery,
  MusicConnectorLoginRequest,
  MusicConnectorLoginResult,
} from "@dancingmusic/music-connect";
import { NeteaseApi } from "./api";
import type { NeteaseSong, NeteasePlaylist } from "./api";
import { parseLrc, mergeLyrics } from "./lyrics-parser";

const NETEASE_WEB_COOKIE_FLOW_ID = "netease-web-cookie";
const NETEASE_LOGIN_URL = "https://music.163.com/#/login";
const NETEASE_COOKIE_PRIORITY = [
  "MUSIC_U",
  "__csrf",
  "NMTID",
  "MUSIC_A",
  "__remember_me",
  "_ntes_nuid",
  "_ntes_nnid",
  "WEVNSM",
  "WNMCID",
  "JSESSIONID-WYYY",
];

function toMusicPlaylist(p: NeteasePlaylist): MusicPlaylist {
  return {
    id: `netease-playlist:${p.id}`,
    name: p.name,
    description: p.description,
    coverUrl: p.coverImgUrl,
    trackCount: p.trackCount,
    curator: p.creator?.nickname,
    externalUrl: `https://music.163.com/#/playlist?id=${p.id}`,
  };
}

export interface NeteaseAccountConnectorConfig {
  apiBaseUrl?: string;
  /** Injected only by the host credential vault. Never ordinary config. */
  cookie?: string;
}

function toMusicTrack(song: NeteaseSong): MusicTrack {
  return {
    id: `netease:${song.id}`,
    title: song.name,
    artist: song.ar.map(a => a.name).join(", "),
    album: song.al.name,
    coverUrl: song.al.picUrl,
    durationSec: Math.round(song.dt / 1000),
    price: 0,
    currency: "CNY",
    version: "1.0.0",
    createdAt: "",
    updatedAt: "",
  };
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function cookieHasNeteaseLogin(cookie: string): boolean {
  return /(?:^|;\s*)MUSIC_U=[^;\s]+/.test(cookie);
}

export class NeteaseAccountConnector implements MusicConnector {
  readonly meta: MusicConnectorMeta = {
    id: "netease-cloud-music-account",
    name: "网易云音乐账号版",
    description: "Desktop NetEase account login with host-owned secure cookie capture and an isolated anonymous catalog gateway",
    familyId: "netease-cloud-music",
    variant: "account",
    authRequirement: "required",
    supportedHosts: ["desktop"],
    version: "0.1.0",
    capabilities: ["search", "stream", "lyrics", "playlist", "login"],
    configSchema: [
      {
        key: "apiBaseUrl",
        label: "匿名目录 API 端点",
        type: "url",
        required: false,
        placeholder: "https://your-netease-api.example.com",
        help: "可选。仅用于匿名目录数据；账号 Cookie 永远不会发送到该网关。",
      },
    ],
  };

  private api: NeteaseApi | null = null;
  private cookie = "";

  async init(config?: Record<string, unknown>): Promise<void> {
    const typed = config as NeteaseAccountConnectorConfig | undefined;
    this.cookie = typeof typed?.cookie === "string" && cookieHasNeteaseLogin(typed.cookie)
      ? typed.cookie.trim()
      : "";
    const apiBaseUrl = typeof typed?.apiBaseUrl === "string" ? typed.apiBaseUrl.trim() : "";
    if (!apiBaseUrl) {
      this.api = null;
      return;
    }
    const url = new URL(apiBaseUrl);
    const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
      throw new Error("网易云网关必须使用 HTTPS；本地开发仅允许 loopback HTTP");
    }
    if (url.username || url.password || url.search || url.hash) {
      throw new Error("网易云网关地址不能包含内嵌凭据、查询参数或片段");
    }
    this.api = new NeteaseApi(url.toString());
  }

  async login(request: MusicConnectorLoginRequest = { intent: "status" }): Promise<MusicConnectorLoginResult> {
    const intent = request.intent ?? "status";
    if (intent === "status") {
      return this.cookie
        ? { status: "authenticated", message: "网易云音乐账号会话已由宿主安全加载" }
        : { status: "anonymous", message: "尚未登录网易云音乐" };
    }
    if (intent === "logout") {
      this.cookie = "";
      return { status: "anonymous", message: "已退出网易云音乐账号" };
    }
    if (intent === "cancel") {
      return {
        status: this.cookie ? "authenticated" : "anonymous",
        message: "已取消网易云音乐登录",
      };
    }
    if (intent === "continue") {
      const capturedCookie = firstString(request.input?.cookie, request.input?.authCookie);
      if (capturedCookie) {
        if (!cookieHasNeteaseLogin(capturedCookie)) {
          return { status: "error", message: "未读取到网易云 MUSIC_U，会话无效" };
        }
        // Keep the accepted value only in this Worker session. The host persists
        // request.input.cookie in its installation-scoped secure vault and then
        // calls init() again; the connector must never return it in configPatch.
        this.cookie = capturedCookie;
        return { status: "authenticated", message: "网易云音乐登录成功" };
      }
      if (!request.flowId || request.flowId === NETEASE_WEB_COOKIE_FLOW_ID) {
        return this.startWebLogin("请继续在网易云官方登录窗口完成扫码或网页登录");
      }
      return { status: "error", message: "网易云登录流程无效" };
    }
    return this.startWebLogin();
  }

  private startWebLogin(
    message = "在网易云官方页面扫码或登录后，DancingMusic 会把会话保存到安全保险库。",
  ): MusicConnectorLoginResult {
    return {
      status: "pending",
      flow: "browser",
      flowId: NETEASE_WEB_COOKIE_FLOW_ID,
      actions: [{
        type: "open-url",
        label: "打开网易云官方扫码登录",
        url: NETEASE_LOGIN_URL,
        cookieCapture: {
          provider: "netease",
          title: "网易云音乐登录",
          domains: ["163.com", "music.163.com", "netease.com"],
          requiredCookieNames: ["MUSIC_U"],
          cookieNames: NETEASE_COOKIE_PRIORITY,
          message: "桌面端会打开网易云官方页面；可使用网易云 App 扫码，并由宿主安全读取 MUSIC_U。",
        },
        message,
      }],
      message,
    };
  }

  async search(query: MusicListQuery): Promise<MusicSearchResult> {
    const keyword = query.keyword || "";
    if (!keyword) {
      return { tracks: [], total: 0, page: query.page ?? 1, pageSize: query.pageSize ?? 20 };
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    if (!this.api) return { tracks: [], total: 0, page, pageSize };
    const res = await this.api.search(keyword, page, pageSize);

    if (res.code !== 200 || !res.result?.songs) {
      return { tracks: [], total: 0, page, pageSize };
    }

    return {
      tracks: res.result.songs.map(toMusicTrack),
      total: res.result.songCount,
      page,
      pageSize,
    };
  }

  async getTrack(trackId: string): Promise<MusicTrack | null> {
    const neteaseId = this.parseId(trackId);
    if (!neteaseId || !this.api) return null;

    const res = await this.api.songDetail([neteaseId]);
    if (res.code !== 200 || !res.songs?.length) return null;

    return toMusicTrack(res.songs[0]);
  }

  async getStreamUrl(trackId: string): Promise<MusicStreamInfo | null> {
    const neteaseId = this.parseId(trackId);
    if (!neteaseId || !this.api) return null;

    const res = await this.api.songUrl(neteaseId);
    if (res.code !== 200 || !res.data?.length) return null;

    const item = res.data[0];
    if (!item.url) return null;

    return {
      url: item.url,
      format: item.type || "mp3",
      bitrate: item.br,
      expiresAt: item.expi ? Date.now() + item.expi * 1000 : undefined,
    };
  }

  async getLyrics(trackId: string): Promise<MusicLyrics | null> {
    const neteaseId = this.parseId(trackId);
    if (!neteaseId || !this.api) return null;

    const res = await this.api.lyric(neteaseId);
    if (res.code !== 200 || !res.lrc?.lyric) return null;

    const original = parseLrc(res.lrc.lyric);
    let timeline = original;

    if (res.tlyric?.lyric) {
      const translated = parseLrc(res.tlyric.lyric);
      timeline = mergeLyrics(original, translated);
    }

    return {
      text: res.lrc.lyric,
      translated: res.tlyric?.lyric,
      timeline,
    };
  }

  async listPlaylists(query: MusicPlaylistQuery = {}): Promise<MusicPlaylistList> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    const cat = query.category || "全部";
    // NetEase supports `hot` (default) and `new`. Treat `trending` as hot.
    const order: "hot" | "new" = query.sort === "new" ? "new" : "hot";
    if (!this.api) return { playlists: [], total: 0, page, pageSize };
    const res = await this.api.topPlaylist(cat, page, pageSize, order);
    if (res.code !== 200 || !res.playlists) {
      return { playlists: [], total: 0, page, pageSize };
    }
    return {
      playlists: res.playlists.map(toMusicPlaylist),
      total: res.total ?? res.playlists.length,
      page,
      pageSize,
    };
  }

  async getPlaylistTracks(
    playlistId: string,
    opts: { page?: number; pageSize?: number } = {},
  ): Promise<MusicSearchResult> {
    const id = this.parsePlaylistId(playlistId);
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 30;
    if (!id || !this.api) return { tracks: [], total: 0, page, pageSize };
    const res = await this.api.playlistTrackAll(id, page, pageSize);
    if (res.code !== 200 || !res.songs) {
      return { tracks: [], total: 0, page, pageSize };
    }
    return {
      tracks: res.songs.map(toMusicTrack),
      total: res.songs.length, // upstream doesn't return total, so report what we got
      page,
      pageSize,
    };
  }

  private parseId(trackId: string): number | null {
    const raw = trackId.startsWith("netease:") ? trackId.slice(8) : trackId;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  }

  private parsePlaylistId(id: string): number | null {
    const raw = id.startsWith("netease-playlist:") ? id.slice("netease-playlist:".length) : id;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  }
}
