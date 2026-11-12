# 部署说明：把 DDL斩 放到服务器上

写给负责部署的人（GPT 或者项目负责人自己）。照着从上往下做，每一步后面都写了「怎么确认做对了」。

## 0. 先弄清楚要部署什么

| 东西 | 在仓库哪里 | 部署后在哪 |
|---|---|---|
| 后端（Node + PostgreSQL） | `feat/backend` 分支的 `server/` | `https://ninebug.xyz/v1/...` |
| 产品网站（纯静态页面） | `feat/app-online` 分支的 `site/` | `https://ninebug.xyz` |
| 发验证码、邮件提醒 | Resend | 发件人 `DDL斩 <noreply@mail.ninebug.xyz>` |

一台服务器。主域名 `ninebug.xyz` 放产品网站和后端（`www.ninebug.xyz` 自动跳到主域名），副域名 `mail.ninebug.xyz` 只用来发信，不指向服务器。Caddy 负责 https 证书（自动申请、自动续期），按路径分流：`/v1/*` 转给后端的 8787 端口，其余的当静态网站。

> 现在后端和 app 还在两个分支上，没合进 main。下面先按两个分支部署；合进 main 以后，把两处 `git clone -b ...` 换成同一个 main 就行（见第 11 节）。

**服务器要求**：Ubuntu 24.04（Debian 12 也行），1 核 1G 够用，能用 root 或带 sudo 的账号 SSH 登录。

### 不要做的事

- **任何密钥都不进仓库、不发在聊天里**：Resend 的 API Key、数据库密码、后端的 `SECRET`，只写在服务器上的 `/opt/ddl-killer/backend/server/.env`。
- 不要给数据库开公网端口，PostgreSQL 只监听本机。
- 后端不要用 root 跑。

---

## 1. DNS 和 Resend（在买域名的网站、Resend 后台操作）

在 `ninebug.xyz` 的 DNS 设置里加：

| 主机记录 | 类型 | 值 | 用途 |
|---|---|---|---|
| `@` | A | 服务器的 IP | 主域名：网站和后端 |
| `www` | A | 服务器的 IP | 打 `www.` 的人也能进来，会跳到主域名 |
| （Resend 给的几条） | MX / TXT | 照抄 Resend 后台显示的 | 让 Resend 能用 `mail.ninebug.xyz` 发信（SPF、DKIM） |
| `_dmarc.mail` | TXT | `v=DMARC1; p=none;` | 防别人冒充这个域名发信，也能提高进收件箱的概率 |

`@` 就是主域名本身。如果 DNS 里原来已经有 `@` 或 `www` 的记录（比如域名商默认的停放页），先删掉再加。Resend 的记录都挂在 `mail` 下面，和主域名互不影响；主域名以后要是想收邮件，也不会和发信冲突。

Resend 里：

1. Domains → Add Domain → `mail.ninebug.xyz`（能选地区就选东京）
2. 把它列出的记录加到 DNS 里，回来点 Verify，等到显示 Verified
3. API Keys → 新建，权限 **Sending access**，域名限定 `mail.ninebug.xyz`。生成的 Key 自己保存好，第 5 步要用

**确认**：在自己电脑上运行 `nslookup ninebug.xyz` 和 `nslookup www.ninebug.xyz`，返回的都是服务器 IP（新加的记录有时要等几分钟到半小时才生效）。

---

## 2. 服务器基础设置

SSH 登录服务器后：

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl ufw unattended-upgrades

# 防火墙：只开 SSH、http、https
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force enable

# 专门跑后端的账号，不用 root
sudo useradd --system --create-home --shell /usr/sbin/nologin ddl
```

建议 SSH 只允许密钥登录（`/etc/ssh/sshd_config` 里 `PasswordAuthentication no`，然后 `sudo systemctl restart ssh`）。改之前先确认密钥能登上，免得把自己关在外面。

**确认**：`sudo ufw status` 显示 22、80、443 是 ALLOW。

---

## 3. 装 Node 24、PostgreSQL、Caddy

```bash
# Node 24（后端直接跑 .ts 文件，需要 Node 22.18 以上）
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs

# PostgreSQL（Ubuntu 自带的版本就行）
sudo apt install -y postgresql

