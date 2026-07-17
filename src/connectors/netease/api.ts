import type { MusicConnectorHostContext } from "@dancingmusic/music-connect";

export interface NeteaseArtist {
  id: number;
  name: string;
}

export interface NeteaseAlbum {
  id: number;
  name: string;
  picUrl?: string;
  blurPicUrl?: string;
}

export interface NeteaseSong {
  id: number;
  name: string;
  ar?: NeteaseArtist[];
  artists?: NeteaseArtist[];
  al?: NeteaseAlbum;
  album?: NeteaseAlbum;
  dt?: number;
  duration?: number;
  fee?: number;
  privilege?: { maxBrRate?: number };
}

export interface NeteaseSearchResponse {
  result: {
    songs: NeteaseSong[];
    songCount: number;
  };
  code: number;
}

export interface NeteaseDetailResponse {
  songs: NeteaseSong[];
  code: number;
}

export interface NeteaseUrlResponse {
  data: { id: number; url: string | null; br: number; type: string | null; expi: number }[];
  code: number;
}

export interface NeteaseLyricResponse {
  lrc?: { lyric: string };
  tlyric?: { lyric: string };
  code: number;
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

interface NeteaseAccountPlaylistResponse {
  code: number;
  playlist?: NeteasePlaylist[];
  more?: boolean;
}

export interface NeteaseAccountProfileResponse {
  code: number;
  profile?: {
    userId?: number;
    nickname?: string;
    avatarUrl?: string;
    vipType?: number;
  };
  account?: {
    vipType?: number;
  };
}

interface NeteasePlaylistDetailResponse {
  code: number;
  playlist?: {
    trackCount?: number;
    tracks?: NeteaseSong[];
  };
}

export interface NeteasePlaylistTracksResponse {
  code: number;
  total: number;
  songs: NeteaseSong[];
}

type OfficialProviderRequest = NonNullable<MusicConnectorHostContext["officialProviderRequest"]>;

export class NeteaseOfficialApi {
  constructor(private readonly requestOfficial: OfficialProviderRequest) {}

  private request<T>(operation: string, params: Record<string, unknown> = {}): Promise<T> {
    return this.requestOfficial<T>(operation, params);
  }

  async search(keyword: string, page = 1, pageSize = 20): Promise<NeteaseSearchResponse> {
    const result = await this.request<NeteaseSearchResponse>("netease.catalog.search", {
      keyword,
      page,
      pageSize,
    });
    const ids = result.result?.songs?.map(song => song.id).filter(Number.isSafeInteger) ?? [];
    if (result.code !== 200 || ids.length === 0) return result;

    const detail = await this.songDetail(ids);
    if (detail.code !== 200 || !detail.songs?.length) {
      throw new Error("NETEASE_OFFICIAL_TRACK_DETAIL_UNAVAILABLE");
    }
    const byId = new Map(detail.songs.map(song => [song.id, song]));
    return {
      ...result,
      result: {
        ...result.result,
        songs: result.result.songs.map(song => byId.get(song.id) ?? song),
      },
    };
  }

  songDetail(ids: number[]): Promise<NeteaseDetailResponse> {
    return this.request<NeteaseDetailResponse>("netease.track.detail", { ids });
  }

  songUrl(id: number, bitrate = 320000): Promise<NeteaseUrlResponse> {
    return this.request<NeteaseUrlResponse>("netease.track.stream", { id, bitrate });
  }

  lyric(id: number): Promise<NeteaseLyricResponse> {
    return this.request<NeteaseLyricResponse>("netease.track.lyrics", { id });
  }

  topPlaylist(
    category = "全部",
    page = 1,
    pageSize = 30,
    sort: "hot" | "new" = "hot",
  ): Promise<NeteasePlaylistListResponse> {
    return this.request<NeteasePlaylistListResponse>("netease.playlist.list", {
      category,
      page,
      pageSize,
      sort,
    });
  }

  accountProfile(): Promise<NeteaseAccountProfileResponse> {
    return this.request<NeteaseAccountProfileResponse>("netease.account.profile");
  }

  async accountPlaylists(userId: number, page = 1, pageSize = 30): Promise<NeteasePlaylistListResponse> {
    const result = await this.request<NeteaseAccountPlaylistResponse>("netease.account.playlists", {
      userId,
      page,
      pageSize,
    });
    const playlists = result.playlist ?? [];
    return {
      code: result.code,
      playlists,
      // The endpoint does not expose a stable total. A conservative page
      // boundary avoids inventing a library size while preserving pagination.
      total: result.more ? page * pageSize + 1 : (page - 1) * pageSize + playlists.length,
    };
  }

  async playlistTracks(id: number, page = 1, pageSize = 30): Promise<NeteasePlaylistTracksResponse> {
    const result = await this.request<NeteasePlaylistDetailResponse>("netease.playlist.tracks", {
      playlistId: id,
      page,
      pageSize,
    });
    const tracks = result.playlist?.tracks ?? [];
    const offset = (page - 1) * pageSize;
    return {
      code: result.code,
      songs: tracks.slice(offset, offset + pageSize),
      total: result.playlist?.trackCount ?? tracks.length,
    };
  }
}
