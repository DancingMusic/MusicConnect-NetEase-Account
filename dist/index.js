// src/connectors/netease/api.ts
var NeteaseApi = class {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }
  async request(path, params = {}) {
    const url = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15e3)
    });
    if (!res.ok) {
      throw new Error(`Netease API error: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }
  async search(keyword, page = 1, pageSize = 20) {
    return this.request("/cloudsearch", {
      keywords: keyword,
      limit: pageSize,
      offset: (page - 1) * pageSize,
      type: 1
    });
  }
  async songDetail(ids) {
    return this.request("/song/detail", {
      ids: ids.join(",")
    });
  }
  async songUrl(id, br = 32e4) {
    return this.request("/song/url/v1", {
      id,
      level: "higher",
      br
    });
  }
  async lyric(id) {
    return this.request("/lyric", { id });
  }
  async topPlaylist(cat = "\u5168\u90E8", page = 1, pageSize = 30, order = "hot") {
    return this.request("/top/playlist", {
      cat,
      limit: pageSize,
      offset: (page - 1) * pageSize,
      order
    });
  }
  async playlistTrackAll(id, page = 1, pageSize = 30) {
    return this.request("/playlist/track/all", {
      id,
      limit: pageSize,
      offset: (page - 1) * pageSize
    });
  }
};

// src/connectors/netease/lyrics-parser.ts
function parseLrc(lrcText) {
  const lines = [];
  const regex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\](.*)/;
  for (const raw of lrcText.split("\n")) {
    const match = raw.match(regex);
    if (!match) continue;
    const min = parseInt(match[1], 10);
    const sec = parseInt(match[2], 10);
    const ms = match[3] ? parseInt(match[3].padEnd(3, "0"), 10) : 0;
    const text = match[4].trim();
    if (!text) continue;
    lines.push({ time: min * 60 + sec + ms / 1e3, text });
  }
  return lines.sort((a, b) => a.time - b.time);
}
function mergeLyrics(original, translated) {
  const transMap = /* @__PURE__ */ new Map();
  for (const line of translated) {
    const key = Math.round(line.time * 10);
    transMap.set(key, line.text);
  }
  return original.map((line) => {
    const key = Math.round(line.time * 10);
    const trans = transMap.get(key);
    return trans ? { ...line, translated: trans } : line;
  });
}

// src/connectors/netease/index.ts
var NETEASE_WEB_COOKIE_FLOW_ID = "netease-web-cookie";
var NETEASE_LOGIN_URL = "https://music.163.com/#/login";
var NETEASE_COOKIE_PRIORITY = [
  "MUSIC_U",
  "__csrf",
  "NMTID",
  "MUSIC_A",
  "__remember_me",
  "_ntes_nuid",
  "_ntes_nnid",
  "WEVNSM",
  "WNMCID",
  "JSESSIONID-WYYY"
];
function toMusicPlaylist(p) {
  return {
    id: `netease-playlist:${p.id}`,
    name: p.name,
    description: p.description,
    coverUrl: p.coverImgUrl,
    trackCount: p.trackCount,
    curator: p.creator?.nickname,
    externalUrl: `https://music.163.com/#/playlist?id=${p.id}`
  };
}
function toMusicTrack(song) {
  return {
    id: `netease:${song.id}`,
    title: song.name,
    artist: song.ar.map((a) => a.name).join(", "),
    album: song.al.name,
    coverUrl: song.al.picUrl,
    durationSec: Math.round(song.dt / 1e3),
    price: 0,
    currency: "CNY",
    version: "1.0.0",
    createdAt: "",
    updatedAt: ""
  };
}
function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return void 0;
}
function cookieHasNeteaseLogin(cookie) {
  return /(?:^|;\s*)MUSIC_U=[^;\s]+/.test(cookie);
}
var NeteaseAccountConnector = class {
  constructor() {
    this.meta = {
      id: "netease-cloud-music-account",
      name: "\u7F51\u6613\u4E91\u97F3\u4E50\u8D26\u53F7\u7248",
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
          label: "\u533F\u540D\u76EE\u5F55 API \u7AEF\u70B9",
          type: "url",
          required: false,
          placeholder: "https://your-netease-api.example.com",
          help: "\u53EF\u9009\u3002\u4EC5\u7528\u4E8E\u533F\u540D\u76EE\u5F55\u6570\u636E\uFF1B\u8D26\u53F7 Cookie \u6C38\u8FDC\u4E0D\u4F1A\u53D1\u9001\u5230\u8BE5\u7F51\u5173\u3002"
        }
      ]
    };
    this.api = null;
    this.cookie = "";
  }
  async init(config) {
    const typed = config;
    this.cookie = typeof typed?.cookie === "string" && cookieHasNeteaseLogin(typed.cookie) ? typed.cookie.trim() : "";
    const apiBaseUrl = typeof typed?.apiBaseUrl === "string" ? typed.apiBaseUrl.trim() : "";
    if (!apiBaseUrl) {
      this.api = null;
      return;
    }
    const url = new URL(apiBaseUrl);
    const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
      throw new Error("\u7F51\u6613\u4E91\u7F51\u5173\u5FC5\u987B\u4F7F\u7528 HTTPS\uFF1B\u672C\u5730\u5F00\u53D1\u4EC5\u5141\u8BB8 loopback HTTP");
    }
    if (url.username || url.password || url.search || url.hash) {
      throw new Error("\u7F51\u6613\u4E91\u7F51\u5173\u5730\u5740\u4E0D\u80FD\u5305\u542B\u5185\u5D4C\u51ED\u636E\u3001\u67E5\u8BE2\u53C2\u6570\u6216\u7247\u6BB5");
    }
    this.api = new NeteaseApi(url.toString());
  }
  async login(request = { intent: "status" }) {
    const intent = request.intent ?? "status";
    if (intent === "status") {
      return this.cookie ? { status: "authenticated", message: "\u7F51\u6613\u4E91\u97F3\u4E50\u8D26\u53F7\u4F1A\u8BDD\u5DF2\u7531\u5BBF\u4E3B\u5B89\u5168\u52A0\u8F7D" } : { status: "anonymous", message: "\u5C1A\u672A\u767B\u5F55\u7F51\u6613\u4E91\u97F3\u4E50" };
    }
    if (intent === "logout") {
      this.cookie = "";
      return { status: "anonymous", message: "\u5DF2\u9000\u51FA\u7F51\u6613\u4E91\u97F3\u4E50\u8D26\u53F7" };
    }
    if (intent === "cancel") {
      return {
        status: this.cookie ? "authenticated" : "anonymous",
        message: "\u5DF2\u53D6\u6D88\u7F51\u6613\u4E91\u97F3\u4E50\u767B\u5F55"
      };
    }
    if (intent === "continue") {
      const capturedCookie = firstString(request.input?.cookie, request.input?.authCookie);
      if (capturedCookie) {
        if (!cookieHasNeteaseLogin(capturedCookie)) {
          return { status: "error", message: "\u672A\u8BFB\u53D6\u5230\u7F51\u6613\u4E91 MUSIC_U\uFF0C\u4F1A\u8BDD\u65E0\u6548" };
        }
        this.cookie = capturedCookie;
        return { status: "authenticated", message: "\u7F51\u6613\u4E91\u97F3\u4E50\u767B\u5F55\u6210\u529F" };
      }
      if (!request.flowId || request.flowId === NETEASE_WEB_COOKIE_FLOW_ID) {
        return this.startWebLogin("\u8BF7\u7EE7\u7EED\u5728\u7F51\u6613\u4E91\u5B98\u65B9\u767B\u5F55\u7A97\u53E3\u5B8C\u6210\u626B\u7801\u6216\u7F51\u9875\u767B\u5F55");
      }
      return { status: "error", message: "\u7F51\u6613\u4E91\u767B\u5F55\u6D41\u7A0B\u65E0\u6548" };
    }
    return this.startWebLogin();
  }
  startWebLogin(message = "\u5728\u7F51\u6613\u4E91\u5B98\u65B9\u9875\u9762\u626B\u7801\u6216\u767B\u5F55\u540E\uFF0CDancingMusic \u4F1A\u628A\u4F1A\u8BDD\u4FDD\u5B58\u5230\u5B89\u5168\u4FDD\u9669\u5E93\u3002") {
    return {
      status: "pending",
      flow: "browser",
      flowId: NETEASE_WEB_COOKIE_FLOW_ID,
      actions: [{
        type: "open-url",
        label: "\u6253\u5F00\u7F51\u6613\u4E91\u5B98\u65B9\u626B\u7801\u767B\u5F55",
        url: NETEASE_LOGIN_URL,
        cookieCapture: {
          provider: "netease",
          title: "\u7F51\u6613\u4E91\u97F3\u4E50\u767B\u5F55",
          domains: ["163.com", "music.163.com", "netease.com"],
          requiredCookieNames: ["MUSIC_U"],
          cookieNames: NETEASE_COOKIE_PRIORITY,
          message: "\u684C\u9762\u7AEF\u4F1A\u6253\u5F00\u7F51\u6613\u4E91\u5B98\u65B9\u9875\u9762\uFF1B\u53EF\u4F7F\u7528\u7F51\u6613\u4E91 App \u626B\u7801\uFF0C\u5E76\u7531\u5BBF\u4E3B\u5B89\u5168\u8BFB\u53D6 MUSIC_U\u3002"
        },
        message
      }],
      message
    };
  }
  async search(query) {
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
      pageSize
    };
  }
  async getTrack(trackId) {
    const neteaseId = this.parseId(trackId);
    if (!neteaseId || !this.api) return null;
    const res = await this.api.songDetail([neteaseId]);
    if (res.code !== 200 || !res.songs?.length) return null;
    return toMusicTrack(res.songs[0]);
  }
  async getStreamUrl(trackId) {
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
      expiresAt: item.expi ? Date.now() + item.expi * 1e3 : void 0
    };
  }
  async getLyrics(trackId) {
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
      timeline
    };
  }
  async listPlaylists(query = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    const cat = query.category || "\u5168\u90E8";
    const order = query.sort === "new" ? "new" : "hot";
    if (!this.api) return { playlists: [], total: 0, page, pageSize };
    const res = await this.api.topPlaylist(cat, page, pageSize, order);
    if (res.code !== 200 || !res.playlists) {
      return { playlists: [], total: 0, page, pageSize };
    }
    return {
      playlists: res.playlists.map(toMusicPlaylist),
      total: res.total ?? res.playlists.length,
      page,
      pageSize
    };
  }
  async getPlaylistTracks(playlistId, opts = {}) {
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
      total: res.songs.length,
      // upstream doesn't return total, so report what we got
      page,
      pageSize
    };
  }
  parseId(trackId) {
    const raw = trackId.startsWith("netease:") ? trackId.slice(8) : trackId;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  }
  parsePlaylistId(id) {
    const raw = id.startsWith("netease-playlist:") ? id.slice("netease-playlist:".length) : id;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  }
};

// src/index.ts
var index_default = NeteaseAccountConnector;
export {
  NeteaseAccountConnector,
  index_default as default
};
