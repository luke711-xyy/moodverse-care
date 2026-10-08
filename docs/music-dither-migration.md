# 二维外观增量迁移与回退

仅用于隔离的 `moodverse-music-staging-db`，不应用到旧情绪星球数据库。
现有 schema 基线不重跑。使用 staging 配置的 D1 migrations apply，只新增
`0002_dither_appearance.sql`；在部署二维代码前完成扩展。

## 扩展与兼容

- 增加旧外观备份、写入版本及随机写入令牌；曲库增加可空的音乐特征 JSON。
- 保存旧 JSON 原值，不改星球 ID、账号、歌曲、Moment、好友或访问信息。
- 旧/异常外观读取时，从该星球选曲生成有界 v3。读取不回写数据库；首次
  编辑后，外观与歌曲在同一批事务保存为 v3。没有私密文字参与外观计算。
- `planet_composer` 排队任务标记退出；触发器拦住旧 worker 迟到的 v1/v2
  覆盖。漫游和撞歌任务不取消。
- 版本冲突返回 409 `APPEARANCE_CONFLICT`，失败请求不动歌曲和外观。
- 曲库导入只有明确来源的特征才会保存；未知 BPM 保持缺失。新增字段为
  可选项，旧曲库 JSON 仍能导入。导入工具需要先完成此数据库扩展。

## 发布前检查

1. staging preflight 确認 Pages / scheduler 绑定相同隔离 D1，且不同于旧站。
2. 只读统计 `music_planets`、`music_planet_tracks`、`music_moments`、
   `music_ai_tasks` 行数；导出 staging 数据库备份。
3. 查看 migration 历史与 `PRAGMA table_info(music_planets)`，避免重跑已执行
   的 ALTER。先在 SQLite 测试夹具验证迁移，再应用到 staging。
4. 迁移后核对原表行数不变；旧 JSON 与备份相同；只有外观任务被取消。
5. 部署后验证两账号保存、访问、隐私、Galaxy/Orbit 缩略图一致及冲突提示。

## 回退

先停止二维写入并切回上一版本部署。保留新增列，不删表和用户记录。
经确认需要回退外观时，先移除 `music_reject_legacy_visual_overwrite` 触发器，
再仅对 `legacy_visual_json IS NOT NULL` 的行恢复备份 JSON，并从备份中的
schemaVersion 恢复旧版本号。新创建、无旧备份的星球使用上一版本的默认
外观读取路径；不要删星球。恢复前再次导出当前数据，避免丢失二维编辑。
匹配任务无需恢复或重排。
