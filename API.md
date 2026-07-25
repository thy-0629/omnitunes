# Omnitune Backend API 文档

> 面向前端开发者的完整接口文档

## 基础信息

| 项目 | 值 |
|------|-----|
| Base URL | `http://localhost:3000` |
| 认证方式 | Bearer Token（开发模式下免认证） |
| 数据格式 | JSON |
| 字符编码 | UTF-8 |

### 认证

开发模式下（`AUTH_TOKEN=change-me-in-production`）所有接口免认证。

生产环境需要在请求头中携带：
```
Authorization: Bearer <your-token>
```

### 通用错误响应

```json
{
  "error": {
    "code": "error_code",
    "message": "错误描述"
  }
}
```

### 通用成功响应

部分接口返回：
```json
{ "ok": true }
```

---

## 1. 健康检查

### GET /health

检查服务是否正常运行。

**请求参数**：无

**响应**：
```json
{
  "status": "ok",
  "uptime": 123.456,
  "version": "0.1.0",
  "env": "development",
  "timestamp": "2026-07-25T09:00:00.000Z"
}
```

---

## 2. 搜索

### GET /api/search

统一跨源搜索，返回归一化的五层模型结果。

**请求参数**（Query String）：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| q | string | ✅ | 搜索关键词，1-200字符 |
| limit | number | ❌ | 返回数量，1-50，默认取决于音源 |
| sources | string | ❌ | 逗号分隔的音源ID，如 `mock,local,youtube` |

**音源 ID**：
- `mock` — 开发测试用
- `local` — 本地文件
- `youtube` — YouTube（需配置 API Key）

**响应**：
```json
{
  "query": "hello",
  "totalSongWorks": 3,
  "results": [
    {
      "songWork": {
        "id": "5163e682-4c3e-4960-9079-33614d82d55e",
        "title": "hello — Mock Take #1",
        "artists": "Mock Artist",
        "aliases": [],
        "fingerprint": null,
        "language": null,
        "year": null,
        "createdAt": 1784862491000,
        "updatedAt": 1784862491000
      },
      "recordings": [
        {
          "recording": {
            "id": "a7a37c87-47fb-4623-8246-edaffc5d54d2",
            "songWorkId": "5163e682-4c3e-4960-9079-33614d82d55e",
            "versionType": "studio",
            "durationSec": 120,
            "performers": "Mock Artist",
            "album": null,
            "createdAt": 1784949709000
          },
          "sourceItems": [
            {
              "id": "efab8d0d-9fb4-4cf7-ad36-3c6b4882cd16",
              "recordingId": "a7a37c87-47fb-4623-8246-edaffc5d54d2",
              "source": "mock",
              "externalId": "mock-hello-0",
              "publisher": "Mock Records",
              "url": null,
              "thumbnailUrl": "https://placehold.co/120x120?text=hello+1",
              "fetchedAt": 1784969910260,
              "deletedAt": null
            }
          ]
        }
      ]
    }
  ],
  "errors": [],
  "meta": {
    "searchedAt": 1784969910254,
    "sourcesQueried": ["mock", "local", "youtube"],
    "latencyMs": 10
  }
}
```

**错误**：
- `400` — 参数验证失败

---

## 3. 播放

### POST /api/play/resolve

解析可播放选项，返回排序后的播放列表。

