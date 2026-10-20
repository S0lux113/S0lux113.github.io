# 把博客部署到 GitHub Pages

> 写给第一次用 GitHub 的人。照着做，大约 10 分钟能拿到一个公开网址。
> 当前账号：`S0lux113`（GitHub 个人主页已确认存在）。

---

## 先搞清楚三件事

1. **托管 = 把文件放进 GitHub 仓库 + 打开 Pages**。GitHub 会把你仓库根目录的 `index.html` 当成网站首页。
2. **线上看到的是 `assets/js/posts.js` 里的内容**。你在网页写作台里写的文章，默认只保存在**你这台电脑的浏览器**里；要让所有人都看到，必须「导出发布文件」并替换上传。
3. **仓库是公开的**：页面上的姓名、邮箱、微信、QQ 都会公开可见。不想公开的内容，先在「设置」里删掉再导出。

---

## 已经替你准备好的

- `个人博客` 文件夹已经是一个 **本地 Git 仓库**，并完成了首次提交（在文件夹里执行 `git log` 能看到）。
- `.nojekyll`：告诉 GitHub Pages 不要用 Jekyll 处理，避免构建问题。
- `.gitignore`：忽略系统生成的杂项文件。
- `发布到GitHub.ps1`：一键提交并推送的脚本。
- 写作台「设置 → 导出发布文件」：把当前资料和文章导出成可发布的 `posts.js`。

**唯一缺的**：这台机器没有你的 GitHub 登录态，且当前网络对 `github.com` 的 Git 连接被重置，所以最后「创建仓库 / 推送 / 开启 Pages」需要你在浏览器里完成。下面的方案 A 完全不需要命令行。

---

## 方案 A：网页上传（第一次推荐，零命令）

### 1. 建仓库

1. 打开 <https://github.com/new> 并登录（用户名 `S0lux113`）。
2. **Repository name** 填：`S0lux113.github.io`
   - 这样最终网址是 `https://s0lux113.github.io/`（短网址，一个账号只能有一个用户站）
   - 也可以填 `blog`，网址会变成 `https://s0lux113.github.io/blog/`
3. 可见性选 **Public**。
4. **不要**勾选 Add a README / .gitignore / license（避免和本地文件冲突）。
5. 点 **Create repository**。

### 2. 上传文件

1. 新仓库页面点 **uploading an existing file**。
2. 打开 `D:\DSH\GAME\ZAXIANG\个人博客`。
3. 选中 `index.html`、`assets` 文件夹、`README.md`、`部署到GitHub.md`，一起拖进浏览器上传框。
   - `预览` 文件夹可选（约 2.7MB，只是预览图；不上传的话 README 里的预览链接会失效）。
   - `发布到GitHub.ps1` 也可以一起传，不影响网站。
4. 底部 **Commit changes**，消息填「初始化博客」，提交。

> 注意：仓库根目录必须**直接**看到 `index.html`，不能变成 `个人博客/index.html` 多一层。
> `assets` 的目录结构要保留：`assets/css/blog.css`、`assets/js/*.js`。

### 3. 开启 Pages

1. 仓库顶部 **Settings** → 左侧 **Pages**。
2. **Build and deployment** → Source 选 **Deploy from a branch**。
3. Branch 选 **main**，目录选 **/(root)**，点 **Save**。
4. 等 1–2 分钟，页面顶部会出现 `Your site is live at https://s0lux113.github.io/`。

### 4. 检查

- 首页能打开、样式正常、点文章能进详情页。
- 如果 404：再等 1 分钟；确认 Pages 已保存、分支是 main、根目录有 `index.html`。

---

## 方案 B：命令行（推荐长期使用）

仓库已经在本地初始化好了，你只需要关联远程地址并推送：

```powershell
cd D:\DSH\GAME\ZAXIANG\个人博客

# 把地址换成你自己的仓库
git remote add origin https://github.com/S0lux113/S0lux113.github.io.git

git push -u origin main
```

第一次 `push` 会弹出 GitHub 登录窗口（Git Credential Manager），登录后点 **Authorize**，以后不用再登录。

也可以直接双击 `发布到GitHub.ps1`，按提示粘贴仓库地址，脚本会自动提交并推送。

