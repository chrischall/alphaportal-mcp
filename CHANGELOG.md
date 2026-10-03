# Changelog

## [1.2.0](https://github.com/chrischall/alphaportal-mcp/compare/v1.1.2...v1.2.0) (2026-10-03)


### Features

* add alphaportal_healthcheck ([#73](https://github.com/chrischall/alphaportal-mcp/issues/73)) ([f3019f7](https://github.com/chrischall/alphaportal-mcp/commit/f3019f74e0a81cf6d4c6c32695e50420d5e1e7f0))


### Bug Fixes

* **deps:** adopt @chrischall/mcp-utils 2.12.0 confirmWrite kit ([#77](https://github.com/chrischall/alphaportal-mcp/issues/77)) ([abd46d1](https://github.com/chrischall/alphaportal-mcp/commit/abd46d10606ccc64ee3c4efe2693e19de6fcc6de))
* **deps:** bump @chrischall/mcp-utils to 2.13.0 ([#78](https://github.com/chrischall/alphaportal-mcp/issues/78)) ([f7246f8](https://github.com/chrischall/alphaportal-mcp/commit/f7246f8c12e4235c973d0d6dfdc2359cb88751bc))
* **deps:** bump dotenv from 18.0.2 to 18.0.4 in the production-dependencies group ([#71](https://github.com/chrischall/alphaportal-mcp/issues/71)) ([dd567fa](https://github.com/chrischall/alphaportal-mcp/commit/dd567fa3082120c2df2163a952453dc81e3201e7))
* keep credentials and report edge_blocked on CDN/WAF blocks (mcp-utils 2.10.0) ([#74](https://github.com/chrischall/alphaportal-mcp/issues/74)) ([ac1a70a](https://github.com/chrischall/alphaportal-mcp/commit/ac1a70a7ff12dbe9b2bbdd0d655000f4598452fd))
* keep the stored refresh token when a CDN/WAF blocks the token refresh ([#75](https://github.com/chrischall/alphaportal-mcp/issues/75)) ([67e924f](https://github.com/chrischall/alphaportal-mcp/commit/67e924fa314794b8dc16c1e54cd2794ebd7eade8))
* keep write approvals valid across a hosted restart (mcp-utils 2.11.0) ([#76](https://github.com/chrischall/alphaportal-mcp/issues/76)) ([43381fa](https://github.com/chrischall/alphaportal-mcp/commit/43381fa02c8a40d688205e5b6252bf2c6190c2a6))

## [1.1.2](https://github.com/chrischall/alphaportal-mcp/compare/v1.1.1...v1.1.2) (2026-09-27)


### Bug Fixes

* **deps:** move to [@fetchproxy](https://github.com/fetchproxy) 3.4 for ContextMint Bridge errors, capability subsets and managed pins ([#66](https://github.com/chrischall/alphaportal-mcp/issues/66)) ([9c2333d](https://github.com/chrischall/alphaportal-mcp/commit/9c2333d14c72a3e9df8a89212764f7858c49b43e))
* **deps:** move to @chrischall/mcp-utils 2.8 and [@fetchproxy](https://github.com/fetchproxy) 3.4.1 for clearer browser-bridge errors ([#68](https://github.com/chrischall/alphaportal-mcp/issues/68)) ([3092883](https://github.com/chrischall/alphaportal-mcp/commit/3092883fe342768620435c37a85573a309b207b3))

## [1.1.1](https://github.com/chrischall/alphaportal-mcp/compare/v1.1.0...v1.1.1) (2026-09-24)


### Bug Fixes

* **deps:** bump dotenv from 18.0.1 to 18.0.2 in the production-dependencies group ([#64](https://github.com/chrischall/alphaportal-mcp/issues/64)) ([97cb410](https://github.com/chrischall/alphaportal-mcp/commit/97cb41020b3342dd907cf3823a652c19333aedc1))

## [1.1.0](https://github.com/chrischall/alphaportal-mcp/compare/v1.0.2...v1.1.0) (2026-09-24)


### Features

* confirm writes with a preview token instead of confirm: true ([4f55529](https://github.com/chrischall/alphaportal-mcp/commit/4f555295388efa34ef5f2842c8c472c73de10d90))


### Documentation

* **readme:** label the Confirmations table header like its neighbour ([#61](https://github.com/chrischall/alphaportal-mcp/issues/61)) ([1201e55](https://github.com/chrischall/alphaportal-mcp/commit/1201e55fddf9ee551ca43d694b3448b01cdd8b53))

## [1.0.2](https://github.com/chrischall/alphaportal-mcp/compare/v1.0.1...v1.0.2) (2026-09-23)


### Bug Fixes

* recover from revoked refresh tokens, start plugin via npx, and gate set_notification as destructive ([#57](https://github.com/chrischall/alphaportal-mcp/issues/57)) ([36d28e2](https://github.com/chrischall/alphaportal-mcp/commit/36d28e2906bef5d3b5555c18ddfa81a0019b9035))

## [1.0.1](https://github.com/chrischall/alphaportal-mcp/compare/v1.0.0...v1.0.1) (2026-09-23)


### Bug Fixes

* **deps:** bump dotenv from 17.4.2 to 18.0.1 ([#53](https://github.com/chrischall/alphaportal-mcp/issues/53)) ([13b3d7f](https://github.com/chrischall/alphaportal-mcp/commit/13b3d7f7363e530e6399af5f3ad145d54288dce8))
* **deps:** bump zod from 4.6.2 to 4.6.5 in the production-dependencies group ([23d9ccd](https://github.com/chrischall/alphaportal-mcp/commit/23d9ccd654795886b4ded9927061f4190f83c695))
* **deps:** require zod ^4.6.5 to match @chrischall/mcp-utils 2.4.0 ([#56](https://github.com/chrischall/alphaportal-mcp/issues/56)) ([504ec6c](https://github.com/chrischall/alphaportal-mcp/commit/504ec6ccbd391445da641d81abf352afc6f8afe2))
* **deps:** upgrade @chrischall/mcp-utils to 2.4.0 and @fetchproxy/* to 3.2.0 ([#55](https://github.com/chrischall/alphaportal-mcp/issues/55)) ([f18db64](https://github.com/chrischall/alphaportal-mcp/commit/f18db6462c947d7cf191329f01c170f1e5b11c8c))

## [1.0.0](https://github.com/chrischall/alphaportal-mcp/compare/v0.4.0...v1.0.0) (2026-09-20)


### Features

* **deps:** take mcp-utils 1.0.0, so this server negotiates the 2026 era ([#46](https://github.com/chrischall/alphaportal-mcp/issues/46)) ([89a6e6f](https://github.com/chrischall/alphaportal-mcp/commit/89a6e6facf1ebd7d42eab6940eefba6fc1a3b237))


### Bug Fixes

* **release:** drop bump-minor-pre-major so a breaking change cuts a major ([#48](https://github.com/chrischall/alphaportal-mcp/issues/48)) ([6ca3663](https://github.com/chrischall/alphaportal-mcp/commit/6ca366382fb06d3f9fe23c377ebcf4d4f4c82e09))
* **release:** restate the Release-As footer the squash dropped ([#49](https://github.com/chrischall/alphaportal-mcp/issues/49)) ([b3a40ad](https://github.com/chrischall/alphaportal-mcp/commit/b3a40adc7ce14d19771a17b83cd548ee73188e31))

## [0.4.0](https://github.com/chrischall/alphaportal-mcp/compare/v0.3.2...v0.4.0) (2026-09-17)


### ⚠ BREAKING CHANGES

* **mcp:** migrate server to SDK v2 ([#41](https://github.com/chrischall/alphaportal-mcp/issues/41))

### Features

* **mcp:** migrate server to SDK v2 ([#41](https://github.com/chrischall/alphaportal-mcp/issues/41)) ([62fa75d](https://github.com/chrischall/alphaportal-mcp/commit/62fa75da7a5bfdd6356c04efa305527abec8bcd9))


### Bug Fixes

* **build:** preserve Zod initialization in standalone bundle ([#44](https://github.com/chrischall/alphaportal-mcp/issues/44)) ([2ce3851](https://github.com/chrischall/alphaportal-mcp/commit/2ce3851501ab18f3e6ec1af9ef7576cb68db1492))
* **mcp:** address SDK v2 review follow-up ([#45](https://github.com/chrischall/alphaportal-mcp/issues/45)) ([6d68171](https://github.com/chrischall/alphaportal-mcp/commit/6d68171e628b6684ba8446faf3f2ef62ea154bb4))

## [0.3.2](https://github.com/chrischall/alphaportal-mcp/compare/v0.3.1...v0.3.2) (2026-09-15)


### Bug Fixes

* **deps:** @fetchproxy/server 3.0.1 — capped peer frames, logged load drops, atomic identity writes ([#39](https://github.com/chrischall/alphaportal-mcp/issues/39)) ([7fe0148](https://github.com/chrischall/alphaportal-mcp/commit/7fe0148d065ae2c635f1f9ae5459a4b102978acc))
* **deps:** bump the production-dependencies group with 3 updates ([21be221](https://github.com/chrischall/alphaportal-mcp/commit/21be2214fbb8bc0db7dbb28b577a353b0573e0ff))

## [0.3.1](https://github.com/chrischall/alphaportal-mcp/compare/v0.3.0...v0.3.1) (2026-09-10)


### Bug Fixes

* **deps:** @chrischall/mcp-utils 0.26.1 ([#33](https://github.com/chrischall/alphaportal-mcp/issues/33)) ([66b7f61](https://github.com/chrischall/alphaportal-mcp/commit/66b7f61a826dff9e112b5f1ad1ad8008dcbc1c57))
* **deps:** bump hono from 4.13.4 to 4.13.7 ([#31](https://github.com/chrischall/alphaportal-mcp/issues/31)) ([3aa5a1b](https://github.com/chrischall/alphaportal-mcp/commit/3aa5a1bbd6c410d8eb181f708b01c52d31df51e6))
* **deps:** declare the peer floors mcp-utils 0.26.1 requires ([#34](https://github.com/chrischall/alphaportal-mcp/issues/34)) ([0355c08](https://github.com/chrischall/alphaportal-mcp/commit/0355c08d64045a136e86af54306a5aff817af425))

## [0.3.0](https://github.com/chrischall/alphaportal-mcp/compare/v0.2.0...v0.3.0) (2026-09-04)


### Features

* **tools:** minify every response — no formatting whitespace on any payload ([#22](https://github.com/chrischall/alphaportal-mcp/issues/22)) ([d9ca202](https://github.com/chrischall/alphaportal-mcp/commit/d9ca2021bd4e21ee129a6b8f114db1ad80fb8f4a))


### Documentation

* **mint:** declare ALPHAPORTAL_DISABLE_FETCHPROXY in mint.yaml ([#12](https://github.com/chrischall/alphaportal-mcp/issues/12)) ([19cdc02](https://github.com/chrischall/alphaportal-mcp/commit/19cdc02aa835c7f7bfce872209e8ef5c78758cf2))
* **mint:** match the README's format for ALPHAPORTAL_DISABLE_FETCHPROXY ([#17](https://github.com/chrischall/alphaportal-mcp/issues/17)) ([6608644](https://github.com/chrischall/alphaportal-mcp/commit/660864498666bf87a6860a8eb2f59fd8af46e9f8))

## [0.2.0](https://github.com/chrischall/alphaportal-mcp/compare/v0.1.0...v0.2.0) (2026-08-29)


### Features

* **deps:** take @fetchproxy/server 2.2.0 so the concentrator can bind its sandbox address ([#5](https://github.com/chrischall/alphaportal-mcp/issues/5)) ([6a98333](https://github.com/chrischall/alphaportal-mcp/commit/6a983331ca103d5387c256d713ae7d3b3b4d6818))

## 0.1.0 (2026-08-26)


### Features

* AlphaPortal (AlphaRoute) school-bus MCP server + fpx skill ([731ded8](https://github.com/chrischall/alphaportal-mcp/commit/731ded83154199e56596b9bf676d6bd1f94375ee))
* browser-bridge bootstrap for the refresh token + egress/reachability fixes ([#2](https://github.com/chrischall/alphaportal-mcp/issues/2)) ([b7343ab](https://github.com/chrischall/alphaportal-mcp/commit/b7343ab05b646c1c68f392a531e1a35c8640e2a9))
