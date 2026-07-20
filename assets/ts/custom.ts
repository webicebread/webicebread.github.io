/*
 * 自定义前端脚本（Hugo 会自动编译加载，见主题 footer/components/script.html）
 * 1) Hero 打字机：随机诗词（一言·诗词 API，每次不同）↔ 签名
 * 2) 文章阅读进度条
 * 3) 滚动渐显
 * 4) Newsletter 订阅（POST 到 Listmonk 公共表单）
 * 5) 复制文章链接（文章底部分享按钮）
 * 6) 分享按钮：点击时用页面真实地址+标题重建链接（防参数丢失）
 * （留言板 Waline 已改为复用 Stack 内置评论 partial，不在此处加载）
 */

/* ---------- 1) Hero 打字机：每次调 API 取不同古诗词 ---------- */
(function heroTyper() {
    const el = document.getElementById("hero-typer");
    if (!el) return;

    const SIGNATURE = "二象无常，遇而无往";
    const FALLBACK = [
        "人生若只如初见",
        "春水碧于天，画船听雨眠",
        "此心安处是吾乡",
        "何当共剪西窗烛，却话巴山夜雨时",
        "众里寻他千百度，蓦然回首，那人却在灯火阑珊处",
        "山有木兮木有枝，心悦君兮君不知",
        "落霞与孤鹜齐飞，秋水共长天一色",
        "人生代代无穷已，江月年年望相似",
        "云想衣裳花想容，春风拂槛露华浓",
        "海上生明月，天涯共此时",
        "枕上诗书闲处好，门前风景雨来佳",
        "此情可待成追忆，只是当时已惘然",
    ];
    const randLine = () => FALLBACK[Math.floor(Math.random() * FALLBACK.length)];

    // 一言·诗词分类（c=i），支持 CORS、国内可达、每次返回不同诗句
    async function fetchPoem(): Promise<string> {
        try {
            const res = await fetch("https://v1.hitokoto.cn/?c=i&encode=json", { cache: "no-store" });
            const data = await res.json();
            const s = data && typeof data.hitokoto === "string" ? data.hitokoto.trim() : "";
            return s || randLine();
        } catch (e) {
            return randLine();
        }
    }

    const TYPE = 120, ERASE = 55, HOLD = 2200, GAP = 600;

    function typeText(text: string): Promise<void> {
        return new Promise((resolve) => {
            let i = 0;
            (function step() {
                el.textContent = text.slice(0, ++i);
                if (i < text.length) setTimeout(step, TYPE);
                else setTimeout(resolve, HOLD);
            })();
        });
    }
    function eraseText(): Promise<void> {
        return new Promise((resolve) => {
            let i = (el.textContent || "").length;
            const full = el.textContent || "";
            (function step() {
                i -= 1;
                el.textContent = full.slice(0, i < 0 ? 0 : i);
                if (i > 0) setTimeout(step, ERASE);
                else setTimeout(resolve, GAP);
            })();
        });
    }

    (async function loop() {
        // 无限循环：每轮取一句新诗词 → 打字 → 删除 → 签名 → 删除
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const poem = await fetchPoem();
            await typeText(poem);
            await eraseText();
            await typeText(SIGNATURE);
            await eraseText();
        }
    })();
})();

/* ---------- 2) 文章阅读进度条 ---------- */
(function readingProgress() {
    if (!document.querySelector(".article-content")) return;
    const bar = document.createElement("div");
    bar.className = "reading-progress";
    document.body.appendChild(bar);
    function update() {
        const h = document.documentElement;
        const max = h.scrollHeight - h.clientHeight;
        bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + "%";
    }
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
})();

/* ---------- 3) 滚动渐显 ---------- */
(function scrollReveal() {
    const els = Array.from(document.querySelectorAll(".reveal"));
    if (!els.length) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        els.forEach((e) => e.classList.add("revealed"));
        return;
    }
    const io = new IntersectionObserver(
        (entries) => {
            entries.forEach((en) => {
                if (en.isIntersecting) {
                    en.target.classList.add("revealed");
                    io.unobserve(en.target);
                }
            });
        },
        { threshold: 0.12 }
    );
    els.forEach((e) => io.observe(e));
})();