如果提示 `remote origin already exists`，改用：

```powershell
git remote set-url origin https://github.com/S0lux113/S0lux113.github.io.git
```

---

## 更新博客：最重要的一步

在网页里写完文章后：

1. 打开「设置 → 导出发布文件」，得到 `posts.js`。
2. 用它替换 `个人博客\assets\js\posts.js`。
3. 提交并推送：

```powershell
cd D:\DSH\GAME\ZAXIANG\个人博客
git add .
git commit -m "更新文章"
git push
```

或者双击 `发布到GitHub.ps1`。

4. 等 1 分钟，刷新线上网址。

> **为什么不能自动同步？** 博客是纯静态的，没有服务器。写作台把内容存在浏览器的 `localStorage` 里，只有 GitHub 上的 `posts.js` 才是所有访客都能读到的公开数据。

---

## 两个网址的区别

| 仓库名 | 网址 | 说明 |
| --- | --- | --- |
| `S0lux113.github.io` | <https://s0lux113.github.io/> | 用户站，短网址，一个账号只能有一个 |
| `blog` | <https://s0lux113.github.io/blog/> | 项目站，可以有很多个 |

---

## 概念小课

- **Git**：本地版本管理工具。每次 `commit` 给当前文件拍一张快照，可以随时回退。
- **GitHub**：存放 Git 仓库的网站（远程仓库），也是社交与协作平台。
- **repository（仓库）**：一个项目文件夹 + 全部历史提交。
- **branch（分支）**：平行的版本线，`main` 是默认主线。
- **remote（远程）**：本地仓库关联的线上地址，习惯命名为 `origin`。
- **push**：把本地提交上传到 GitHub。
- **GitHub Pages**：GitHub 提供的静态网站托管。读取仓库文件、通过 CDN 发布、自动 HTTPS，免费。
- **静态网站**：只有 HTML/CSS/JS，没有后端。所有访客看到同一份文件，但 `localStorage` 是各人各的。
- **相对路径**：`assets/css/blog.css` 这种写法，让网站在 `/blog/` 子路径下也能正常加载样式。

---

## 自定义域名（可选）

1. 购买一个域名（阿里云 / 腾讯云 / Cloudflare 等）。
2. 在 DNS 添加一条 CNAME 记录：`www` → `s0lux113.github.io`。
3. 仓库 **Settings → Pages → Custom domain** 填入域名，保存。
4. 等证书签发后勾选 **Enforce HTTPS**。

---

## 常见问题

**Q：push 一直卡着 / 提示登录？**
A：第一次需要授权。Git Credential Manager 会打开浏览器，登录 GitHub 后点 Authorize。如果没弹窗，执行 `git config --global credential.helper manager` 再试。

**Q：Pages 显示 404？**
A：确认 Settings → Pages 已开启、分支是 main、目录是 `/(root)`；确认根目录有 `index.html`；刚开启要等 1–2 分钟。

**Q：样式丢了，只剩文字？**
A：`assets` 目录没有按原结构上传。检查 `assets/css/blog.css` 是否存在。

**Q：改了文章，线上没变化？**
A：先确认「导出发布文件」并替换了 `posts.js`；再强制刷新（Ctrl+F5）；最后看仓库 Pages 是否构建完成。

**Q：私有仓库能开 Pages 吗？**
A：需要 GitHub Pro；公开仓库免费。博客内容本身就是公开的，公开仓库更简单。

**Q：别人会改我的文章吗？**
A：不会。访客只能看；写作台写的内容只存在他自己的浏览器，不会影响你的网站。只有拥有仓库权限的人 push 才会改公开内容。

**Q：邮箱 / 微信公开了，能去掉吗？**
A：能。在设置里删掉对应内容 → 导出 posts.js → 替换 → 推送。注意 Git 历史里仍能查到旧版本。

**Q：国内访问慢或打不开？**
A：GitHub Pages 在国内可能不稳定，可以换 Cloudflare Pages / Vercel，步骤类似：连接仓库、构建命令留空、输出目录选根目录。

---

## 一句话总结

> **本地写作 → 导出 posts.js → 覆盖 → push → GitHub Pages 自动发布。**
> 这四步，就是你以后更新博客的全部流程。