**请求体**：
```json
{
  "songWorkId": "5163e682-4c3e-4960-9079-33614d82d55e"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| songWorkId | string | 三选一 | 按歌曲解析所有录音 |
| recordingId | string | 三选一 | 按录音解析 |
| sourceItemId | string | 三选一 | 按单个音源项解析 |
| preferredSource | string | ❌ | 首选音源，会排在最前 |

**响应**：
```json
{
  "options": [
    {
      "rank": 0,
      "sourceItem": {
        "id": "efab8d0d-9fb4-4cf7-ad36-3c6b4882cd16",
        "recordingId": "a7a37c87-47fb-4623-8246-edaffc5d54d2",
        "source": "mock",
        "externalId": "mock-hello-0",
        "publisher": "Mock Records",
        "url": null,
        "thumbnailUrl": "https://placehold.co/120x120?text=hello+1",
        "fetchedAt": 1784969910260,
        "deletedAt": null
      },
      "option": {
        "type": "embed",
        "payload": "mock-video-hello-0",
        "expiresAt": 1784973529980
      },
      "playableOptionId": "09342045-b82c-4976-9e8e-484fde3beb30",
      "source": "mock"
    }
  ],
  "best": { ... },
  "errors": []
}
```

**播放选项类型**（`option.type`）：
- `embed` — 嵌入式播放（如 YouTube iframe）
- `stream` — 流媒体 URL
- `local` — 本地文件

**排序规则**：local > stream > embed，首选音源会排在最前。

---

### POST /api/play/start

开始播放，创建播放历史记录。

**请求体**：
```json
{
  "sourceItemId": "efab8d0d-9fb4-4cf7-ad36-3c6b4882cd16",
  "optionId": "09342045-b82c-4976-9e8e-484fde3beb30",
  "trigger": "manual"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sourceItemId | string | ✅ | 音源项 ID |
| optionId | string | ❌ | 播放选项 ID，不传则自动选最佳 |
| trigger | string | ❌ | 触发方式：`manual` / `queue` / `autoplay` |

**响应**：
```json
{
  "playId": "xxx-xxx-xxx",
  "option": { ... }
}
```

**WebSocket 推送**：播放开始时会向 `playback` 频道推送 `play:started` 事件。

---

### POST /api/play/:playId/end

结束播放。

**路径参数**：
- `playId` — 播放会话 ID

**请求体**：
```json
{
  "outcome": "completed",
  "durationPlayedSec": 180
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| outcome | string | ✅ | `completed` / `skipped` / `failed` |
| durationPlayedSec | number | ❌ | 实际播放秒数 |

**响应**：
```json
{ "ok": true }
```

---

### POST /api/play/:playId/fallback

切换到备用播放源。

**路径参数**：
- `playId` — 播放会话 ID

**请求体**：
```json
{
  "reason": "当前源不可用"
}
```

**响应**：
```json
{
  "playId": "new-play-id",
  "option": { ... },
  "fallbackFromId": "old-play-id"
}
```

---

### GET /api/local/stream/:sourceItemId

流式播放本地文件（支持 HTTP Range 请求，可拖动进度条）。

**路径参数**：
- `sourceItemId` — 本地音源项 ID

**请求头**：
- `Range: bytes=0-1023` — 可选，请求部分内容

**响应**：
- `200` — 完整文件
- `206` — 部分内容（带 `Content-Range` 头）
- `416` — 范围超出文件大小

**支持的格式**：mp3, flac, m4a, aac, ogg, opus, wav, mp4, mkv, webm, mov, m4v

---

## 4. 播放队列

### GET /api/queue

获取当前播放队列。

**响应**：
```json
{
  "items": [],
  "total": 0
}
```

---

### POST /api/queue

添加歌曲到队列。

**请求体**：
```json
{
  "songWorkId": "5163e682-4c3e-4960-9079-33614d82d55e",
  "sourceItemId": "efab8d0d-9fb4-4cf7-ad36-3c6b4882cd16"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| songWorkId | string | ✅ | 歌曲 ID |
| sourceItemId | string | ❌ | 指定音源项，不传则自动选择 |

**响应**（201）：
```json
{
  "item": { "id": "...", "songWorkId": "...", "sourceItemId": "..." },
  "total": 1
}
```

---

### DELETE /api/queue/:position

删除队列中指定位置的歌曲。

**路径参数**：
- `position` — 0-based 位置索引

**响应**：
```json
{ "ok": true, "total": 2 }
```

---

### POST /api/queue/next

取出队列中的下一首并自动开始播放。

**请求体**（可选）：
```json
{
  "autoStart": true
}
```

**响应**：
```json
{
  "queueItem": { "id": "...", "songWorkId": "...", "sourceItemId": "..." },
  "resolve": { "options": [...], "best": {...}, "errors": [] }
}
```

---

### POST /api/queue/clear

清空队列。

**响应**：
```json
{ "ok": true, "removed": 3 }
```

---

## 5. 播放历史

### GET /api/history

获取播放历史（按时间倒序）。

**请求参数**（Query String）：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| limit | number | ❌ | 每页数量，1-100，默认 20 |
| offset | number | ❌ | 偏移量，默认 0 |
| source | string | ❌ | 按音源过滤 |

**响应**：
```json
{
  "items": [
    {
      "id": "xxx",
      "songWorkId": "xxx",
      "songWorkTitle": "hello",
      "songWorkArtists": "Mock Artist",
      "source": "mock",
      "sourceItemId": "xxx",
      "trigger": "manual",
      "outcome": "completed",
      "durationPlayedSec": 180,
      "fallbackFromId": null,
      "playedAt": 1784969910000
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

---

### GET /api/history/:songWorkId

获取某首歌的播放历史。

**路径参数**：
- `songWorkId` — 歌曲 ID

**响应**：
```json
{
  "songWork": { "id": "...", "title": "...", "artists": "..." },
  "items": [...],
  "total": 3
}
```

---

## 6. 收藏夹

### GET /api/collections

获取所有收藏。

**响应**：
```json
{
  "items": [
    {
      "songWorkId": "xxx",
      "preferredSource": "mock",
      "preferredRecordingId": null,
      "createdAt": 1784969910000,
      "songWork": { "id": "xxx", "title": "hello", "artists": "Mock Artist" }
    }
  ],
  "total": 1
}
```

---

### POST /api/collections

添加收藏。

**请求体**：
```json
{
  "songWorkId": "5163e682-4c3e-4960-9079-33614d82d55e",
  "preferredSource": "mock",
  "preferredRecordingId": "a7a37c87-47fb-4623-8246-edaffc5d54d2"
}
```

**响应**（201）：
```json
{
  "collection": { ... },
  "songWork": { "id": "...", "title": "...", "artists": "..." }
}
```

**错误**：
- `404` — 歌曲不存在
- `409` — 已经收藏过

---

### DELETE /api/collections/:songWorkId

取消收藏。

**路径参数**：
- `songWorkId` — 歌曲 ID

**响应**：
```json
{ "ok": true }
```

---

### PATCH /api/collections/:songWorkId

更新收藏的首选音源。

**请求体**：
```json
{
  "preferredSource": "youtube",
  "preferredRecordingId": null
}
```

**响应**：
```json
{ "collection": { ... } }
```

---

## 7. 歌单

### GET /api/playlists

获取所有歌单。

**响应**：
```json
{
  "items": [
    {
      "id": "xxx",
      "name": "我的歌单",
      "visibility": "private",
      "createdAt": 1784969910000,
      "updatedAt": 1784969910000
    }
  ],
  "total": 1
}
```

---

### POST /api/playlists

创建歌单。

**请求体**：
```json
{
  "name": "我的歌单",
  "visibility": "private"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | ✅ | 歌单名称，1-200字符 |
| visibility | string | ❌ | `private`（默认）/ `shared` |

**响应**（201）：
```json
{ "playlist": { ... } }
```

---

### GET /api/playlists/:id

获取歌单详情（含歌曲列表）。

**路径参数**：
- `id` — 歌单 ID

**响应**：
```json
{
  "playlist": { "id": "...", "name": "...", "visibility": "private" },
  "items": [
    {
      "id": "item-id",
      "songWorkId": "xxx",
      "position": 0,
      "addedAt": 1784969910000,
      "songWork": { "id": "...", "title": "...", "artists": "..." }
    }
  ],
  "total": 3
}
```

---

### PATCH /api/playlists/:id

更新歌单信息。

**请求体**：
```json
{
  "name": "新名称",
  "visibility": "shared"
}
```

**响应**：
```json
{ "playlist": { ... } }
```

---

### DELETE /api/playlists/:id

删除歌单（级联删除所有歌曲）。

**响应**：
```json
{ "ok": true }
```

---

### POST /api/playlists/:id/items

添加歌曲到歌单。

**请求体**：
```json
{
  "songWorkId": "5163e682-4c3e-4960-9079-33614d82d55e",
  "position": 0
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| songWorkId | string | ✅ | 歌曲 ID |
| position | number | ❌ | 插入位置（0-based），不传则追加到末尾 |

**响应**（201）：
```json
{
  "item": { "id": "...", "songWorkId": "...", "position": 0 },
  "songWork": { "id": "...", "title": "...", "artists": "..." }
}
```

---

### DELETE /api/playlists/:id/items/:itemId

从歌单删除歌曲。

**路径参数**：
- `id` — 歌单 ID
- `itemId` — 歌单项 ID

**响应**：
```json
{ "ok": true }
```

---

### PATCH /api/playlists/:id/items/:itemId

调整歌曲在歌单中的位置。

**请求体**：
```json
{
  "position": 2
}
```

**响应**：
```json
{ "item": { ... } }
```

---

## 8. 音源管理

### GET /api/sources

获取所有音源及其状态。

**响应**：
```json
{
  "sources": [
    {
      "id": "mock",
      "displayName": "Mock (dev only)",
      "capabilities": { "search": true, "playOptions": true, "health": true },
      "stats": { "totalCalls": 1, "successRate": 1, "avgLatencyMs": 0 }
    },
    {
      "id": "local",
      "displayName": "Local Files",
      "capabilities": { "search": true, "playOptions": true, "health": true },
      "stats": { "totalCalls": 1, "successRate": 1, "avgLatencyMs": 1 }
    },
    {
      "id": "youtube",
      "displayName": "YouTube",
      "capabilities": { "search": true, "playOptions": true, "health": true },
      "stats": { "totalCalls": 1, "successRate": 0, "avgLatencyMs": 0 }
    }
  ]
}
```

---

### GET /api/sources/health

检查所有音源健康状态。

**响应**：
```json
{
  "health": [...]
}
```

---

### GET /api/sources/:id/health

检查单个音源健康状态。

**路径参数**：
- `id` — 音源 ID（`mock` / `local` / `youtube`）

---

### GET /api/sources/:id/search

测试单个音源的搜索。

**请求参数**（Query String）：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| q | string | ✅ | 搜索关键词 |
| limit | number | ❌ | 返回数量 |

**响应**：
```json
{
  "source": "mock",
  "query": "hello",
  "hits": [...]
}
```

---

## 9. 缓存管理

### GET /api/admin/cache/status

查看缓存状态。

**响应**：
```json
{
  "search": { "size": 5, "hits": 10, "misses": 3 },
  "playOptions": { "size": 2, "hits": 5, "misses": 1 },
  "config": {
    "searchTtlSec": 60,
    "searchMaxEntries": 100,
    "playOptTtlSec": 30,
    "playOptMaxEntries": 200
  }
}
```

---

### POST /api/admin/cache/invalidate

手动清除单个缓存条目。

**请求体**（搜索缓存）：
```json
{
  "kind": "search",
  "query": "hello",
  "limit": 10,
  "sources": ["mock"]
}
```

**请求体**（播放选项缓存）：
```json
{
  "kind": "source-item",
  "source": "mock",
  "externalId": "mock-hello-0"
}
```

**响应**：
```json
{ "ok": true, "kind": "search" }
```

---

### POST /api/admin/cache/clear

清除所有缓存。

**响应**：
```json
{ "ok": true }
```

---

## 10. 数据生命周期

### GET /api/admin/lifecycle/status

查看清理任务状态。

**响应**：
```json
{
  "lastRun": null,
  "nextRun": null,
  "config": {
    "retentionDays": 30,
    "intervalHours": 24
  }
}
```

---

### POST /api/admin/lifecycle/run

手动触发数据清理。

**响应**：
```json
{ "deletedCount": 0 }
```

---

## 11. WebSocket

### 连接地址

```
ws://localhost:3000/ws
```

### 频道

| 频道 | 说明 |
|------|------|
| playback | 播放状态变化（开始/结束/切换） |
| queue | 队列变更 |
| progress | 播放进度同步 |

### 客户端 → 服务端消息

**订阅频道**：
```json
{ "type": "subscribe", "channel": "playback" }
```

**取消订阅**：
```json
{ "type": "unsubscribe", "channel": "playback" }
```

**上报播放进度**：
```json
{ "type": "progress", "playId": "xxx", "positionSec": 45.3, "durationSec": 180 }
```

### 服务端 → 客户端消息

**连接成功**：
```json
{ "type": "connected", "connectionId": "conn-xxx", "channels": ["playback", "queue", "progress"] }
```

**订阅确认**：
```json
{ "type": "subscribed", "channel": "playback" }
```

**播放开始**：
```json
{
  "type": "play:started",
  "playId": "xxx",
  "source": "mock",
  "sourceItemId": "xxx",
  "optionType": "embed"
}
```

**播放结束**：
```json
{
  "type": "play:ended",
  "playId": "xxx",
  "outcome": "completed",
  "durationPlayedSec": 180
}
```

**播放源切换**：
```json
{
  "type": "play:fallback",
  "oldPlayId": "xxx",
  "newPlayId": "yyy",
  "source": "youtube",
  "sourceItemId": "xxx"
}
```

**队列变更**：
```json
{
  "type": "queue:changed",
  "action": "add",
  "songWorkId": "xxx",
  "total": 3
}
```

`action` 可选值：`add` / `remove` / `clear` / `next`

**进度同步**（来自其他客户端）：
```json
{
  "type": "progress:sync",
  "playId": "xxx",
  "positionSec": 45.3,
  "durationSec": 180
}
```

**错误**：
```json
{ "type": "error", "message": "invalid message format" }
```

### GET /api/ws/status

查看 WebSocket 连接状态。

**响应**：
```json
{
  "connections": 2,
  "channels": ["playback", "queue", "progress"]
}
```

---

## 错误码汇总

| HTTP 状态码 | 错误码 | 说明 |
|------------|--------|------|
| 400 | validation_error | 请求参数验证失败 |
| 400 | queue_empty | 队列为空 |
| 400 | not_local | 非本地音源，无法流式播放 |
| 400 | range_not_satisfiable | 请求范围超出文件大小 |
| 401 | unauthorized | 未认证或 token 无效 |
| 404 | not_found | 资源不存在 |
| 404 | file_missing | 本地文件不存在 |
| 409 | already_favorited | 已经收藏过 |
| 416 | range_not_satisfiable | Range 请求超出范围 |
| 502 | source_error | 音源服务不可用 |
| 500 | internal_error | 服务器内部错误 |

---

## 前端对接建议

### 1. 搜索流程

```
用户输入关键词 → GET /api/search?q=xxx → 显示结果列表
```

### 2. 播放流程

```
点击歌曲 → POST /api/play/resolve (获取播放选项)
         → POST /api/play/start (开始播放)
         → 根据 option.type 决定播放方式：
            - embed: 使用 iframe/player
            - stream: 使用 audio/video 元素
            - local: 使用 /api/local/stream/:sourceItemId
         → 播放结束 → POST /api/play/:playId/end
         → 播放失败 → POST /api/play/:playId/fallback
```

### 3. 队列管理

```
添加到队列 → POST /api/queue
播放下一首 → POST /api/queue/next
```

### 4. 实时同步

```
连接 WebSocket → subscribe 到 playback/queue/progress 频道
监听 play:started / play:ended / queue:changed 事件
定期上报播放进度 → progress 消息
```

### 5. 错误处理

所有接口在出错时返回统一格式：
```json
{
  "error": {
    "code": "error_code",
    "message": "错误描述"
  }
}
```

前端应根据 `code` 做相应处理，`message` 可以直接展示给用户。
