/**
 * MusicConnect-NetEase-Account — independent account connector bundle.
 *
 * The class is the default export so the host's dynamic loader can do
 * `new mod.default()` without knowing internals.
 */
export { NeteaseAccountConnector } from "./connectors/netease/index";
export type { NeteaseAccountConnectorConfig } from "./connectors/netease/index";

import { NeteaseAccountConnector } from "./connectors/netease/index";
export default NeteaseAccountConnector;