# Caddy（官方源）
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

**确认**：`node -v` 是 v24 开头；`systemctl is-active postgresql caddy` 两行都是 active。

---

## 4. 建数据库

```bash
# 生成一个随机密码，记下来，第 5 步要写进 .env
openssl rand -hex 24

sudo -u postgres psql -c "create user ddl with password '这里换成刚才的随机密码';"
sudo -u postgres psql -c "create database ddl owner ddl;"
```

表不用手动建：后端每次启动会自动跑 `server/migrations/` 里还没跑过的文件。

**确认**：`sudo -u postgres psql -c "\l"` 能看到 `ddl` 这个库。

---

## 5. 放代码、写配置

```bash
sudo mkdir -p /opt/ddl-killer && sudo chown ddl:ddl /opt/ddl-killer
# 后端
sudo -u ddl git clone -b feat/backend https://github.com/ANineBug/ddl-killer.git /opt/ddl-killer/backend
# 网站（只需要里面的 site/ 文件夹）
sudo -u ddl git clone -b feat/app-online --depth 1 https://github.com/ANineBug/ddl-killer.git /opt/ddl-killer/web

cd /opt/ddl-killer/backend/server
sudo -u ddl npm ci --omit=dev
```

写配置文件 `/opt/ddl-killer/backend/server/.env`：

```bash
sudo -u ddl tee /opt/ddl-killer/backend/server/.env > /dev/null <<'EOF'
NODE_ENV=production
PORT=8787
DATABASE_URL=postgres://ddl:第4步的数据库密码@localhost:5432/ddl
SECRET=运行 openssl rand -hex 32 生成一串填这里
RESEND_API_KEY=re_开头的那串，第1步在 Resend 生成的
MAIL_FROM="DDL斩 <noreply@mail.ninebug.xyz>"
EOF
sudo chmod 600 /opt/ddl-killer/backend/server/.env
```

- `SECRET` 用来给验证码做哈希，**生成一次以后不要改**，改了的话正在用的验证码会失效。
- 这四项缺一个，后端在正式环境下会直接拒绝启动并打印缺了什么。

---

## 6. 让后端开机自启

新建 `/etc/systemd/system/ddl-killer.service`：

```ini
[Unit]
Description=DDL斩 后端
After=network.target postgresql.service
Requires=postgresql.service

[Service]
User=ddl
WorkingDirectory=/opt/ddl-killer/backend/server
EnvironmentFile=/opt/ddl-killer/backend/server/.env
ExecStart=/usr/bin/node src/index.ts
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ddl-killer
```

**确认**：

```bash
systemctl status ddl-killer          # 显示 active (running)
curl http://127.0.0.1:8787/v1/health # 返回 {"ok":true}
journalctl -u ddl-killer -n 30       # 能看到「后端已启动」
```

---

## 7. Caddy：https 和分流

把 `/etc/caddy/Caddyfile` 整个换成：

```caddy
ninebug.xyz {
	encode zstd gzip

	# app 用的接口
	handle /v1/* {
		reverse_proxy 127.0.0.1:8787
	}

	# 产品网站
	handle {
		root * /opt/ddl-killer/web/site
		file_server
	}

	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
	}
}

# 打 www 的统一跳回主域名
www.ninebug.xyz {
	redir https://ninebug.xyz{uri} permanent
}
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy 会自动向 Let's Encrypt 申请证书，第一次可能要等几十秒。它还会把同学的真实 IP 写进 `X-Forwarded-For` 转给后端，后端靠这个限制发验证码的频率。

**确认**：

- 浏览器打开 `https://ninebug.xyz`，看到产品网站，地址栏有锁
- `curl https://ninebug.xyz/v1/health` 返回 `{"ok":true}`
- 打开 `https://www.ninebug.xyz` 会跳到 `https://ninebug.xyz`
- 出问题时看 `journalctl -u caddy -n 50`（最常见的原因：DNS 还没生效，或者 80/443 端口没开）

---

## 8. 实测一遍

1. 用 QQ 邮箱、163 邮箱各发一次验证码（可以直接 `curl`）：

   ```bash
   curl -X POST https://ninebug.xyz/v1/auth/code -H 'content-type: application/json' -d '{"email":"你的QQ号@qq.com"}'
   ```

   看邮件多久到、有没有进垃圾箱。进了垃圾箱的话，先检查 Resend 后台里那几条 DNS 记录是不是都是绿的。