/* ---------- 4) Newsletter 订阅（POST 到 Listmonk 公共表单，双重确认由后端处理） ---------- */
(function newsletter() {
    const form = document.querySelector<HTMLFormElement>(".newsletter-form");
    if (!form) return;
    const server = (form.dataset.server || "").replace(/\/+$/, "");
    const list = form.dataset.list || "";
    if (!server || !list) return;

    const input = form.querySelector<HTMLInputElement>('input[name="email"]');
    const hp = form.querySelector<HTMLInputElement>('input[name="hp_name"]');
    const btn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const msg = form.querySelector<HTMLElement>(".newsletter-msg");
    if (!input || !btn || !msg) return;

    const setMsg = (text: string, ok: boolean) => {
        msg.textContent = text;
        msg.classList.remove("is-ok", "is-err");
        msg.classList.add(ok ? "is-ok" : "is-err");
    };

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (hp && hp.value) return; // 蜜罐命中：静默丢弃
        const email = (input.value || "").trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
            setMsg("邮箱格式好像不太对，再检查一下？", false);
            return;
        }
        const prev = btn.textContent;
        btn.disabled = true;
        btn.textContent = "提交中…";
        try {
            const body = new URLSearchParams();
            body.set("email", email);
            body.append("l", list); // Listmonk 列表 UUID
            const res = await fetch(server + "/subscription/form", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: body.toString(),
            });
            if (res.ok) {
                setMsg("订阅成功，谢谢你 ✨ 以后有更新会寄到你的信箱", true);
                form.reset();
            } else {
                setMsg("提交失败了，稍后再试一次 🥲", false);
            }
        } catch (err) {
            setMsg("网络出了点问题，稍后再试一次 🥲", false);
        } finally {
            btn.disabled = false;
            btn.textContent = prev;
        }
    });
})();

/* ---------- 5) 复制文章链接（分享按钮里的「复制链接」） ---------- */
(function copyLink() {
    const btns = Array.from(document.querySelectorAll<HTMLButtonElement>(".share-btn--copy"));
    if (!btns.length) return;
    btns.forEach((btn) => {
        const original = btn.textContent || "复制链接";
        let timer = 0;
        btn.addEventListener("click", async () => {
            const url = btn.dataset.shareUrl || location.href;
            let ok = false;
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(url);
                    ok = true;
                } else {
                    const ta = document.createElement("textarea");
                    ta.value = url;
                    ta.style.position = "fixed";
                    ta.style.opacity = "0";
                    document.body.appendChild(ta);
                    ta.select();
                    ok = document.execCommand("copy");
                    document.body.removeChild(ta);
                }
            } catch (e) {
                ok = false;
            }
            btn.textContent = ok ? "已复制 ✓" : "复制失败，手动复制吧";
            btn.classList.toggle("is-copied", ok);
            window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                btn.textContent = original;
                btn.classList.remove("is-copied");
            }, 1800);
        });
    });
})();

/* ---------- 6) 分享按钮：点击时用页面真实地址 + 标题重建链接 ----------
 * 不依赖服务端 querify 渲染，确保 url / title 一定带到 X / 微博 / Telegram。 */
(function shareLinks() {
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(".share-btn[data-share]"));
    if (!links.length) return;
    const build: Record<string, (u: string, t: string) => string> = {
        weibo: (u, t) =>
            "https://service.weibo.com/share/share.php?url=" +
            encodeURIComponent(u) + "&title=" + encodeURIComponent(t),
        x: (u, t) =>
            "https://twitter.com/intent/tweet?text=" +
            encodeURIComponent(t) + "&url=" + encodeURIComponent(u),
        telegram: (u, t) =>
            "https://t.me/share/url?url=" +
            encodeURIComponent(u) + "&text=" + encodeURIComponent(t),
    };
    links.forEach((a) => {
        a.addEventListener("click", () => {
            const kind = a.dataset.share || "";
            const make = build[kind];
            if (!make) return;
            const url = (a.dataset.shareUrl || "").trim() || location.href;
            const title = (a.dataset.shareTitle || "").trim() || document.title;
            // 在默认跳转发生前改写 href，浏览器会用新值在 _blank 打开
            a.href = make(url, title);
        });
    });
})();

