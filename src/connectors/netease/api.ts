export interface NeteaseSearchResponse {
  result: {
    songs: NeteaseSong[];
    songCount: number;
  };
  code: number;
}

export interface NeteaseSong {
  id: number;
  name: string;
  ar: { id: number; name: string }[];
  al: { id: number; name: string; picUrl?: string };
  dt: number;
  fee: number;
  privilege?: { maxBrRate?: number };
}

export interface NeteaseDetailResponse {
  songs: NeteaseSong[];
  code: number;
}

export interface NeteaseUrlResponse {
  data: { id: number; url: string | null; br: number; type: string; expi: number }[];
  code: number;
}

export interface NeteaseLyricResponse {
  lrc?: { lyric: string };
  tlyric?: { lyric: string };
  code: number;
}

export class NeteaseApi {
  private baseUrl: string;
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async request<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const url = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(`Netease API error: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  async search(keyword: string, page = 1, pageSize = 20): Promise<NeteaseSearchResponse> {
    return this.request<NeteaseSearchResponse>("/cloudsearch", {
      keywords: keyword,
      limit: pageSize,
      offset: (page - 1) * pageSize,
      type: 1,
    });
  }

  async songDetail(ids: number[]): Promise<NeteaseDetailResponse> {
    return this.request<NeteaseDetailResponse>("/song/detail", {
      ids: ids.join(","),
    });
  }

  async songUrl(id: number, br = 320000): Promise<NeteaseUrlResponse> {
    return this.request<NeteaseUrlResponse>("/song/url/v1", {
      id,
      level: "higher",
      br,
    });
  }

  async lyric(id: number): Promise<NeteaseLyricResponse> {
    return this.request<NeteaseLyricResponse>("/lyric", { id });
  }

  async topPlaylist(cat = "全部", page = 1, pageSize = 30, order: "hot" | "new" = "hot"): Promise<NeteasePlaylistListResponse> {
    return this.request<NeteasePlaylistListResponse>("/top/playlist", {
      cat,
      limit: pageSize,
      offset: (page - 1) * pageSize,
      order,
    });
  }

  async playlistTrackAll(id: number, page = 1, pageSize = 30): Promise<NeteasePlaylistTracksResponse> {
    return this.request<NeteasePlaylistTracksResponse>("/playlist/track/all", {
      id,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
  }

}

export interface NeteasePlaylist {
  id: number;
  name: string;
  description?: string;
  coverImgUrl?: string;
  trackCount?: number;
  creator?: { nickname?: string };
}

export interface NeteasePlaylistListResponse {
  code: number;
  total: number;
  playlists: NeteasePlaylist[];
}

export interface NeteasePlaylistTracksResponse {
  code: number;
  songs?: NeteaseSong[];
}
