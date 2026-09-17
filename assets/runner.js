// ============================================================================
// FILMGRAB 影片剧照下载自动化
// 已确认任务说明 v4：
//   搜索影片关键词 → 打开匹配的影片详情页 → 按代表性原则从剧照画廊选取 3 张
//   → 下载保存到本地文件夹（默认保存到用户桌面下的"电影参考图"文件夹）
// 作为后续调色匹配（Color Match LUT）的参考图。
// ============================================================================
const fs = require('fs');
const path = require('path');

const SITE = 'https://film-grab.com/';
const SEARCH_TOGGLE = '#search-toggle';
const SEARCH_TOGGLE_FALLBACK = 'button.header-search';
const SEARCH_INPUT = 'input[name="s"]';
const RESULT_TITLE = 'h2.entry-title a';
const GALLERY_THUMB = 'a.bwg-a.bwg_lightbox';
const DEFAULT_SAVE_DIR = path.join(os.homedir(), 'Desktop', '电影参考图');
const DEFAULT_COUNT = 3;

// ---- 任务入参（已确认默认值）----
const searchQuery = String((input && input.search_query) || 'Mad Max: Fury Road').trim();
const saveCount = Math.max(1, Math.min(parseInt((input && input.save_count), 10) || DEFAULT_COUNT, 10));
const saveDir = String((input && input.save_dir) || DEFAULT_SAVE_DIR).trim();

if (!searchQuery) {
  throw api.businessError('TARGET_NOT_FOUND', '影片搜索关键词不能为空', { input: 'search_query' });
}

// ---- 工具函数 ----
function sleep(ms) {
  return api.sleep(ms);
}

// 通过页面 fetch 下载图片（走浏览器网络通道，绕过直连限制），返回 base64 数据
function fetchImageBase64(url) {
  return api.evaluate(`(async () => {
    try {
      const res = await fetch(${JSON.stringify(url)});
      if (!res.ok) return { ok: false, status: res.status };
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      return { ok: true, status: res.status, size: bytes.length, b64: btoa(bin) };
    } catch (e) {
      return { ok: false, status: 0, error: String(e && e.message || e) };
    }
  })()`);
}

// 校验图片文件头，确保是有效图片
function looksLikeImage(buf) {
  if (buf.length < 4) return false;
  const head = buf.slice(0, 4);
  return (
    (head[0] === 0xff && head[1] === 0xd8) ||            // JPEG
    (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) || // PNG
    (head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46)    // RIFF/WebP
  );
}

// 收集影片页画廊中的全部剧照原图（去重，保持顺序）
function collectGalleryThumbs() {
  return api.evaluate(`(() => {
    const seen = new Set();
    const out = [];
    document.querySelectorAll('${GALLERY_THUMB}').forEach((a) => {
      const url = a.href || '';
      if (!url) return;
      if (seen.has(url)) return;
      seen.add(url);
      out.push({
        id: a.getAttribute('data-image-id') || '',
        url: url,
        title: a.getAttribute('title') || '',
      });
    });
    return out;
  })()`);
}

// 触发画廊懒加载：滚动画廊容器与页面到底部
function scrollGallery() {
  return api.evaluate(`(() => {
    const g = document.querySelector('div.bwg-masonry-thumbnails')
      || document.querySelector('.bwg-container')
      || document.querySelector('#bwg_container1_0')
      || null;
    if (g) { try { g.scrollTop = g.scrollHeight; } catch (e) {} }
    window.scrollTo(0, document.body.scrollHeight);
    return true;
  })()`);
}

// 在搜索结果页查找与关键词匹配的影片条目
function findMatchingResult(query) {
  return api.evaluate(`(() => {
    const q = ${JSON.stringify(query.toLowerCase())};
    const links = Array.from(document.querySelectorAll('${RESULT_TITLE}'));
    for (let i = 0; i < links.length; i++) {
      const t = (links[i].textContent || '').trim().toLowerCase();
      if (t.indexOf(q) !== -1) {
        return { index: i, title: (links[i].textContent || '').trim(), href: links[i].href };
      }
    }
    return null;
  })()`);
}

// 按代表性原则均匀取样：首、中、尾覆盖整组
function sampleRepresentative(items, count) {
  const n = items.length;
  if (count === 1) return [items[0]];
  const picks = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.round((i * (n - 1)) / (count - 1));
    picks.push(items[Math.min(idx, n - 1)]);
  }
  // 去重（画廊不足时避免重复）
  const seen = new Set();
  return picks.filter((p) => {
    if (seen.has(p.url)) return false;
    seen.add(p.url);
    return true;
  });
}

// 等待搜索结果出现（有界等待，返回布尔）
async function waitForResults(timeoutMs) {
  try {
    await api.waitForSelector(RESULT_TITLE, { timeout: timeoutMs });
    return true;
  } catch (e) {
    return false;
  }
}

// ============================================================================
// 业务步骤
// ============================================================================

// 1. 打开 FILMGRAB 网站
await api.step('打开 FILMGRAB 网站', async () => {
  await api.navigate(SITE, 45000);
  await api.waitForSelector('body', { timeout: 30000, visible: false });
  return api.snapshot();
});