/* ---------- 7) 生成分享卡片：Canvas 画 封面 + 标题 + 摘要 + 二维码 ----------
 * 纯前端：二维码库点击时才从 jsDelivr 懒加载；封面是本站同源图，Canvas 不会被污染。
 * 卡片固定用浅色樱粉视觉（导出的图片不跟随暗色模式）。 */
(function shareCard() {
    const btn = document.querySelector<HTMLButtonElement>(".share-btn--cardgen");
    if (!btn) return;

    const QR_SRC = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js";
    const ensureQr = (): Promise<any> =>
        (window as any).qrcode
            ? Promise.resolve((window as any).qrcode)
            : new Promise((res, rej) => {
                  const s = document.createElement("script");
                  s.src = QR_SRC;
                  s.onload = () => res((window as any).qrcode);
                  s.onerror = () => rej(new Error("二维码库加载失败"));
                  document.head.appendChild(s);
              });

    const loadImg = (src: string): Promise<HTMLImageElement | null> =>
        new Promise((res) => {
            if (!src) return res(null);
            const im = new Image();
            im.crossOrigin = "anonymous"; // 防画布污染（GitHub Pages 资源带 CORS 头）
            im.onload = () => res(im);
            im.onerror = () => res(null);
            im.src = src;
        });

    // 中英混排按字符贪心断行；超出 maxLines 时末行加省略号
    const wrap = (ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] => {
        const lines: string[] = [];
        let line = "";
        for (const ch of Array.from(text.trim())) {
            if (line && ctx.measureText(line + ch).width > width) {
                lines.push(line);
                line = "";
            }
            line += ch;
        }
        if (line) lines.push(line);
        if (lines.length > maxLines) {
            const kept = lines.slice(0, maxLines);
            kept[maxLines - 1] = kept[maxLines - 1].slice(0, -1) + "…";
            return kept;
        }
        return lines;
    };

    async function draw(): Promise<HTMLCanvasElement> {
        const d = btn!.dataset;
        const url = d.cardUrl || location.href;
        const title = d.cardTitle || document.title;
        const desc = d.cardDesc || "";
        const site = d.cardSite || "";
        const qrlib = await ensureQr();
        try { await (document as any).fonts?.ready; } catch (e) { /* 字体没就绪就用兜底衬线 */ }
        const [cover, avatar] = await Promise.all([
            loadImg(d.cardCover || ""),
            loadImg(d.cardAvatar || ""),
        ]);

        const S = 2, W = 750, P = 48, TW = W - P * 2;
        const serif = '"Noto Serif SC","Source Serif 4",serif';
        const c = document.createElement("canvas");
        let g = c.getContext("2d")!;

        // 先量行数定总高，再真正开画（设置 width/height 会清空画布状态）
        g.font = "600 40px " + serif;
        const titleLines = wrap(g, title, TW, 3);
        g.font = "26px " + serif;
        const descLines = desc ? wrap(g, desc, TW, 3) : [];
        const coverH = cover ? 420 : 0;
        const footH = 200;
        const H = 8 + coverH + 44 + titleLines.length * 58
            + (descLines.length ? 18 + descLines.length * 44 : 0) + 30 + footH;

        c.width = W * S;
        c.height = H * S;
        g = c.getContext("2d")!;
        g.scale(S, S);
        g.textBaseline = "top";

        // 底色 + 顶部樱粉→珊瑚渐变条（呼应「咲夜」浅色主题）
        g.fillStyle = "#fffdfc";
        g.fillRect(0, 0, W, H);
        const grad = g.createLinearGradient(0, 0, W, 0);
        grad.addColorStop(0, "#f6a8c0");
        grad.addColorStop(1, "#f2907a");
        g.fillStyle = grad;
        g.fillRect(0, 0, W, 8);

        let y = 8;
        if (cover) {
            const sc = Math.max(W / cover.width, coverH / cover.height);
            const sw = W / sc, sh = coverH / sc;
            g.drawImage(cover, (cover.width - sw) / 2, (cover.height - sh) / 2, sw, sh, 0, y, W, coverH);
            y += coverH;
        }

        y += 44;
        g.fillStyle = "#3d3134";
        g.font = "600 40px " + serif;
        for (const ln of titleLines) { g.fillText(ln, P, y); y += 58; }

        if (descLines.length) {
            y += 18;
            g.fillStyle = "#8d7f84";
            g.font = "26px " + serif;
            for (const ln of descLines) { g.fillText(ln, P, y); y += 44; }
        }

        y += 30;
        g.strokeStyle = "rgba(0,0,0,.08)";
        g.beginPath();
        g.moveTo(P, y);
        g.lineTo(W - P, y);
        g.stroke();

        // 页脚：左侧站名 + 域名 + 提示，右侧二维码（白底细边）
        const qrSize = 132, qrPad = 10, qrBox = qrSize + qrPad * 2;
        const qrX = W - P - qrBox, qrY = y + (footH - qrBox) / 2;
        g.fillStyle = "#fff";
        g.fillRect(qrX, qrY, qrBox, qrBox);
        g.strokeStyle = "rgba(0,0,0,.08)";
        g.strokeRect(qrX + 0.5, qrY + 0.5, qrBox - 1, qrBox - 1);
        const qr = qrlib(0, "M");
        qr.addData(url);
        qr.make();
        const n = qr.getModuleCount(), cell = qrSize / n;
        g.fillStyle = "#4a3b40";
        for (let r = 0; r < n; r++)
            for (let col = 0; col < n; col++)
                if (qr.isDark(r, col))
                    g.fillRect(qrX + qrPad + col * cell, qrY + qrPad + r * cell, Math.ceil(cell), Math.ceil(cell));

        const cy = qrY + qrBox / 2;
        // 圆形头像 + 樱粉描边（加载失败就不画，文字回到左端）
        let textX = P;
        if (avatar) {
            const AV = 84, ax = P, ay = cy - AV / 2;
            g.save();
            g.beginPath();
            g.arc(ax + AV / 2, ay + AV / 2, AV / 2, 0, Math.PI * 2);
            g.closePath();
            g.clip();
            g.drawImage(avatar, ax, ay, AV, AV);
            g.restore();
            g.beginPath();
            g.arc(ax + AV / 2, ay + AV / 2, AV / 2 + 1, 0, Math.PI * 2);
            g.strokeStyle = "#f3b7c9";
            g.lineWidth = 3;
            g.stroke();
            g.lineWidth = 1;
            textX = P + AV + 22;
        }
        g.fillStyle = "#c95c7d";
        g.font = "600 30px " + serif;
        g.fillText(site, textX, cy - 44);
        g.fillStyle = "#a99ba0";
        g.font = "22px " + serif;
        g.fillText(url.replace(/^https?:\/\//, "").replace(/\/$/, ""), textX, cy + 2);
        g.fillText("扫码阅读全文", textX, cy + 34);
        return c;
    }

    function showModal(canvas: HTMLCanvasElement) {
        const overlay = document.createElement("div");
        overlay.className = "share-card-modal";
        const box = document.createElement("div");
        box.className = "share-card-modal__box";
        const img = new Image();
        img.src = canvas.toDataURL("image/png");
        img.alt = "分享卡片";
        const hint = document.createElement("p");
        hint.className = "share-card-modal__hint";
        hint.textContent = "手机长按图片保存，电脑点下载";
        const actions = document.createElement("div");
        actions.className = "share-card-modal__actions";
        const dl = document.createElement("a");
        dl.className = "share-btn";
        dl.textContent = "下载图片";
        dl.href = img.src;
        dl.download = (location.pathname.split("/").filter(Boolean).pop() || "post") + "-card.png";
        const close = document.createElement("button");
        close.type = "button";
        close.className = "share-btn";
        close.textContent = "关闭";
        actions.append(dl, close);
        box.append(img, hint, actions);
        overlay.append(box);
        document.body.appendChild(overlay);
        const off = () => overlay.remove();
        close.addEventListener("click", off);
        overlay.addEventListener("click", (e) => { if (e.target === overlay) off(); });
        document.addEventListener("keydown", function esc(e) {
            if (e.key === "Escape") { off(); document.removeEventListener("keydown", esc); }
        });
    }

    let busy = false;
    btn.addEventListener("click", async () => {
        if (busy) return;
        busy = true;
        const orig = btn.textContent;
        btn.textContent = "生成中…";
        try {
            showModal(await draw());
            btn.textContent = orig;
        } catch (e) {
            btn.textContent = "生成失败，再试一次？";
            window.setTimeout(() => (btn.textContent = orig), 1800);
        }
        busy = false;
    });
})();
