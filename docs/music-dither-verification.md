# Moodverse 二维抖动改造验收记录

日期：2026-10-08。分支：`codex/music-dithering-ui`。
测试地址：[隔离音乐 staging](https://moodverse-music-staging.pages.dev)。
只发布隔离 Pages 项目，不合并旧 `main`，不触碰旧情绪星球站点或其数据库。

## 交付与证据

| 范围 | 实际交付 | 验证证据 |
| --- | --- | --- |
| 二维运行入口 | 音乐站只加载共享 2D shader、Canvas、SVG/CSS 资产。无 Three/R3F、3D 相机、模型加载器及模型网络请求 | 生产构建 36 模块；生产 JS 无 Three、GLTFLoader、GLB/GLTF 标记；实际浏览器资源检查 |
| 外观组合 | 有机流体、粒子球、脉冲星、暗核环流 × 星空流线、琴谱、彼岸花、潮汐、数字织纹、星尘、棱镜环带；4 种抖动阈值；紫粉蓝 + 黑白 | 28 种组合图集已逐项查看；renderer/layout/component 测试 |
| 球面体积（用户追加） | 在二维 quad 内计算球面深度、绕轴自转的材质坐标、明暗半球与边缘光；星球、恒星、好友卫星看起来有体积。星云与音乐唱片不套球面。无 p5/模型/Three 依赖 | 球面与平面区分、中心纹理位移、边缘压缩、周期/明暗测试；真实 GPU 两相位有 18,436 个不透明像素变化，明面/暗面亮度约 2.96 倍；28 组合与 CPU 降级图集 |
| 音乐参数化 | 固定星球 ID 种子；主曲 50%，其余均分 50%；单曲 100%；节奏/硬度/能量影响速度、扰动、密度、亮度及粉蓝权重。未测量的 BPM 保持空值 | appearance 与 catalog/API 测试；双账号实时保存与公开读取 |
| 外观编辑 | 4 个分类选择器、15 个数值参数；实时预览、取消、应用、重置、冲突后重读。手动参数在换歌后保留 | editor/app/API 测试；线上双账号验证越界 400、陈旧版本 409、换歌保留 |
| 统一资产 | 星球/恒星/音乐卫星/好友卫星复用同一绘制管线；缩略图使用有上限的 Canvas 缓存；标题、按钮、图标、卡片使用统一抖动样式 | 浏览器与组件测试；无每卡片独立 WebGL 上下文 |
| Galaxy 旅程 | 我的星球 ↔ 星云 ↔ 多星系宇宙 ↔ 具体星系 ↔ 访客星球。分类重排时短暂模糊；固定底轴；滚轮、拖拽、方向键到末端返回自己的星球 | 实际线上轴中心始终 735/1470，内层列表滚轮不改场景；末端三输入回归测试；2100ms 正反旅程帧测试 |
| 原有社交 | 匿名身份、3 个默认好友卫星、Orbit 五分组、好友申请、好友私信、公开/私密 Moment、精确撞歌、随机漫游、漂流瓶与举报审核规则保留 | 完整回归；线上两个独立账号验证友谊前私信 403、接受后私信 201、公开/私密隔离、Galaxy/Orbit 外观一致 |
| AI 边界 | 外观创建/修改同步返回 v3，不排队、不轮询，不使用 Moment 文字。发现和精确同歌候选排名的 AI 通道保留；不可用时保留现有规则兜底 | compose 返回 deterministic、无 task；Moment 不引发外观任务；队列查询为 0；发现/匹配回归测试 |
| 可读性与无障碍 | 抖动主要用于表现层；正文、隐私提示、表单保持原生清晰文字。语义按钮、焦点、键盘场景入口保留 | 组件/表单测试；实际窄屏 editor 独立滚动 |
| 生命周期与降级 | 单 WebGL2 管线；DPR/慢帧降质；隐藏页暂停；减少动态效果即时切换；上下文丢失切 Canvas，并支持恢复 | 实际 context loss → 非空 Canvas → WebGL2 恢复；linked=true、GL error=0；Canvas/lifecycle 测试 |
| 窄屏 | 六个主要页面均无文档级或内容栏横向溢出；五张唱片弧形选择墙可容纳；编辑器内滚动 | 线上 320px：我的星球、Galaxy、漫游、漂流瓶、Orbit、设置均 scrollWidth=320；栏 clientWidth/scrollWidth 均 286 |

## 可重复执行的检查

```sh
npm test
npm run build
npm run music:staging:preflight
node scripts/check-dither-lab.mjs <owned-cdp-target>
node scripts/check-dither-rotation.mjs <owned-dev-gallery-target>
node scripts/check-dither-sphere.mjs <owned-dev-gallery-target>
node scripts/check-dither-product.mjs https://moodverse-music-staging.pages.dev --confirm-qa-accounts
```

- 完整测试：54 文件，340 项通过。Node 的 SQLite experimental warning 是现有运行时提示，不是测试失败。
- 球面追加后的构建为 37 模块，音乐 JS 130.04 kB / gzip 37.50 kB、React 入口 192.00 kB / gzip 60.70 kB。未复制重资产。
- 球面体积是二维渲染内的解析投影，不是恢复旧 3D 场景。GPU 纹理自转、光源保持观众左上方；CPU 降级与缩略图保留静态球面体积，不运行点粒子物理。
- 双账号脚本只创建标记明确的 QA 账号；结束时只删除 QA 创建的 Moment，将两个 QA 星球设为私密。不改已有用户的星球、选曲或记录。
- 漂流瓶完整发布/评论/放流行为由回归测试覆盖；线上不向真实用户投递测试瓶。模型在线能力取决于原有匹配 AI 服务是否运行，本次没有宣称它已经永久在线。
- 美术组合图集、浏览器截图与日志存放在本地临时验收目录，不将重图片或用户资料提交 Git。

## 数据发布与回退

隔离 D1：`moodverse-music-staging-db`，ID `58d7ea1b-aaaf-4639-8adb-5fb2136dddf4`。

- 发布前导出备份，已实际导入内存 SQLite 核对：31 星球、59 选曲、27 Moment。
- 备份位置：工作区忽略目录 `.wrangler/backups/moodverse-dither-staging-20261008.sql`；另有 `/tmp/moodverse-dither-staging-backup-20261008.sql` 副本。
- SHA-256：`1833f097a507fcde725ca92300ca00e5ad3da45c317f47b613e9ad265fb6b1f0`。
- 只应用增量 `0002_dither_appearance.sql`；迁移前后原表数量不变，31/31 旧外观 JSON 与原值相同。ID、关系、记录不重建。
- 新列存旧外观备份、CAS 版本/令牌与可选音乐特征。旧外观读时兼容转换，读取不回写；首次编辑原子保存 v3。
- 旧外观 AI 迟到写入被触发器拦截；发现/匹配任务不取消。线上外观排队任务为 0。
- Pages 的 production 环境名为 `main`，它不是 GitHub 旧 `origin/main`。CLI 发布只指定 `moodverse-music-staging`，绑定上述隔离 D1。
- 回退流程见 [二维外观迁移说明](music-dither-migration.md)。未在有真实用户的数据上执行破坏性回退。

## 评审与实施裁定

一次独立全分支评审：无 Critical；Important 的 GPU/CPU 旋转与拾取不一致已经修复，并经历真实 WebGL 失败→通过以及粗网格命中测试 RED→GREEN。

本次裁定与取舍全部列出：

1. 旧 PRODUCT/DESIGN 对应情绪/3D 产品；以本轮批准的音乐二维方案为准，不重新引入外观 AI。
2. 已安装的依赖与基线测试可用，不做无关依赖升级；图索引仅作定位，实际代码仍核对源码。
3. 旧 3D 源码/历史保留为归档，音乐生产入口无法加载；本分支不支持打开旧 3D 界面，也不验证不可达旧界面交互。
4. 隐藏页切换与减少动态效果直接落到最终状态；可见页保持 2100ms 正反旅程。代价是后台不会补播旅行动画。
5. 删除装饰性副标题，保留版权、隐私、演示曲库与匹配 AI 降级说明；这些必要正文仍使用可读原生文字。
6. 独立评审没有对线上发布、真实双账号、窄屏、上下文恢复或美术效果下结论；这些由执行者补足验收证据。美术喜好仍需用户实际确认。
7. 按已授权选择推送新分支并发布隔离 staging，不合并旧 main、不创建未请求的 PR；保留现有受管理工作区及无关未跟踪资产。
8. 用户追加 [OpenProcessing 球面参考](https://openprocessing.org/@noel/2812705) 后，以独立球面数学实现体积和旋转，保留全部音乐参数化规则。参考的许可为 CC BY-NC-SA 3.0，不复制其 p5 源码；本次没有实现其 8,000 个点的弹簧/速度状态，而是继续复用共享 shader 和已有鼠标扰动。

唯一延期的 Minor：自定义 JSON 中 `pointer: ['strong']` 或特征 `source: ['curated']` 等数组会被枚举校验的字符串转换接纳。普通编辑器仅产生字符串，数字参数仍有界；这种畸形 JSON 的严格类型拒绝留待下一次加固，不影响正常外观编辑。