// 2. 打开搜索框，输入影片搜索关键词并提交
await api.step('搜索影片关键词', async () => {
  // 打开搜索框
  try {
    await api.locator(SEARCH_TOGGLE, { visible: true }).click({ timeout: 8000 });
  } catch (e) {
    await api.locator(SEARCH_TOGGLE_FALLBACK, { visible: true }).click({ timeout: 8000 });
  }
  await api.waitForSelector(SEARCH_INPUT, { timeout: 10000 });

  // 输入关键词（空搜索框，逐字符输入以触发页面反应）
  await api.locator(SEARCH_INPUT).type(searchQuery, { delay: 40, timeout: 15000 });

  // 提交（Enter 键）
  await api.locator(SEARCH_INPUT).press('Enter', { timeout: 10000 });

  // 等待搜索结果页
  let ready = await waitForResults(15000);
  if (!ready) {
    // 兜底：点击搜索表单的提交按钮
    try {
      await api.locator('#masthead button[type="submit"], #searchform button, form[role="search"] button', { index: 0 }).click({ timeout: 8000 });
    } catch (e) { /* ignore fallback failure */ }
    ready = await waitForResults(20000);
  }
  if (!ready) {
    throw api.businessError(
      'TARGET_NOT_FOUND',
      '搜索后没有出现影片搜索结果，无法继续',
      { search_query: searchQuery },
    );
  }
  return api.snapshot();
});

// 3. 在搜索结果中打开与关键词匹配的影片详情页
const filmPage = await api.step('打开匹配的影片详情页', async () => {
  let matched = await findMatchingResult(searchQuery);
  if (!matched) {
    // 有界重试：短暂等待后再次查找
    await sleep(2000);
    matched = await findMatchingResult(searchQuery);
  }
  if (!matched) {
    throw api.businessError(
      'TARGET_NOT_FOUND',
      '搜索结果中没有找到与关键词匹配的影片条目',
      { search_query: searchQuery },
    );
  }

  const clickRes = await api.locator(RESULT_TITLE, { index: matched.index }).click({ timeout: 15000 });
  if (clickRes.opened_page) {
    await api.switchTab(clickRes.opened_page.tabId);
  }

  // 等待影片页剧照画廊出现
  await api.waitForSelector(GALLERY_THUMB, { timeout: 30000 });
  const snap = await api.snapshot();

  // 身份校验：必须离开搜索结果页
  if (snap.url && snap.url.indexOf('?s=') !== -1) {
    throw api.businessError(
      'TARGET_IDENTITY_MISMATCH',
      '未能打开匹配的影片详情页',
      { url: snap.url, search_query: searchQuery },
    );
  }
  return snap;
});

// 4. 按代表性原则从剧照画廊选取剧照
const selected = await api.step('按代表性原则选取剧照', async () => {
  let thumbs = await collectGalleryThumbs();
  if (thumbs.length < saveCount) {
    // 触发懒加载后重试一次
    await scrollGallery();
    await sleep(1500);
    thumbs = await collectGalleryThumbs();
  }
  if (thumbs.length < saveCount) {
    throw api.businessError(
      'TARGET_NOT_FOUND',
      '影片页剧照画廊不足 ' + saveCount + ' 张剧照（当前 ' + thumbs.length + ' 张）',
      { gallery_count: thumbs.length, save_count: saveCount },
    );
  }
  return sampleRepresentative(thumbs, saveCount);
});

// 5. 下载剧照到保存文件夹并核对文件已写入
const saved = await api.step('下载剧照到保存文件夹', async () => {
  if (!fs.existsSync(saveDir)) {
    fs.mkdirSync(saveDir, { recursive: true });
  }
  if (!fs.statSync(saveDir).isDirectory()) {
    throw api.businessError('OUTPUT_INVARIANT_FAILED', '保存路径不是文件夹: ' + saveDir, { save_dir: saveDir });
  }

  const slug = (filmPage.url || '').split('/').filter(Boolean).pop() || 'filmgrab';
  const results = [];
  for (const item of selected) {
    const orig = decodeURIComponent(path.basename(new URL(item.url).pathname));
    const safe = orig.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
    const fileName = slug + '-' + safe;
    const dest = path.join(saveDir, fileName);

    // 页面 fetch 下载（浏览器网络通道）
    const fetched = await fetchImageBase64(item.url);
    if (!fetched || !fetched.ok) {
      throw api.businessError(
        'OUTPUT_INVARIANT_FAILED',
        '图片下载失败（HTTP ' + (fetched && fetched.status) + '）: ' + item.url,
        { url: item.url, status: fetched && fetched.status },
      );
    }
    const buf = Buffer.from(fetched.b64, 'base64');
    if (!looksLikeImage(buf)) {
      throw api.businessError('OUTPUT_INVARIANT_FAILED', '下载内容不是有效图片: ' + item.url, { url: item.url });
    }
    fs.writeFileSync(dest, buf);
    const st = fs.statSync(dest);
    if (!st.isFile() || st.size === 0) {
      throw api.businessError('OUTPUT_INVARIANT_FAILED', '下载文件无效: ' + dest, { size: st.size });
    }
    results.push({ file: fileName, path: dest, url: item.url, size: st.size });
  }
  return results;
});

// 页面摘要（供用户确认处理内容）
const pageSummary = await api.evaluate(
  `(() => (document.body ? (document.body.innerText || '').slice(0, 300) : ''))()`,
);

const processingStatus = '已保存 ' + saved.length + ' 张剧照到 ' + saveDir;

return {
  success: true,
  validated: true,
  saved_images: saved,
  page_url: filmPage.url,
  page_title: filmPage.title,
  page_summary: pageSummary,
  processing_status: processingStatus,
};
