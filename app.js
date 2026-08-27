/* ============================================================
 * 宝子官宣 · 大特效视频生成器（增强版）
 * - 12 种大特效（含烈焰/时空隧道/礼花/皇冠/极光/雷霆）
 * - 网友名单：底部滚动 + 漂浮气泡
 * - 声音：内置合成庆祝音效，或可上传背景音乐，真正录进视频
 * 纯前端：头像经 FileReader 转 dataURL，不污染画布、不上传服务器
 * ============================================================ */
(function () {
  "use strict";

  const FPS = 30;
  const DURATION = 8;
  const SIZES = {
    portrait: { w: 1080, h: 1350 },
    square:   { w: 1080, h: 1080 },
    story:    { w: 1080, h: 1920 },
  };

  const state = {
    avatar: null,
    effect: "fireworks",
    mainText: "感谢宝子官宣我们群",
    caption: "✦ 全群沸腾 · 撒花庆祝 ✦",
    names: [],
    size: "portrait",
    soundOn: true,
    bgmBuffer: null,
    playing: false,
    recording: false,
    seed: Math.floor(Math.random() * 1e9),
  };

  let scene = null;
  let rafId = null;

  const $ = (id) => document.getElementById(id);
  const canvas = $("canvas");
  const ctx = canvas.getContext("2d");
  const fileInput = $("fileInput");
  const dropzone = $("dropzone");
  const avatarPreview = $("avatarPreview");
  const dzHint = $("dzHint");
  const clearAvatar = $("clearAvatar");
  const effectGrid = $("effectGrid");
  const mainTextInput = $("mainText");
  const captionInput = $("captionText");
  const namesText = $("namesText");
  const soundToggle = $("soundToggle");
  const bgmInput = $("bgmInput");
  const playBtn = $("playBtn");
  const stopBtn = $("stopBtn");
  const genBtn = $("genBtn");
  const statusEl = $("status");
  const resultWrap = $("resultWrap");
  const resultVideo = $("resultVideo");
  const downloadLink = $("downloadLink");

  // ---------- 工具 ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function roundRectPath(c, x, y, w, h, r) {
    if (c.roundRect) { c.beginPath(); c.roundRect(x, y, w, h, r); return; }
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawImageCover(c, img, dx, dy, dw, dh) {
    const ir = img.width / img.height, dr = dw / dh;
    let sx, sy, sw, sh;
    if (ir > dr) { sh = img.height; sw = sh * dr; sx = (img.width - sw) / 2; sy = 0; }
    else { sw = img.width; sh = sw / dr; sx = 0; sy = (img.height - sh) / 2; }
    c.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  function avatarLayout(w, h) {
    const r = Math.min(w, h) * (w >= h ? 0.18 : 0.22);
    return { cx: w / 2, cy: h * 0.40, r };
  }

  function drawAvatar(c, w, h, t, opts) {
    opts = opts || {};
    const { cx, cy, r } = avatarLayout(w, h);
    const img = state.avatar;
    const appear = opts.appear != null ? opts.appear : 1;
    c.save();
    c.globalAlpha = appear;
    if (opts.glow) {
      const g = c.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * (1.6 + (opts.pulse || 0)));
      g.addColorStop(0, opts.glow); g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g; c.beginPath(); c.arc(cx, cy, r * 1.8, 0, Math.PI * 2); c.fill();
    }
    c.save();
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.clip();
    if (img) drawImageCover(c, img, cx - r, cy - r, r * 2, r * 2);
    else { c.fillStyle = "rgba(255,255,255,.15)"; c.fillRect(cx - r, cy - r, r * 2, r * 2); }
    c.restore();
    if (opts.ring) {
      c.lineWidth = Math.max(3, r * 0.05);
      c.strokeStyle = opts.ring; c.shadowColor = opts.ring; c.shadowBlur = 24;
      c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke(); c.shadowBlur = 0;
    }
    c.restore();
    return { cx, cy, r };
  }

  function drawMessage(c, w, h, t, opts) {
    opts = opts || {};
    const revealStart = opts.revealStart != null ? opts.revealStart : 3.0;
    const revealDur = opts.revealDur != null ? opts.revealDur : 1.2;
    const p = easeOut((t - revealStart) / revealDur);
    if (p <= 0) return;
    const main = state.mainText || "";
    const cap = state.caption || "";
    const { cy, r } = avatarLayout(w, h);
    const baseY = cy + r + Math.min(w, h) * 0.14;
    const scale = lerp(0.82, 1, p);

    c.save();
    c.globalAlpha = p;
    c.textAlign = "center"; c.textBaseline = "middle";

    let fs = Math.min(w * 0.105, 104);
    if (main) {
      c.font = `900 ${fs}px "PingFang SC","Microsoft YaHei",sans-serif`;
      while (c.measureText(main).width > w * 0.88 && fs > 22) {
        fs -= 2; c.font = `900 ${fs}px "PingFang SC","Microsoft YaHei",sans-serif`;
      }
      const y = baseY;
      c.save();
      c.translate(w / 2, y); c.scale(scale, scale); c.translate(-w / 2, -y);
      const grad = c.createLinearGradient(w * 0.1, 0, w * 0.9, 0);
      grad.addColorStop(0, opts.c1 || "#ffd86b");
      grad.addColorStop(0.5, opts.c2 || "#ff8a3c");
      grad.addColorStop(1, opts.c3 || "#ff5e8a");
      c.fillStyle = grad;
      c.shadowColor = opts.glow || "rgba(255,150,60,.9)"; c.shadowBlur = 26;
      const fullW = c.measureText(main).width;
      const startX = w / 2 - fullW / 2;
      c.fillText(main, w / 2, y);
      const hi = "宝子";
      const idx = main.indexOf(hi);
      if (idx >= 0) {
        const hx = startX + c.measureText(main.substring(0, idx)).width;
        c.shadowColor = "rgba(255,255,255,.95)"; c.shadowBlur = 18;
        c.fillStyle = "#ffffff";
        c.fillText(hi, hx + c.measureText(hi).width / 2, y);
      }
      c.restore();
    }

    if (cap) {
      let fs2 = Math.min(w * 0.05, 40);
      c.font = `700 ${fs2}px "PingFang SC","Microsoft YaHei",sans-serif`;
      while (c.measureText(cap).width > w * 0.9 && fs2 > 16) {
        fs2 -= 1; c.font = `700 ${fs2}px "PingFang SC","Microsoft YaHei",sans-serif`;
      }
      c.fillStyle = opts.capColor || "rgba(255,255,255,.92)";
      c.shadowColor = "rgba(0,0,0,.5)"; c.shadowBlur = 8;
      c.fillText(cap, w / 2, baseY + fs * 1.05 + fs2 * 0.7);
    }
    c.restore();
  }

  function bgRadial(c, w, h, inner, outer) {
    const g = c.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, Math.max(w, h) * 0.8);
    g.addColorStop(0, inner); g.addColorStop(1, outer);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }

  function drawStar(c, x, y, spikes, outer, inner) {
    let rot = -Math.PI / 2; const step = Math.PI / spikes;
    c.beginPath(); c.moveTo(x + Math.cos(rot) * outer, y + Math.sin(rot) * outer);
    for (let i = 0; i < spikes; i++) {
      rot += step; c.lineTo(x + Math.cos(rot) * inner, y + Math.sin(rot) * inner);
      rot += step; c.lineTo(x + Math.cos(rot) * outer, y + Math.sin(rot) * outer);
    }
    c.closePath(); c.fill();
  }
  function drawHeart(c, x, y, s) {
    c.beginPath();
    c.moveTo(x, y + s * 0.3);
    c.bezierCurveTo(x, y, x - s, y - s * 0.4, x - s, y + s * 0.1);
    c.bezierCurveTo(x - s, y + s * 0.6, x, y + s * 0.9, x, y + s * 1.1);
    c.bezierCurveTo(x, y + s * 0.9, x + s, y + s * 0.6, x + s, y + s * 0.1);
    c.bezierCurveTo(x + s, y - s * 0.4, x, y, x, y + s * 0.3);
    c.closePath(); c.fill();
  }
  function drawCrown(c, x, y, size, t) {
    const w = size, hgt = size * 0.7;
    c.save();
    c.translate(x, y + Math.sin(t * 2) * size * 0.04);
    c.rotate(Math.sin(t * 1.5) * 0.06);
    const g = c.createLinearGradient(0, -hgt / 2, 0, hgt / 2);
    g.addColorStop(0, "#fff3c4"); g.addColorStop(0.5, "#ffd24d"); g.addColorStop(1, "#ff9a3c");
    c.fillStyle = g; c.shadowColor = "#ffcf5a"; c.shadowBlur = 30;
    // 冠体（梯形）+ 三尖
    c.beginPath();
    c.moveTo(-w / 2, hgt / 2);
    c.lineTo(-w / 2, -hgt * 0.1);
    c.lineTo(-w / 4, -hgt / 2);
    c.lineTo(0, -hgt * 0.15);
    c.lineTo(w / 4, -hgt / 2);
    c.lineTo(w / 2, -hgt * 0.1);
    c.lineTo(w / 2, hgt / 2);
    c.closePath(); c.fill();
    c.shadowBlur = 0;
    // 宝石
    const jewels = [["#ff5e8a", -w / 4], ["#5ad1ff", 0], ["#7cff8a", w / 4]];
    for (const [col, jx] of jewels) {
      c.fillStyle = col; c.beginPath(); c.arc(jx, -hgt * 0.05, size * 0.06, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }

  // ---------- 网友名单覆盖层 ----------
  function drawNames(c, w, h, t) {
    const names = state.names;
    if (!names.length) return;
    // 底部滚动名单
    const joined = "✦ " + names.join("   ·   ") + "   ·   ";
    let fs = Math.min(w * 0.045, 34);
    c.font = `700 ${fs}px "PingFang SC","Microsoft YaHei",sans-serif`;
    const totalW = c.measureText(joined).width;
    if (totalW > 0) {
      const speed = totalW / 14;
      const y = h - fs * 0.7;
      const scroll = (t * speed) % totalW;
      c.save();
      c.globalAlpha = 0.92; c.fillStyle = "rgba(255,255,255,.95)";
      c.shadowColor = "rgba(0,0,0,.6)"; c.shadowBlur = 6;
      c.textAlign = "left"; c.textBaseline = "middle";
      c.fillText(joined, -scroll, y);
      c.fillText(joined, -scroll + totalW, y);
      c.restore();
    }
    // 漂浮名字气泡
    const chipFs = Math.min(w * 0.04, 30);
    const period = 2.2;
    for (let i = 0; i < names.length; i++) {
      const life = ((t / period) + i / names.length) % 1;
      if (life > 0.92) continue;
      const a = Math.sin(life * Math.PI);
      const x = w * (0.15 + 0.7 * ((i * 0.37) % 1)) + Math.sin(t * 1.5 + i) * 22;
      const yc = lerp(h * 0.95, h * 0.56, life);
      const name = names[i];
      c.save();
      c.globalAlpha = a * 0.95;
      c.font = `700 ${chipFs}px "PingFang SC","Microsoft YaHei",sans-serif`;
      const tw = c.measureText(name).width;
      const padX = 14, chipW = tw + padX * 2, chipH = Math.min(w * 0.075, 48);
      const g = c.createLinearGradient(x - chipW / 2, 0, x + chipW / 2, 0);
      g.addColorStop(0, "rgba(124,92,255,.92)"); g.addColorStop(1, "rgba(255,94,138,.92)");
      c.fillStyle = g; c.shadowColor = "rgba(124,92,255,.8)"; c.shadowBlur = 16;
      roundRectPath(c, x - chipW / 2, yc - chipH / 2, chipW, chipH, chipH / 2); c.fill();
      c.shadowBlur = 0; c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText(name, x, yc);
      c.restore();
    }
  }

  // ============================================================
  // 特效注册表（12 种）
  // ============================================================
  const effects = {
    fireworks: {
      render(c, t, w, h, s) {
        bgRadial(c, w, h, "#10183f", "#05060f");
        for (const fw of s.fws) {
          const burst = fw.launchT + 0.55;
          if (t < fw.launchT) continue;
          if (t < burst) {
            const rp = (t - fw.launchT) / 0.55;
            const y = lerp(h * 0.95, fw.y, easeOut(rp));
            c.save();
            c.strokeStyle = `hsla(${fw.hue},100%,75%,.9)`; c.lineWidth = 3;
            c.shadowBlur = 10; c.shadowColor = `hsl(${fw.hue},100%,70%)`;
            c.beginPath(); c.moveTo(fw.x, h * 0.96); c.lineTo(fw.x, y); c.stroke();
            c.fillStyle = "#fff"; c.beginPath(); c.arc(fw.x, y, 3.5, 0, Math.PI * 2); c.fill();
            c.restore();
          } else {
            const age = t - burst; if (age > 1.7) continue;
            const a = 1 - age / 1.7;
            c.save();
            for (const pt of fw.parts) {
              const d = pt.spd * age * 150;
              const px = fw.x + Math.cos(pt.ang) * d;
              const py = fw.y + Math.sin(pt.ang) * d + 60 * age * age;
              c.globalAlpha = a;
              c.fillStyle = `hsl(${fw.hue},100%,${60 + pt.l * 25}%)`;
              c.shadowBlur = 8; c.shadowColor = `hsl(${fw.hue},100%,70%)`;
              c.beginPath(); c.arc(px, py, 2.6, 0, Math.PI * 2); c.fill();
            }
            c.restore();
          }
        }
        drawAvatar(c, w, h, t, { glow: "rgba(255,170,80,.55)", ring: "rgba(255,210,120,.9)", pulse: 0.06 * Math.sin(t * 3) });
        drawMessage(c, w, h, t, { c1: "#fff2b0", c2: "#ff8a3c", c3: "#ff5e8a" });
      },
    },
    starlight: {
      render(c, t, w, h, s) {
        bgRadial(c, w, h, "#0b1442", "#03030f");
        c.save();
        for (const st of s.stars) {
          const a = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * st.tw + st.ph));
          c.globalAlpha = a; c.fillStyle = "#fff";
          c.beginPath(); c.arc(st.x * w, st.y * h, st.r, 0, Math.PI * 2); c.fill();
        }
        c.restore();
        const { cx, cy, r } = avatarLayout(w, h);
        c.save(); c.translate(cx, cy); c.rotate(t * 0.4);
        for (let i = 0; i < 14; i++) {
          const ang = (i / 14) * Math.PI * 2, rr = r * 1.55;
          c.fillStyle = i % 2 ? "#9ad8ff" : "#fff"; c.shadowBlur = 12; c.shadowColor = "#9ad8ff";
          drawStar(c, Math.cos(ang) * rr, Math.sin(ang) * rr, 5, r * 0.07, r * 0.03);
        }
        c.restore();
        for (const sh of s.shooting) {
          const life = (t - sh.t + 4) % 4;
          if (life < 0 || life > 0.6) continue;
          const lp = life / 0.6;
          const x = lerp(sh.x0, sh.x1, lp), y = lerp(sh.y0, sh.y1, lp);
          c.save(); c.globalAlpha = 1 - lp; c.strokeStyle = "#cfe8ff"; c.lineWidth = 2.5;
          c.shadowBlur = 12; c.shadowColor = "#cfe8ff";
          c.beginPath(); c.moveTo(x, y); c.lineTo(x - 40, y - 18); c.stroke(); c.restore();
        }
        drawAvatar(c, w, h, t, { glow: "rgba(120,180,255,.5)", ring: "rgba(170,210,255,.9)", pulse: 0.05 * Math.sin(t * 2.4) });
        drawMessage(c, w, h, t, { c1: "#dff0ff", c2: "#8ab6ff", c3: "#c79bff", capColor: "rgba(220,235,255,.9)" });
      },
    },
    neon: {
      render(c, t, w, h, s) {
        c.fillStyle = "#05050a"; c.fillRect(0, 0, w, h);
        const { cx, cy, r } = avatarLayout(w, h);
        const cols = ["#00f0ff", "#ff00e6", "#7cff5c"];
        for (let k = 0; k < 4; k++) {
          const rad = r * (1.25 + k * 0.18) + Math.sin(t * 2.2 + k) * r * 0.12;
          c.save();
          c.globalAlpha = 0.55 + 0.25 * Math.sin(t * 3 + k);
          c.strokeStyle = cols[k % cols.length]; c.lineWidth = 4;
          c.shadowBlur = 28; c.shadowColor = cols[k % cols.length];
          c.beginPath(); c.arc(cx, cy, rad, 0, Math.PI * 2); c.stroke(); c.restore();
        }
        c.save(); c.globalAlpha = 0.12; c.fillStyle = "#00f0ff";
        for (let gx = 0; gx < w; gx += 60) for (let gy = 0; gy < h; gy += 60) c.fillRect(gx, gy, 2, 2);
        c.restore();
        drawAvatar(c, w, h, t, { glow: "rgba(0,240,255,.45)", ring: "#00f0ff", pulse: 0.04 * Math.sin(t * 4) });
        drawMessage(c, w, h, t, { c1: "#ffffff", c2: "#ff66e0", c3: "#66f6ff" });
      },
    },
    particles: {
      render(c, t, w, h, s) {
        bgRadial(c, w, h, "#06283d", "#020812");
        const { cx, cy, r } = avatarLayout(w, h);
        const ringR = r * 1.5, appear = clamp((t - 1.4) / 1.2, 0, 1);
        c.save();
        for (const pt of s.parts) {
          const ex = cx + Math.cos(pt.ang) * ringR, ey = cy + Math.sin(pt.ang) * ringR;
          const prog = easeOut(clamp(t / 2.2, 0, 1));
          const x = lerp(pt.x0, ex, prog), y = lerp(pt.y0, ey, prog);
          c.globalAlpha = 0.85; c.fillStyle = pt.col; c.shadowBlur = 10; c.shadowColor = pt.col;
          c.beginPath(); c.arc(x, y, pt.size, 0, Math.PI * 2); c.fill();
        }
        c.restore();
        drawAvatar(c, w, h, t, { glow: "rgba(80,220,255,.5)", ring: "rgba(120,240,255,.9)", appear });
        drawMessage(c, w, h, t, { c1: "#bff4ff", c2: "#4fd0ff", c3: "#7c5cff", revealStart: 2.8 });
      },
    },
    gold: {
      render(c, t, w, h, s) {
        bgRadial(c, w, h, "#3a1206", "#0c0503");
        c.save();
        for (const d of s.dust) {
          const y = (d.y0 + t * d.vy) % h;
          const x = d.x + Math.sin(t * d.sw + d.ph) * d.ax;
          c.globalAlpha = d.a * (0.6 + 0.4 * Math.sin(t * 2 + d.ph));
          c.fillStyle = "#ffd96b"; c.shadowBlur = 8; c.shadowColor = "#ffb000";
          c.beginPath(); c.arc(x, y, d.size, 0, Math.PI * 2); c.fill();
        }
        c.restore();
        const { cx, cy, r } = avatarLayout(w, h);
        c.save();
        c.strokeStyle = "rgba(255,210,110,.85)"; c.lineWidth = 4; c.shadowBlur = 16; c.shadowColor = "#ffb000";
        const fr = r * 1.35, off = fr * 0.9;
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          c.beginPath(); c.arc(cx + sx * off, cy + sy * off, fr * 0.5,
            sx > 0 ? Math.PI : Math.PI * 1.5, sx > 0 ? Math.PI * 1.5 : Math.PI * 2); c.stroke();
        }
        c.restore();
        drawAvatar(c, w, h, t, { glow: "rgba(255,190,80,.55)", ring: "rgba(255,215,130,.95)", pulse: 0.05 * Math.sin(t * 2) });
        drawMessage(c, w, h, t, { c1: "#fff3c4", c2: "#ffd24d", c3: "#ff9a3c", capColor: "rgba(255,235,190,.92)" });
      },
    },
    hearts: {
      render(c, t, w, h, s) {
        const g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, "#ffd0e4"); g.addColorStop(1, "#ff7eb3");
        c.fillStyle = g; c.fillRect(0, 0, w, h);
        c.save();
        for (const ht of s.hearts) {
          const life = (ht.t0 + t * ht.sp) % 1;
          const y = h * (1.05 - life * 1.15);
          const x = ht.x * w + Math.sin(t * ht.sw + ht.ph) * ht.ax;
          c.globalAlpha = Math.sin(life * Math.PI) * 0.9;
          c.fillStyle = ht.col; c.shadowBlur = 14; c.shadowColor = ht.col;
          drawHeart(c, x, y, ht.size);
        }
        c.restore();
        drawAvatar(c, w, h, t, { glow: "rgba(255,150,190,.6)", ring: "rgba(255,255,255,.95)", pulse: 0.05 * Math.sin(t * 2.6) });
        drawMessage(c, w, h, t, { c1: "#ffffff", c2: "#ff8ab5", c3: "#ff5e8a" });
      },
    },

    // ---------- 新增：更炸的特效 ----------
    fire: {
      render(c, t, w, h, s) {
        bgRadial(c, w, h, "#2a0d03", "#060200");
        c.save(); c.globalCompositeOperation = "lighter";
        for (const e of s.embers) {
          const prog = (t * e.spd + e.ph) % 1;
          const y = lerp(h * 1.02, h * 0.05, prog);
          const x = e.xf * w + Math.sin(prog * 6 + e.ph) * 26;
          const a = Math.sin(prog * Math.PI);
          const rad = e.size * (1 - prog * 0.4);
          const g = c.createRadialGradient(x, y, 0, x, y, rad * 4);
          g.addColorStop(0, `hsla(${e.hue},100%,70%,${a})`);
          g.addColorStop(1, "rgba(0,0,0,0)");
          c.fillStyle = g; c.beginPath(); c.arc(x, y, rad * 4, 0, Math.PI * 2); c.fill();
        }
        c.restore();
        drawAvatar(c, w, h, t, { glow: "rgba(255,120,30,.6)", ring: "rgba(255,170,60,.95)", pulse: 0.06 * Math.sin(t * 5) });
        drawMessage(c, w, h, t, { c1: "#fff0c0", c2: "#ff8a2b", c3: "#ff5e2a", glow: "rgba(255,120,30,.9)" });
      },
    },
    warp: {
      render(c, t, w, h, s) {
        c.fillStyle = "#02030a"; c.fillRect(0, 0, w, h);
        const { cx, cy } = avatarLayout(w, h);
        const maxR = Math.hypot(w, h);
        c.save(); c.translate(cx, cy); c.globalCompositeOperation = "lighter";
        for (const st of s.stars) {
          const dist = (t * st.speed + st.d0) % 1;
          const r0 = dist * maxR, r1 = r0 + st.len;
          const a = clamp(dist * 1.4, 0, 1) * 0.9;
          c.strokeStyle = `rgba(${st.col},${a})`; c.lineWidth = 2 + dist * 2;
          c.beginPath();
          c.moveTo(Math.cos(st.ang) * r0, Math.sin(st.ang) * r0);
          c.lineTo(Math.cos(st.ang) * r1, Math.sin(st.ang) * r1);
          c.stroke();
        }
        c.restore();
        const g = c.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.5);
        g.addColorStop(0, "rgba(80,180,255,.25)"); g.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = g; c.fillRect(0, 0, w, h);
        drawAvatar(c, w, h, t, { glow: "rgba(80,200,255,.55)", ring: "rgba(120,230,255,.95)", pulse: 0.05 * Math.sin(t * 4) });
        drawMessage(c, w, h, t, { c1: "#dff6ff", c2: "#5fd6ff", c3: "#b07cff", glow: "rgba(80,200,255,.9)" });
      },
    },
    confetti: {
      render(c, t, w, h, s) {
        const g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, "#3a1b5e"); g.addColorStop(1, "#7a1f4d");
        c.fillStyle = g; c.fillRect(0, 0, w, h);
        c.save();
        for (const cf of s.conf) {
          const y = (cf.y0 + t * cf.vy) % (h + 60) - 30;
          const x = cf.x * w + Math.sin(t * cf.sway + cf.ph) * 30;
          const rot = cf.rot0 + t * cf.vr;
          c.save(); c.translate(x, y); c.rotate(rot);
          c.fillStyle = cf.color; c.globalAlpha = 0.95; c.shadowBlur = 6; c.shadowColor = cf.color;
          c.fillRect(-cf.size / 2, -cf.size * 0.35, cf.size, cf.size * 0.7);
          c.restore();
        }
        c.restore();
        drawAvatar(c, w, h, t, { glow: "rgba(255,120,200,.5)", ring: "rgba(255,255,255,.95)", pulse: 0.05 * Math.sin(t * 3) });
        drawMessage(c, w, h, t, { c1: "#ffffff", c2: "#ffd24d", c3: "#ff5e8a", glow: "rgba(255,150,200,.9)" });
      },
    },
    crown: {
      render(c, t, w, h, s) {
        bgRadial(c, w, h, "#2a1c00", "#050300");
        const { cx, cy, r } = avatarLayout(w, h);
        // 聚光灯光束
        c.save();
        const beam = c.createLinearGradient(0, 0, 0, cy);
        beam.addColorStop(0, "rgba(255,225,140,.35)"); beam.addColorStop(1, "rgba(255,225,140,0)");
        c.fillStyle = beam;
        c.beginPath(); c.moveTo(cx - w * 0.05, 0); c.lineTo(cx + w * 0.05, 0);
        c.lineTo(cx + r * 1.1, cy); c.lineTo(cx - r * 1.1, cy); c.closePath(); c.fill();
        c.restore();
        // 旋转金光
        c.save(); c.translate(cx, cy); c.rotate(t * 0.5);
        for (let i = 0; i < 16; i++) {
          const ang = (i / 16) * Math.PI * 2;
          c.strokeStyle = "rgba(255,210,110,.35)"; c.lineWidth = 3; c.shadowBlur = 10; c.shadowColor = "#ffcf5a";
          c.beginPath(); c.moveTo(Math.cos(ang) * r * 1.4, Math.sin(ang) * r * 1.4);
          c.lineTo(Math.cos(ang) * r * 2.4, Math.sin(ang) * r * 2.4); c.stroke();
        }
        c.restore();
        // 皇冠
        drawCrown(c, cx, cy - r - r * 0.65, r * 0.8, t);
        drawAvatar(c, w, h, t, { glow: "rgba(255,200,80,.6)", ring: "rgba(255,215,130,.95)", pulse: 0.05 * Math.sin(t * 2) });
        drawMessage(c, w, h, t, { c1: "#fff3c4", c2: "#ffd24d", c3: "#ff9a3c", glow: "rgba(255,200,80,.95)", capColor: "rgba(255,235,190,.92)" });
      },
    },
    aurora: {
      render(c, t, w, h, s) {
        const g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, "#021026"); g.addColorStop(1, "#04122b");
        c.fillStyle = g; c.fillRect(0, 0, w, h);
        c.save();
        for (const st of s.stars) { c.globalAlpha = 0.5 + 0.4 * Math.sin(t * st.tw + st.ph); c.fillStyle = "#fff"; c.beginPath(); c.arc(st.x * w, st.y * h, st.r, 0, Math.PI * 2); c.fill(); }
        c.restore();
        c.save(); c.globalCompositeOperation = "lighter";
        const hues = ["#39ff14", "#00e0ff", "#b14dff"];
        for (let k = 0; k < 3; k++) {
          const baseY = h * (0.16 + k * 0.12), amp = h * 0.05, thick = h * 0.11;
          c.beginPath();
          for (let x = 0; x <= w; x += 20) { const y = baseY + Math.sin(x * 0.004 + t * 0.5 + k * 1.7) * amp; if (x === 0) c.moveTo(x, y - thick / 2); else c.lineTo(x, y - thick / 2); }
          for (let x = w; x >= 0; x -= 20) { const y = baseY + Math.sin(x * 0.004 + t * 0.5 + k * 1.7) * amp; c.lineTo(x, y + thick / 2); }
          c.closePath();
          const rg = c.createLinearGradient(0, baseY - thick / 2, 0, baseY + thick / 2);
          rg.addColorStop(0, "rgba(0,0,0,0)"); rg.addColorStop(0.5, hues[k]); rg.addColorStop(1, "rgba(0,0,0,0)");
          c.globalAlpha = 0.4; c.fillStyle = rg; c.fill();
        }
        c.restore();
        drawAvatar(c, w, h, t, { glow: "rgba(80,255,180,.5)", ring: "rgba(140,255,210,.95)", pulse: 0.05 * Math.sin(t * 2) });
        drawMessage(c, w, h, t, { c1: "#e8fff4", c2: "#7dffc4", c3: "#5fd6ff", glow: "rgba(80,255,180,.9)" });
      },
    },
    thunder: {
      render(c, t, w, h, s) {
        const g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, "#0a0e1a"); g.addColorStop(1, "#05060a");
        c.fillStyle = g; c.fillRect(0, 0, w, h);
        c.save();
        for (const st of s.rain) {
          const y = (st.y0 + t * st.vy) % h;
          c.globalAlpha = 0.25; c.strokeStyle = "#8db4ff"; c.lineWidth = 1.5;
          c.beginPath(); c.moveTo(st.xf * w, y); c.lineTo(st.xf * w - 6, y + 26); c.stroke();
        }
        c.restore();
        let flash = 0;
        c.save();
        for (const b of s.bolts) {
          if (t < b.t || t > b.t + 0.28) continue;
          const a = 1 - (t - b.t) / 0.28; flash = Math.max(flash, a);
          c.globalAlpha = a; c.strokeStyle = "#eaf4ff"; c.lineWidth = 4; c.shadowBlur = 20; c.shadowColor = "#9fd0ff";
          c.beginPath(); c.moveTo(b.x, 0);
          for (let i = 1; i < b.pts.length; i++) c.lineTo(b.x + b.pts[i], h * (i / (b.pts.length - 1)));
          c.stroke();
        }
        c.restore();
        if (flash > 0) { c.save(); c.globalAlpha = flash * 0.5; c.fillStyle = "#cfe0ff"; c.fillRect(0, 0, w, h); c.restore(); }
        drawAvatar(c, w, h, t, { glow: "rgba(120,170,255,.55)", ring: "rgba(160,200,255,.95)", pulse: 0.05 * Math.sin(t * 6) });
        drawMessage(c, w, h, t, { c1: "#eaf2ff", c2: "#9fc4ff", c3: "#c9a8ff", glow: "rgba(140,180,255,.9)" });
      },
    },
  };

  // ============================================================
  // 场景生成
  // ============================================================
  function generateScene() {
    const w = SIZES[state.size].w, h = SIZES[state.size].h;
    const rng = mulberry32(hashStr(state.effect) ^ state.seed);
    const s = { w, h };

    if (state.effect === "fireworks") {
      s.fws = [];
      for (let i = 0; i < 9; i++) {
        const parts = [];
        const cnt = 50 + Math.floor(rng() * 30);
        for (let j = 0; j < cnt; j++) parts.push({ ang: (j / cnt) * Math.PI * 2 + rng() * 0.2, spd: 0.5 + rng() * 0.9, l: rng() });
        s.fws.push({ launchT: i * 0.55 + rng() * 0.3, x: w * (0.12 + rng() * 0.76), y: h * (0.12 + rng() * 0.42), hue: rng() * 360, parts });
      }
    } else if (state.effect === "starlight") {
      s.stars = [];
      for (let i = 0; i < 160; i++) s.stars.push({ x: rng(), y: rng(), r: 0.6 + rng() * 1.8, tw: 1 + rng() * 3, ph: rng() * 6 });
      s.shooting = [];
      for (let i = 0; i < 3; i++) s.shooting.push({ t: i * 1.4 + rng(), x0: rng() * w, y0: rng() * h * 0.4, x1: rng() * w, y1: rng() * h * 0.4 + 200 });
    } else if (state.effect === "particles") {
      s.parts = [];
      const cols = ["#00e5ff", "#7c5cff", "#66f6ff", "#bff4ff"];
      for (let i = 0; i < 220; i++) s.parts.push({ x0: rng() * w, y0: rng() * h, ang: rng() * Math.PI * 2, size: 1.5 + rng() * 2.5, col: cols[Math.floor(rng() * cols.length)] });
    } else if (state.effect === "gold") {
      s.dust = [];
      for (let i = 0; i < 130; i++) s.dust.push({ x: rng() * w, y0: rng() * h, vy: 30 + rng() * 80, size: 1 + rng() * 2.5, a: 0.4 + rng() * 0.6, sw: 0.5 + rng() * 2, ax: 10 + rng() * 30, ph: rng() * 6 });
    } else if (state.effect === "hearts") {
      s.hearts = [];
      const cols = ["#ff5e8a", "#ff8ab5", "#ffd0e4", "#ffffff"];
      for (let i = 0; i < 40; i++) s.hearts.push({ x: rng(), t0: rng(), sp: 0.12 + rng() * 0.18, size: 14 + rng() * 30, sw: 0.6 + rng() * 1.5, ax: 20 + rng() * 50, ph: rng() * 6, col: cols[Math.floor(rng() * cols.length)] });
    } else if (state.effect === "fire") {
      s.embers = [];
      for (let i = 0; i < 90; i++) s.embers.push({ xf: rng(), spd: 0.25 + rng() * 0.4, size: 6 + rng() * 10, hue: 15 + rng() * 35, ph: rng() });
    } else if (state.effect === "warp") {
      s.stars = [];
      const cols = ["255,255,255", "150,210,255", "200,160,255"];
      for (let i = 0; i < 220; i++) s.stars.push({ ang: rng() * Math.PI * 2, d0: rng(), speed: 0.3 + rng() * 0.6, len: 30 + rng() * 90, col: cols[Math.floor(rng() * cols.length)] });
    } else if (state.effect === "confetti") {
      s.conf = [];
      const cols = ["#ff5e8a", "#ffd24d", "#5ad1ff", "#7cff8a", "#b07cff", "#ff9a3c"];
      for (let i = 0; i < 140; i++) s.conf.push({ x: rng(), y0: rng() * h, vy: 120 + rng() * 160, rot0: rng() * 6, vr: (rng() - 0.5) * 6, size: 12 + rng() * 14, sway: 1 + rng() * 2, ph: rng() * 6, color: cols[Math.floor(rng() * cols.length)] });
    } else if (state.effect === "aurora") {
      s.stars = [];
      for (let i = 0; i < 120; i++) s.stars.push({ x: rng(), y: rng() * 0.6, r: 0.5 + rng() * 1.5, tw: 1 + rng() * 3, ph: rng() * 6 });
    } else if (state.effect === "thunder") {
      s.rain = [];
      for (let i = 0; i < 90; i++) s.rain.push({ xf: rng(), y0: rng() * h, vy: 600 + rng() * 400 });
      s.bolts = [];
      const N = 6;
      for (let i = 0; i < N; i++) {
        const pts = [];
        for (let k = 0; k < 9; k++) pts.push((rng() * 2 - 1) * w * 0.06);
        s.bolts.push({ t: 0.4 + i * 1.2 + rng() * 0.3, x: w * (0.2 + rng() * 0.6), pts });
      }
    }
    scene = s;
  }

  // ============================================================
  // 绘制调度
  // ============================================================
  function draw(t) {
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    effects[state.effect].render(ctx, t, w, h, scene);
    drawNames(ctx, w, h, t);
  }
  function drawStatic() {
    if (state.playing || state.recording) return;
    draw(3.2);
  }

  // ============================================================
  // 音频引擎
  // ============================================================
  let audioCtx = null, audioDest = null, masterNode = null, activeNodes = [], bgmSource = null;

  function initAudio() {
    if (audioCtx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
    audioDest = audioCtx.createMediaStreamDestination();
    masterNode = audioCtx.createGain();
    masterNode.gain.value = 0.9;
    masterNode.connect(audioCtx.destination);   // 扬声器（预览可听）
    masterNode.connect(audioDest);               // 捕获轨道（录进视频）
  }
  function _note(dest, freq, start, dur, type, gain) {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(gain, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(dest);
    o.start(start); o.stop(start + dur + 0.05);
    activeNodes.push(o);
  }
  function scheduleCelebration(start) {
    const chords = [[523.25, 659.25, 783.99], [587.33, 739.99, 880], [659.25, 830.61, 987.77], [698.46, 880, 1046.5]];
    const beat = 0.4;
    let t = start;
    for (let i = 0; i < DURATION / beat; i++) {
      const chord = chords[i % chords.length];
      chord.forEach((f, idx) => _note(masterNode, f, t + idx * 0.04, beat * 0.9, "triangle", 0.16));
      if (i % 2 === 0) _note(masterNode, 1568 + Math.random() * 400, t + beat * 0.5, 0.3, "sine", 0.07);
      t += beat;
    }
    _note(masterNode, 1046.5, start + DURATION - 0.6, 0.6, "triangle", 0.22);
  }
  function stopAudio() {
    activeNodes.forEach((n) => { try { n.stop(); } catch (e) {} });
    activeNodes = [];
    if (bgmSource) { try { bgmSource.stop(); } catch (e) {} bgmSource = null; }
  }
  function startAudio() {
    if (!state.soundOn) return;
    initAudio();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const now = audioCtx.currentTime;
    stopAudio();
    if (state.bgmBuffer) {
      bgmSource = audioCtx.createBufferSource();
      bgmSource.buffer = state.bgmBuffer; bgmSource.loop = true;
      bgmSource.connect(masterNode); bgmSource.start(now);
    } else {
      scheduleCelebration(now);
    }
  }

  // ============================================================
  // 交互
  // ============================================================
  function handleFile(file) {
    if (!file || !file.type.startsWith("image/")) { setStatus("请选择图片文件", ""); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        state.avatar = img;
        avatarPreview.src = e.target.result;
        avatarPreview.classList.remove("hidden");
        dzHint.classList.add("hidden");
        clearAvatar.classList.remove("hidden");
        setStatus("头像已就绪，选好特效后点「生成并下载视频」", "ok");
        drawStatic();
      };
      img.onerror = () => setStatus("图片加载失败，请换一张", "");
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
  fileInput.addEventListener("change", (e) => handleFile(e.target.files[0]));
  dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.style.borderColor = "var(--accent)"; });
  dropzone.addEventListener("dragleave", () => { dropzone.style.borderColor = ""; });
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault(); dropzone.style.borderColor = "";
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  dropzone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); } });
  clearAvatar.addEventListener("click", () => {
    state.avatar = null; fileInput.value = "";
    avatarPreview.classList.add("hidden"); dzHint.classList.remove("hidden"); clearAvatar.classList.add("hidden");
    setStatus("已移除头像，请重新上传", ""); drawStatic();
  });

  effectGrid.addEventListener("click", (e) => {
    const card = e.target.closest(".effect-card");
    if (!card) return;
    [...effectGrid.children].forEach((el) => el.setAttribute("aria-checked", String(el === card)));
    state.effect = card.dataset.effect;
    generateScene(); drawStatic();
  });

  mainTextInput.addEventListener("input", () => { state.mainText = mainTextInput.value; drawStatic(); });
  captionInput.addEventListener("input", () => { state.caption = captionInput.value; drawStatic(); });
  namesText.addEventListener("input", () => {
    state.names = namesText.value.split("\n").map((s) => s.trim()).filter(Boolean);
    drawStatic();
  });
  soundToggle.addEventListener("change", () => { state.soundOn = soundToggle.checked; });

  bgmInput.addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      initAudio();
      audioCtx.decodeAudioData(ev.target.result).then((buf) => {
        state.bgmBuffer = buf;
        setStatus("背景音乐已载入，生成时生效", "ok");
      }).catch(() => setStatus("音频解码失败，请换一个 MP3/WAV", ""));
    };
    reader.readAsArrayBuffer(f);
  });

  document.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".seg-btn").forEach((b) => b.setAttribute("aria-checked", String(b === btn)));
      state.size = btn.dataset.size;
      const { w, h } = SIZES[state.size];
      canvas.width = w; canvas.height = h; canvas.style.aspectRatio = `${w} / ${h}`;
      generateScene(); drawStatic();
    });
  });

  function playPreview() {
    if (state.recording) return;
    state.playing = true; playBtn.disabled = true; stopBtn.disabled = false;
    startAudio();
    const start = performance.now();
    const loop = (now) => {
      if (!state.playing) return;
      const t = ((now - start) / 1000) % (DURATION + 2);
      if (t < 0.05) startAudio(); // 每轮循环重启音效
      draw(t);
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
  }
  function stopPreview() {
    state.playing = false;
    if (rafId) cancelAnimationFrame(rafId);
    stopAudio();
    playBtn.disabled = false; stopBtn.disabled = true;
    drawStatic();
  }
  playBtn.addEventListener("click", playPreview);
  stopBtn.addEventListener("click", stopPreview);

  // ============================================================
  // 视频生成
  // ============================================================
  function pickMime() {
    const cands = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    for (const m of cands) if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
    return "";
  }

  async function generateVideo() {
    if (!state.avatar) { setStatus("请先上传头像再生成视频", ""); return; }
    if (state.recording) return;
    if (!canvas.captureStream || !window.MediaRecorder) {
      setStatus("当前浏览器不支持录制，请使用 Chrome / Edge / 安卓浏览器", ""); return;
    }
    stopPreview();
    state.recording = true;
    genBtn.disabled = true; playBtn.disabled = true;
    resultWrap.classList.add("hidden");
    setStatus("正在生成视频（含音效）…约 " + DURATION + " 秒", "busy");

    const canvasStream = canvas.captureStream(FPS);
    const tracks = canvasStream.getVideoTracks().slice();
    if (state.soundOn) {
      initAudio(); startAudio();
      audioDest.stream.getAudioTracks().forEach((tr) => tracks.push(tr));
    }
    const mime = pickMime();
    const rec = new MediaRecorder(new MediaStream(tracks), mime ? { mimeType: mime, videoBitsPerSecond: 12_000_000 } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise((resolve) => { rec.onstop = resolve; });
    rec.start();

    await new Promise((res) => {
      const start = performance.now();
      const frame = (now) => {
        const t = (now - start) / 1000;
        if (t >= DURATION) { draw(DURATION); res(); return; }
        draw(t); requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });

    rec.stop();
    await done;
    stopAudio();

    const blob = new Blob(chunks, { type: mime || "video/webm" });
    const url = URL.createObjectURL(blob);
    resultVideo.src = url;
    downloadLink.href = url;
    downloadLink.download = "宝子官宣特效_" + state.effect + ".webm";
    resultWrap.classList.remove("hidden");
    state.recording = false; genBtn.disabled = false; playBtn.disabled = false;
    const sizeKB = (blob.size / 1024).toFixed(0);
    const withSound = state.soundOn ? "（含音效 " + sizeKB + " KB）" : "（无声 " + sizeKB + " KB）";
    setStatus("✅ 视频生成完成" + withSound + "，可预览并下载", "ok");
  }
  genBtn.addEventListener("click", generateVideo);

  function setStatus(msg, kind) {
    statusEl.textContent = msg;
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  function init() {
    const { w, h } = SIZES[state.size];
    canvas.width = w; canvas.height = h; canvas.style.aspectRatio = `${w} / ${h}`;
    generateScene(); drawStatic();
  }
  init();
})();
