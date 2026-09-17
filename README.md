# FilmGrab Stills 影片剧照下载

通过豆包AI浏览器从 [FILMGRAB](https://film-grab.com/) 自动下载影片剧照的免费技能：搜索影片关键词 → 打开匹配的影片详情页 → 按代表性原则选取 3 张剧照 → 保存到本地桌面「电影参考图」文件夹，可作为调色匹配（Color Match LUT）的参考图。

## 安装（完全免费）

在豆包中向豆包说下面这句话即可安装本技能：

```
安装技能 filmgrab-stills，仓库地址 https://github.com/rick8393/filmgrab-stills
```

## 使用

安装后，直接对豆包说：

> 帮我下载《疯狂的麦克斯4》的剧照

可换成任意影片名，豆包会自动打开 FILMGRAB 搜索并下载 3 张代表性剧照到桌面「电影参考图」文件夹。

## 文件结构

| 文件 | 说明 |
|---|---|
| `SKILL.md` | 技能定义与执行说明 |
| `scripts/run.js` | 豆包浏览器自动化运行器入口 |
| `assets/release.json` | 技能清单与运行协议 |
| `assets/runner.js` | FILMGRAB 自动下载业务逻辑 |

## 环境要求

- 豆包本地电脑模式（客户端最低版本 2.28.8）
- 豆包浏览器自动化助手可用