2. 设第一个管理员（用你自己的邮箱，先在 app 里登录一次，账号才会存在）：

   ```bash
   sudo -u postgres psql ddl -c "update users set is_admin = true where email = '你的邮箱（Gmail 要去掉点）';"
   ```

3. 按第 10 节打一个连这个后端的 APK，在手机上走一遍：登录 → 导入课表 → 上传 → 换个账号确认 → 聊天。

---

## 9. 备份数据库

每天凌晨 4 点备份一次，留 14 天：

```bash
sudo mkdir -p /var/backups/ddl && sudo chown postgres:postgres /var/backups/ddl
sudo tee /etc/cron.d/ddl-backup > /dev/null <<'EOF'
0 4 * * * postgres pg_dump -Fc ddl > /var/backups/ddl/ddl-$(date +\%F).dump && find /var/backups/ddl -name '*.dump' -mtime +14 -delete
EOF
```

恢复：`sudo -u postgres pg_restore -d ddl --clean /var/backups/ddl/某天.dump`。

服务器本身坏了的话，这些备份也会一起没。重要的时候，偶尔把最新的一份下载到自己电脑上。

---

## 10. 打一个连这个后端的 APK

1. GitHub 仓库 → Settings → Secrets and variables → Actions → **Variables**（不是 Secrets，因为这是公开地址）→ New repository variable：
   - Name：`EXPO_PUBLIC_API_URL`
   - Value：`https://ninebug.xyz`
2. Actions → 打包安卓 APK → Run workflow，分支选 `feat/app-online`
3. 打完在这次运行的页面底部下载 `ddl-killer-apk`

**还没做的**：现在的 APK 还是用模板自带的调试签名。正式发给同学之前要换成自己的签名密钥，放进 GitHub Secrets。否则以后换签名，所有人都得卸载重装，手机上的数据也会丢。这一步要改打包流程，单独做。

签名换好之后，推一个 `v` 开头的标签（比如 `v1.0.0`）会自动发 Release。网站上的下载按钮指向的是
`https://github.com/ANineBug/ddl-killer/releases/latest/download/ddl-killer.apk`，第一次发版后才能下载。

---

## 11. 以后更新

```bash
# 后端
cd /opt/ddl-killer/backend && sudo -u ddl git pull
cd server && sudo -u ddl npm ci --omit=dev
sudo systemctl restart ddl-killer   # 启动时会自动跑新的数据库迁移

# 网站
cd /opt/ddl-killer/web && sudo -u ddl git pull
```

分支合进 main 以后：

```bash
cd /opt/ddl-killer/backend && sudo -u ddl git fetch && sudo -u ddl git checkout main && sudo -u ddl git pull
cd /opt/ddl-killer/web && sudo -u ddl git fetch --depth 1 origin main && sudo -u ddl git checkout -B main FETCH_HEAD
```

常用的排查命令：

| 想看什么 | 命令 |
|---|---|
| 后端在不在跑 | `systemctl status ddl-killer` |
| 后端最近的日志 | `journalctl -u ddl-killer -f` |
| https、转发有没有问题 | `journalctl -u caddy -n 50` |
| 数据库里有多少人 | `sudo -u postgres psql ddl -c "select count(*) from users;"` |

---

## 12. 做完的检查单

- [ ] `ninebug.xyz` 和 `www.ninebug.xyz` 都解析到服务器 IP
- [ ] Resend 里 `mail.ninebug.xyz` 显示 Verified，`_dmarc.mail` 加了
- [ ] `systemctl status ddl-killer` 是 running，开机自启
- [ ] `https://ninebug.xyz` 打开是产品网站，有锁
- [ ] `https://ninebug.xyz/v1/health` 返回 `{"ok":true}`
- [ ] QQ、163 邮箱都收到了验证码（记下有没有进垃圾箱）
- [ ] `.env` 权限是 600，没有提交进仓库
- [ ] 每天的数据库备份已经设好
- [ ] GitHub 仓库变量 `EXPO_PUBLIC_API_URL` 已设，打出的 APK 在手机上能登录
