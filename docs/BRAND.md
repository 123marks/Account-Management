# 品牌与图标（Logo）

## 现状

当前图标为 `build/icon.svg` → `build/icon.png`（1024×1024）：紫色渐变圆角方块（squircle）+ 白色盾牌 + 紫色钥匙孔，右上角一个高光圆点。

主色板：

| 用途 | 色值 |
|---|---|
| 主色渐变起 | `#7B6CFF` |
| 主色渐变止 | `#3B2ED6` |
| 前景/盾牌 | `#FFFFFF` → `#E4E7FF` |
| 强调（钥匙孔） | `#4A3BE6` |

## 生成规格（无论用哪个提示词都要满足）

- 输出 1024×1024 PNG，透明背景（若模型不支持透明，用纯色背景后手动抠图）
- 单一主体居中，四周留 8%–10% 安全边距
- 形状简洁，缩到 32×32 仍可辨认；不要细线、不要文字、不要英文单词
- 平面矢量风格，最多 2–3 个颜色层级
- 不带外部投影（macOS/Windows 会自行加阴影）

## 提示词方案

### 方案 A · 盾牌 + 钥匙孔（延续现有识别，推荐）

```
App icon for a desktop password and account security manager.
A rounded-square (squircle) tile with a smooth diagonal gradient from
#7B6CFF to #3B2ED6, containing a centered solid white shield with a
single clean keyhole cut out of it in deep indigo #4A3BE6.
Flat vector, geometric, minimal, no text, no letters, sharp crisp edges,
subtle top-left glossy highlight, transparent background outside the tile,
centered composition, 1024x1024, macOS Big Sur app icon style.
```

中文要点：紫色渐变圆角方块 + 居中白盾 + 钥匙孔，扁平几何，无文字。

### 方案 B · 盾牌 + 2FA 倒计时环（突出实时验证码）

```
Minimal app icon for a 2FA and account manager desktop app.
A white shield centered inside a violet gradient squircle (#7B6CFF to #3B2ED6),
wrapped by a thin circular progress ring in cyan #4DE1FF that is 70% complete,
suggesting a countdown timer. Inside the shield, a simple keyhole.
Flat vector, geometric, two-tone, no text, no numbers, crisp edges,
transparent background, centered, 1024x1024, modern SaaS app icon.
```

中文要点：白盾外面套一圈青色倒计时进度环，暗示 TOTP 30 秒刷新。

### 方案 C · 钥匙 + 多平台节点（突出"多账号集中管理"）

```
App icon for a multi-platform account manager.
A stylized white key at the center of a deep violet gradient squircle
(#7B6CFF to #3B2ED6); the key's bow is formed by four small connected
dots arranged like a network node graph, symbolizing multiple linked accounts.
Flat vector, geometric, minimal, symmetrical, no text, crisp edges,
soft inner highlight, transparent background, 1024x1024.
```

中文要点：钥匙的圆头由四个相连的节点组成，象征多平台账号互联。

### 方案 D · 保险库 / 密码箱（更"重资产"的安全感）

```
App icon of a modern digital vault.
A rounded-square violet gradient tile (#7B6CFF to #3B2ED6) with a centered
white circular vault dial, four short spokes, and a small keyhole in the middle.
Flat vector, geometric, minimal, high contrast, no text,
subtle diagonal light sweep, transparent background, centered, 1024x1024,
premium security software icon.
```

中文要点：保险柜转盘造型，四根短辐条 + 中心钥匙孔。

### 方案 E · 字母 A 与盾牌合体（品牌字标）

```
Monogram app icon: the letter "A" constructed as a shield silhouette,
solid white on a violet gradient squircle (#7B6CFF to #3B2ED6).
The crossbar of the A is a horizontal slot resembling a keyhole.
Flat vector, geometric, bold, negative space design, minimal,
no additional text, crisp edges, transparent background, 1024x1024.
```

中文要点：字母 A 本身就是盾牌轮廓，横杠做成钥匙孔缝隙，负空间设计。

### 负面提示词（通用）

```
photorealistic, 3d render, glossy plastic, drop shadow, bevel, skeuomorphic,
text, letters, watermark, signature, busy details, thin lines, gradient mesh,
multiple objects, cluttered, low contrast, jpeg artifacts, border frame
```

### 配色替换（想换主色时）

把提示词里的两个十六进制色替换即可：

| 风格 | 渐变起 → 止 |
|---|---|
| 现有紫（默认） | `#7B6CFF` → `#3B2ED6` |
| 深海蓝 | `#4F9CFF` → `#1B3FBF` |
| 墨绿安全感 | `#3FD9A4` → `#0E7A5F` |
| 石墨黑（极简） | `#3A3A44` → `#131318` |
| 琥珀警示 | `#FFB44D` → `#D97706` |

## 替换到项目里

1. 生成 1024×1024 PNG，命名 `icon.png`，覆盖 `build/icon.png`。
   若拿到的是 SVG，覆盖 `build/icon.svg` 后执行 `npm run make:icon` 自动栅格化。
2. 检查透明背景与边距，确认缩略图（32×32）下仍清晰。
3. 重新打包：`npm run dist:win`。electron-builder 会自动从 PNG 生成 Windows `.ico` 与 macOS `.icns`，无需手动转换。
4. Windows 图标缓存可能残留旧图标，重装或执行 `ie4uinit.exe -show` 刷新。
