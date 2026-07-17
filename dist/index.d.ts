import { MusicConnector, MusicConnectorMeta, MusicConnectorHostContext, MusicConnectorLoginRequest, MusicConnectorLoginResult, MusicListQuery, MusicSearchResult, MusicTrack, MusicStreamInfo, MusicLyrics, MusicPlaylistQuery, MusicPlaylistList } from '@dancingmusic/music-connect';

interface NeteaseAccountConnectorConfig {
    /** Injected only by the host credential vault. Never ordinary config. */
    cookie?: string;
}
declare class NeteaseAccountConnector implements MusicConnector {
    readonly meta: MusicConnectorMeta;
    private api;
    private cookie;
    init(config?: Record<string, unknown>, host?: MusicConnectorHostContext): Promise<void>;
    login(request?: MusicConnectorLoginRequest): Promise<MusicConnectorLoginResult>;
    private startWebLogin;
    search(query: MusicListQuery): Promise<MusicSearchResult>;
    getTrack(trackId: string): Promise<MusicTrack | null>;
    getStreamUrl(trackId: string): Promise<MusicStreamInfo | null>;
    getLyrics(trackId: string): Promise<MusicLyrics | null>;
    listPlaylists(query?: MusicPlaylistQuery): Promise<MusicPlaylistList>;
    getPlaylistTracks(playlistId: string, opts?: {
        page?: number;
        pageSize?: number;
    }): Promise<MusicSearchResult>;
    private requireApi;
    private parseId;
    private parsePlaylistId;
}

/**
 * MusicConnect-NetEase-Account — independent account connector bundle.
 *
 * The class is the default export so the host's dynamic loader can do
 * `new mod.default()` without knowing internals.
 */

export { NeteaseAccountConnector, type NeteaseAccountConnectorConfig, NeteaseAccountConnector as default };
