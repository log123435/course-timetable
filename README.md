# 课迹 · 我的课程表

移动优先的课程表 PWA：打开网页即可使用，能添加到手机主屏幕，断网也能打开。课程数据、图片备忘默认保存在本机 `localStorage` 中。

**在线地址：<https://log123435.github.io/course-timetable/>**

手机、平板、电脑在任何网络下都能直接访问，不需要开电脑、不需要连同一个 Wi-Fi、也不需要本地服务器。第一次用手机打开后，在浏览器里选择「安装应用 / 添加到主屏幕」，之后像普通 App 一样启动。

## 为什么之前必须连同一个 Wi-Fi

早期版本靠 `python -m http.server` 在电脑上起一个静态服务器，手机只能用局域网 IP 访问，所以必须开电脑、同一个 Wi-Fi、还要放行防火墙。现在页面托管在 GitHub Pages 上，服务器这一环彻底去掉：

- 不用启动电脑或任何本地服务
- 不用记局域网 IP，不怕防火墙弹窗
- 不在同一网络也能用（4G/5G、教室 Wi-Fi、别人家都行）
- Service Worker 缓存应用壳，地铁里断网也能看课表
- HTTPS 环境才支持 PWA 安装与离线缓存，Pages 默认提供

## 使用步骤（手机）

1. 打开 <https://log123435.github.io/course-timetable/>
2. Chrome 菜单 → 「安装应用」；iPhone Safari → 分享 → 「添加到主屏幕」
3. 点「导入课表」→ 浏览文件，选择自己的 Excel / CSV / 截图；导入后数据存在手机本地，下次打开直接显示
4. 需要换手机或重装时，用「设置 → 导出备份」保存 JSON，在新设备导入

> 仓库里没有上传个人的 `课程表.xlsx`（已被 `.gitignore` 排除）。在线版首次打开显示示例课表，导入自己的文件即可覆盖。

## 已实现

- 显示当前学期周次，支持上一周、下一周和回到本周
- 手动设置当前周次，并保存多个学期的独立课表
- 连续周、指定周、单周和双周课程
- 横向周视图，点击课程可编辑、换色、删除
- 一键清空当前学期课表
- 导入 CSV、TXT、XLSX、XLS 表格
- 导入课程表截图，浏览器端 Tesseract.js 识别文字，写入前提供可编辑确认框
- 图片备忘：压缩、标题、说明、标签、本地保存
- 学期开始日期与每日节数设置
- JSON 数据备份、示例数据恢复
- Service Worker 缓存应用壳，可安装为 PWA，联网时自动获取最新版本
- 192/512/maskable 图标，Android 与 iOS 主屏图标正常显示

## 本地运行（仅开发调试用）

在线版已经不需要这一步，只有改代码时才需要：

```powershell
cd D:\课程表
python -m http.server 8765 --bind 0.0.0.0
```

或者双击 `启动课程表.bat`。电脑访问 `http://localhost:8765`，手机用同一 Wi-Fi 下的局域网 IP 访问。

> 本地目录里放了 `课表.xlsx` 时，「读取项目中的课表.xlsx」按钮才会出现；在线版检测不到文件会自动隐藏该按钮。

## 部署（GitHub Pages）

仓库已配置 `.github/workflows/deploy-pages.yml`：推送到 `main` 后自动发布，无需手动操作。

```powershell
git add -A
git commit -m "update"
git push
```

推送后约 1 分钟生效。Pages 在仓库 Settings → Pages 中，Source 选择 “GitHub Actions”。

国内网络访问 `github.com` 可能不稳定（DNS 污染 / 连接重置），而 `api.github.com`、`ssh.github.com` 一般可用，必要时给 git 配置 SSH 走 443：

```powershell
# ~/.ssh/config
Host github.com
  HostName ssh.github.com
  Port 443
  User git
```

## 识别格式

表格列名支持中文或英文，例如 `课程, 星期, 开始节, 结束节, 教室, 教师`；也支持 `星期、节次、课程名称、上课周次、上课地点、任课教师` 的明细格式，并会解析周次范围。OCR 结果会先展示文本，确认后再导入。手动粘贴时每行一门课：

```text
高等数学，周一，1-2，A-203，李老师
大学英语，周三，第5-6节，B-108，王老师
```

当前节次时间采用 11 节安排：`08:00-08:50`、`09:00-09:50`、`10:10-11:00`、`11:10-12:00`、`14:30-15:20`、`15:30-16:20`、`16:40-17:30`、`17:40-18:30`、`19:30-20:20`、`20:30-21:20`、`21:30-22:20`。

## 目录结构

```text
.
├── index.html                 # 单页应用结构
├── styles.css                 # 移动优先样式
├── app.js                     # 课表、导入、OCR、备忘逻辑
├── sw.js                      # Service Worker（联网优先 + 离线兜底）
├── manifest.json              # PWA 清单
├── icons/                     # 应用图标（192 / 512 / maskable / iOS）
├── 启动课程表.bat              # 本地调试服务器
└── .github/workflows/deploy-pages.yml
```

## 可继续升级

OCR 目前把文字映射到星期和节次，适合结构清晰的截图；复杂表格可以换成 PaddleOCR 表格结构识别，先取单元格坐标再映射到行列。课程冲突检测、ICS 导出、多设备云同步都是合适的下一步。

## 开源借鉴

- [Tesseract.js](https://github.com/naptha/tesseract.js) · Apache-2.0，浏览器端 OCR
- [SheetJS](https://github.com/SheetJS/sheetjs) · Apache-2.0，浏览器端读取 XLSX
- [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) · Apache-2.0，表格结构识别
- [RapidOCR](https://github.com/RapidAI/RapidOCR) · Apache-2.0，移动端离线推理
- [Zeolite](https://github.com/SoumoparnoRoy/Zeolite) · MIT，截图导入预览确认流程
- [timetable](https://github.com/JonasWanke/timetable) · Apache-2.0，周视图与本地化交互

页面通过 CDN 加载 Tesseract.js 和 SheetJS，版本已固定（xlsx 0.18.5、tesseract.js 5）。
