// ==UserScript==
// @name         Ximalaya Metadata Exporter
// @description  为喜马拉雅专辑页生成可编辑的 metadata.json
// @author       Codex
// @namespace    https://github.com/zzzwannasleep/XimalayaMetadataScript
// @version      0.1.0.2
// @homepageURL  https://github.com/zzzwannasleep/XimalayaMetadataScript
// @supportURL   https://github.com/zzzwannasleep/XimalayaMetadataScript/issues
// @downloadURL  https://raw.githubusercontent.com/zzzwannasleep/XimalayaMetadataScript/main/dist/ximalaya-metadata.user.js
// @updateURL    https://raw.githubusercontent.com/zzzwannasleep/XimalayaMetadataScript/main/dist/ximalaya-metadata.meta.js
// @match        https://www.ximalaya.com/album/*
// @match        https://m.ximalaya.com/album/*
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @connect      www.ximalaya.com
// @connect      mobwsa.ximalaya.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const SCRIPT_NS = "xmly-metadata-exporter";
  const BUTTON_ID = `${SCRIPT_NS}-button`;
  const PANEL_ID = `${SCRIPT_NS}-panel`;
  const TOAST_ID = `${SCRIPT_NS}-toast`;
  const STYLE_ID = `${SCRIPT_NS}-style`;
  const ROUTE_EVENT = `${SCRIPT_NS}:route-change`;

  const BUTTON_LABEL = "导出 metadata.json";
  const GENERIC_CATEGORY_GENRES = new Set(["有声图书", "其他"]);
  const GENERIC_TAGS = new Set([
    "有声书",
    "有声图书",
    "广播剧",
    "多人剧",
    "全本",
    "无删减",
    "畅销书",
    "活动小说",
    "完结",
  ]);
  const NOISY_PERSON_WORDS = [
    "原著",
    "作者",
    "演播",
    "播讲",
    "主播",
    "单播",
    "旁白",
    "报幕",
    "有声书",
    "广播剧",
    "喜马拉雅",
    "点击",
    "订阅",
    "官方授权",
    "年度巨献",
    "全集",
    "全本",
    "无删减",
  ];

  let routeBound = false;
  let bodyOverflowCache = "";

  installStyles();
  bindRouteEvents();
  syncFloatingButton();
  window.addEventListener(ROUTE_EVENT, syncFloatingButton);
  window.addEventListener("load", syncFloatingButton);

  function installStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${BUTTON_ID} {
        position: fixed;
        right: 24px;
        bottom: 24px;
        z-index: 2147483640;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-width: 168px;
        padding: 14px 18px;
        border: 0;
        border-radius: 16px;
        background:
          radial-gradient(circle at top left, rgba(255,255,255,0.24), transparent 42%),
          linear-gradient(135deg, #ff7a18 0%, #ff5f6d 100%);
        box-shadow: 0 18px 36px rgba(255, 95, 109, 0.28);
        color: #fff;
        font: 600 14px/1.1 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
        letter-spacing: 0.02em;
        cursor: pointer;
        transition: transform 180ms ease, box-shadow 180ms ease, opacity 180ms ease;
      }

      #${BUTTON_ID}:hover {
        transform: translateY(-2px);
        box-shadow: 0 24px 42px rgba(255, 95, 109, 0.34);
      }

      #${BUTTON_ID}:disabled {
        cursor: wait;
        opacity: 0.78;
        transform: none;
      }

      #${PANEL_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      }

      #${PANEL_ID} .${SCRIPT_NS}__backdrop {
        position: absolute;
        inset: 0;
        background: rgba(11, 18, 32, 0.54);
        backdrop-filter: blur(8px);
      }

      #${PANEL_ID} .${SCRIPT_NS}__dialog {
        position: relative;
        width: min(1160px, calc(100vw - 32px));
        max-height: calc(100vh - 32px);
        overflow: hidden;
        border: 1px solid rgba(18, 33, 57, 0.08);
        border-radius: 24px;
        background:
          radial-gradient(circle at top right, rgba(255, 122, 24, 0.08), transparent 28%),
          linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,255,255,0.96));
        box-shadow: 0 28px 80px rgba(11, 18, 32, 0.28);
        color: #152136;
      }

      #${PANEL_ID} .${SCRIPT_NS}__header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        padding: 24px 24px 18px;
        border-bottom: 1px solid rgba(18, 33, 57, 0.08);
      }

      #${PANEL_ID} .${SCRIPT_NS}__title {
        margin: 0;
        font-size: 24px;
        line-height: 1.2;
      }

      #${PANEL_ID} .${SCRIPT_NS}__subtitle {
        margin: 8px 0 0;
        color: #5d6b82;
        font-size: 13px;
        line-height: 1.6;
      }

      #${PANEL_ID} .${SCRIPT_NS}__close {
        flex: 0 0 auto;
        width: 40px;
        height: 40px;
        border: 0;
        border-radius: 12px;
        background: #f4f7fb;
        color: #24314a;
        font-size: 22px;
        line-height: 1;
        cursor: pointer;
      }

      #${PANEL_ID} .${SCRIPT_NS}__body {
        max-height: calc(100vh - 140px);
        overflow: auto;
        padding: 24px;
      }

      #${PANEL_ID} .${SCRIPT_NS}__meta {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 18px;
      }

      #${PANEL_ID} .${SCRIPT_NS}__metaCard {
        padding: 14px 16px;
        border: 1px solid rgba(18, 33, 57, 0.08);
        border-radius: 16px;
        background: #fbfcfe;
      }

      #${PANEL_ID} .${SCRIPT_NS}__metaLabel {
        display: block;
        margin-bottom: 6px;
        color: #7a879b;
        font-size: 12px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      #${PANEL_ID} .${SCRIPT_NS}__metaValue {
        font-size: 14px;
        line-height: 1.5;
        word-break: break-word;
      }

      #${PANEL_ID} .${SCRIPT_NS}__layout {
        display: grid;
        grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
        gap: 18px;
      }

      #${PANEL_ID} .${SCRIPT_NS}__card {
        border: 1px solid rgba(18, 33, 57, 0.08);
        border-radius: 18px;
        background: #ffffff;
        box-shadow: 0 10px 26px rgba(19, 34, 59, 0.05);
      }

      #${PANEL_ID} .${SCRIPT_NS}__cardHead {
        padding: 16px 18px;
        border-bottom: 1px solid rgba(18, 33, 57, 0.08);
        font-size: 15px;
        font-weight: 700;
      }

      #${PANEL_ID} .${SCRIPT_NS}__cardSub {
        display: block;
        margin-top: 6px;
        color: #66758e;
        font-size: 12px;
        font-weight: 500;
      }

      #${PANEL_ID} .${SCRIPT_NS}__form {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
        padding: 18px;
      }

      #${PANEL_ID} .${SCRIPT_NS}__field {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      #${PANEL_ID} .${SCRIPT_NS}__field[data-span="2"] {
        grid-column: span 2;
      }

      #${PANEL_ID} .${SCRIPT_NS}__label {
        font-size: 13px;
        font-weight: 700;
        color: #22304a;
      }

      #${PANEL_ID} .${SCRIPT_NS}__hint {
        color: #72809a;
        font-size: 12px;
        line-height: 1.5;
      }

      #${PANEL_ID} input,
      #${PANEL_ID} textarea {
        width: 100%;
        box-sizing: border-box;
        padding: 12px 14px;
        border: 1px solid #d9e1ee;
        border-radius: 14px;
        outline: none;
        background: #fbfcff;
        color: #16233a;
        font: 500 14px/1.45 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
        transition: border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease;
      }

      #${PANEL_ID} input:focus,
      #${PANEL_ID} textarea:focus {
        border-color: #ff7a18;
        background: #fff;
        box-shadow: 0 0 0 4px rgba(255, 122, 24, 0.12);
      }

      #${PANEL_ID} textarea {
        min-height: 170px;
        resize: vertical;
      }

      #${PANEL_ID} .${SCRIPT_NS}__previewWrap {
        display: flex;
        flex-direction: column;
      }

      #${PANEL_ID} .${SCRIPT_NS}__preview {
        margin: 0;
        padding: 18px;
        min-height: 420px;
        max-height: 620px;
        overflow: auto;
        background: linear-gradient(180deg, #111a29, #18263d);
        color: #f5f7fb;
        font: 13px/1.65 "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
        white-space: pre-wrap;
        word-break: break-word;
      }

      #${PANEL_ID} .${SCRIPT_NS}__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        padding: 0 18px 18px;
      }

      #${PANEL_ID} .${SCRIPT_NS}__action {
        appearance: none;
        border: 0;
        border-radius: 14px;
        padding: 12px 16px;
        cursor: pointer;
        font: 700 13px/1 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      }

      #${PANEL_ID} .${SCRIPT_NS}__action[data-tone="primary"] {
        background: linear-gradient(135deg, #ff7a18 0%, #ff5f6d 100%);
        color: #fff;
      }

      #${PANEL_ID} .${SCRIPT_NS}__action[data-tone="secondary"] {
        background: #eef3fb;
        color: #20304d;
      }

      #${PANEL_ID} .${SCRIPT_NS}__action[data-tone="ghost"] {
        background: transparent;
        color: #5a6982;
      }

      #${TOAST_ID} {
        position: fixed;
        left: 50%;
        bottom: 28px;
        transform: translateX(-50%);
        z-index: 2147483647;
        max-width: min(600px, calc(100vw - 32px));
        padding: 13px 16px;
        border-radius: 16px;
        background: rgba(15, 24, 39, 0.92);
        color: #f8fafc;
        box-shadow: 0 16px 42px rgba(15, 24, 39, 0.28);
        font: 600 13px/1.4 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      }

      #${TOAST_ID}[data-tone="error"] {
        background: rgba(147, 35, 35, 0.94);
      }

      @media (max-width: 980px) {
        #${PANEL_ID} .${SCRIPT_NS}__meta,
        #${PANEL_ID} .${SCRIPT_NS}__layout,
        #${PANEL_ID} .${SCRIPT_NS}__form {
          grid-template-columns: 1fr;
        }

        #${PANEL_ID} .${SCRIPT_NS}__field[data-span="2"] {
          grid-column: span 1;
        }

        #${PANEL_ID} .${SCRIPT_NS}__dialog {
          width: calc(100vw - 20px);
          max-height: calc(100vh - 20px);
        }

        #${BUTTON_ID} {
          right: 16px;
          bottom: 16px;
          min-width: 154px;
          padding: 13px 16px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function bindRouteEvents() {
    if (routeBound) {
      return;
    }

    routeBound = true;
    const dispatch = () => window.dispatchEvent(new Event(ROUTE_EVENT));
    const { pushState, replaceState } = history;

    history.pushState = function (...args) {
      const result = pushState.apply(this, args);
      dispatch();
      return result;
    };

    history.replaceState = function (...args) {
      const result = replaceState.apply(this, args);
      dispatch();
      return result;
    };

    window.addEventListener("popstate", dispatch);
  }

  function syncFloatingButton() {
    const albumId = getAlbumIdFromLocation();
    const existing = document.getElementById(BUTTON_ID);

    if (!albumId) {
      existing?.remove();
      return;
    }

    if (existing) {
      return;
    }

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = BUTTON_LABEL;
    button.addEventListener("click", handleGenerateClick);
    document.body.appendChild(button);
  }

  async function handleGenerateClick() {
    const albumId = getAlbumIdFromLocation();
    if (!albumId) {
      showToast("当前页面看起来不是专辑页，没法生成 metadata.json。", true);
      return;
    }

    setButtonLoading(true, "抓取专辑信息中...");

    try {
      const [albumDoc, playlistPage] = await Promise.all([
        fetchAlbumDoc(albumId),
        fetchPlaylistPage(albumId).catch((error) => {
          console.warn(`[${SCRIPT_NS}] playlist fetch failed`, error);
          return null;
        }),
      ]);

      const draft = buildDraft(albumDoc, playlistPage);
      openEditor(draft, albumDoc, playlistPage, albumId);
      showToast("metadata 草稿已生成，建议先检查作者、演播、系列后再下载。");
    } catch (error) {
      console.error(`[${SCRIPT_NS}] generate failed`, error);
      showToast(`生成失败：${error.message || "未知错误"}`, true);
    } finally {
      setButtonLoading(false, BUTTON_LABEL);
    }
  }

  function setButtonLoading(loading, label) {
    const button = document.getElementById(BUTTON_ID);
    if (!button) {
      return;
    }

    button.disabled = Boolean(loading);
    button.textContent = label || BUTTON_LABEL;
  }

  function getAlbumIdFromLocation() {
    const match = location.pathname.match(/\/album\/(\d+)/);
    return match ? match[1] : "";
  }

  async function fetchAlbumDoc(albumId) {
    const params = new URLSearchParams({
      core: "album",
      kw: String(albumId),
      page: "1",
      spellchecker: "true",
      rows: "5",
      condition: "relation",
      device: "web",
    });
    const url = `https://www.ximalaya.com/revision/search?${params.toString()}`;
    const json = await requestJson(url);
    const docs = json?.data?.result?.response?.docs || [];

    const exactDoc =
      docs.find((doc) => String(doc?.id) === String(albumId)) ||
      docs.find((doc) => String(doc?.url || "").includes(`/album/${albumId}`));

    if (!exactDoc) {
      throw new Error("没有在搜索接口里匹配到当前专辑。");
    }

    return exactDoc;
  }

  async function fetchPlaylistPage(albumId) {
    const url = `https://mobwsa.ximalaya.com/mobile/playlist/album/page?albumId=${encodeURIComponent(
      albumId
    )}&pageId=1`;
    return requestJson(url);
  }

  async function requestJson(url) {
    if (typeof GM_xmlhttpRequest === "function") {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          headers: {
            Accept: "application/json, text/plain, */*",
          },
          onload(response) {
            try {
              if (response.status < 200 || response.status >= 300) {
                reject(new Error(`请求失败（${response.status}）`));
                return;
              }

              resolve(JSON.parse(response.responseText));
            } catch (error) {
              reject(new Error("接口返回不是合法 JSON。"));
            }
          },
          onerror() {
            reject(new Error("网络请求失败。"));
          },
          ontimeout() {
            reject(new Error("网络请求超时。"));
          },
        });
      });
    }

    const response = await fetch(url, {
      credentials: "include",
      headers: {
        Accept: "application/json, text/plain, */*",
      },
    });

    if (!response.ok) {
      throw new Error(`请求失败（${response.status}）`);
    }

    return response.json();
  }

  function buildDraft(albumDoc, playlistPage) {
    const rawTitle = normalizeWhitespace(albumDoc?.title || "");
    const cleanTitleValue = cleanTitle(rawTitle);
    const textSources = collectTextSources(albumDoc, playlistPage);
    const authors = extractAuthors(textSources);
    const narrators = extractNarrators(textSources).filter(
      (name) => !authors.includes(name)
    );
    const seriesGuess = inferSeries(rawTitle);
    const publishedYear = toYearString(albumDoc?.created_at);

    return {
      title: cleanTitleValue,
      subtitle: cleanSubtitle(albumDoc?.custom_title, cleanTitleValue),
      authors,
      narrators,
      seriesName: seriesGuess.name,
      seriesSequence: seriesGuess.sequence,
      publishedYear,
      genres: deriveGenres(albumDoc?.tags, albumDoc?.category_title),
      description: cleanDescription(albumDoc?.intro || ""),
      language: deriveLanguage(albumDoc),
      publisher: derivePublisher(albumDoc, narrators),
    };
  }

  function collectTextSources(albumDoc, playlistPage) {
    const texts = [
      albumDoc?.title,
      albumDoc?.custom_title,
      albumDoc?.intro,
      albumDoc?.tags,
      albumDoc?.nickname,
    ];

    const trackTitles = playlistPage?.list
      ?.slice(0, 6)
      .map((item) => item?.title)
      .filter(Boolean);

    return texts.concat(trackTitles || []).filter(Boolean).map(normalizeWhitespace);
  }

  function cleanTitle(rawTitle) {
    let title = normalizeWhitespace(rawTitle)
      .replace(/[《》]/g, "")
      .trim();

    if (/[|｜丨]/.test(title)) {
      title = title.split(/[|｜丨]/)[0].trim();
    }

    title = title
      .replace(
        /[（(【[][^）)\]】]*(有声书|有声小说|广播剧|多人剧|官方授权|全本|无删减|单播|完结版|珍藏版|典藏版)[^）)\]】]*[）)\]】]/gu,
        " "
      )
      .replace(/\s+/g, " ")
      .replace(/[|｜丨_\-]+$/g, "")
      .trim();

    return title || normalizeWhitespace(rawTitle);
  }

  function cleanSubtitle(customTitle, title) {
    const subtitle = normalizeWhitespace(customTitle || "");
    if (!subtitle) {
      return "";
    }

    if (subtitle === title) {
      return "";
    }

    if (subtitle.replace(/\s+/g, "") === (title || "").replace(/\s+/g, "")) {
      return "";
    }

    return subtitle;
  }

  function cleanDescription(text) {
    return normalizeWhitespace(
      String(text || "")
        .replace(/【购买须知】[\s\S]*$/u, "")
        .replace(/购买须知[\s\S]*$/u, "")
        .replace(/温馨提示[\s\S]*$/u, "")
    );
  }

  function deriveGenres(tagsText, categoryTitle) {
    const genres = [];
    const tags = String(tagsText || "")
      .split(",")
      .map((item) => normalizeWhitespace(item))
      .filter(Boolean);

    if (categoryTitle && !GENERIC_CATEGORY_GENRES.has(categoryTitle)) {
      genres.push(categoryTitle);
    }

    for (const tag of tags) {
      if (
        GENERIC_TAGS.has(tag) ||
        /\d/.test(tag) ||
        tag.length > 12 ||
        genres.includes(tag)
      ) {
        continue;
      }

      genres.push(tag);
      if (genres.length >= 5) {
        break;
      }
    }

    if (!genres.length && categoryTitle) {
      genres.push(categoryTitle);
    }

    return genres;
  }

  function deriveLanguage(albumDoc) {
    if (String(albumDoc?.category_title || "").includes("外语")) {
      return "";
    }
    return "zh";
  }

  function derivePublisher(albumDoc, narrators) {
    const nickname = normalizeWhitespace(albumDoc?.nickname || "");
    if (!nickname) {
      return "喜马拉雅";
    }

    if (narrators.includes(nickname) && !albumDoc?.is_v) {
      return "喜马拉雅";
    }

    return nickname;
  }

  function inferSeries(rawTitle) {
    const text = normalizeWhitespace(rawTitle || "");
    const patternA = text.match(
      /(.+?)(?:系列)?[：:\- ]*第\s*([0-9一二三四五六七八九十百千两]+)\s*(?:部|册|卷|季)/u
    );

    if (patternA) {
      return {
        name: cleanTitle(patternA[1]),
        sequence: normalizeSequence(patternA[2]),
      };
    }

    const patternB = text.match(
      /^第\s*([0-9一二三四五六七八九十百千两]+)\s*(?:部|册|卷|季)[：:\- ]*(.+)$/u
    );

    if (patternB) {
      return {
        name: "",
        sequence: normalizeSequence(patternB[1]),
      };
    }

    return { name: "", sequence: "" };
  }

  function normalizeSequence(value) {
    const token = normalizeWhitespace(value || "");
    if (!token) {
      return "";
    }
    if (/^\d+$/.test(token)) {
      return token;
    }

    const parsed = parseChineseNumber(token);
    return parsed ? String(parsed) : token;
  }

  function parseChineseNumber(text) {
    const digits = {
      零: 0,
      一: 1,
      二: 2,
      两: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      七: 7,
      八: 8,
      九: 9,
    };
    const units = { 十: 10, 百: 100, 千: 1000 };

    let total = 0;
    let current = 0;
    let hasValue = false;

    for (const char of text) {
      if (char in digits) {
        current = digits[char];
        hasValue = true;
        continue;
      }

      if (char in units) {
        const base = current || 1;
        total += base * units[char];
        current = 0;
        hasValue = true;
      }
    }

    return hasValue ? total + current : 0;
  }

  function extractAuthors(texts) {
    const patterns = [
      /([^|｜丨，,；;（）()【】]{2,30})原著/gu,
      /作者[:：]\s*([^|｜丨，,；;（）()【】]{2,30})/gu,
      /([^|｜丨，,；;（）()【】]{2,30})著(?:$|[|｜丨，,；;])/gu,
    ];
    return extractPeople(texts, patterns);
  }

  function extractNarrators(texts) {
    const patterns = [
      /演播[:：]\s*([^|｜丨，,；;（）()【】]{2,30})/gu,
      /播讲[:：]\s*([^|｜丨，,；;（）()【】]{2,30})/gu,
      /主播[:：]\s*([^|｜丨，,；;（）()【】]{2,30})/gu,
      /([^|｜丨，,；;（）()【】]{2,30})(?:单播|演播|播讲|主播)/gu,
    ];
    return extractPeople(texts, patterns);
  }

  function extractPeople(texts, patterns) {
    const people = [];

    for (const text of texts) {
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        let match = pattern.exec(text);

        while (match) {
          pushPersonCandidates(people, match[1]);
          match = pattern.exec(text);
        }
      }
    }

    return uniqueList(people);
  }

  function pushPersonCandidates(target, rawValue) {
    const candidates = String(rawValue || "")
      .split(/[、，,；;/＆&]/u)
      .map((item) => sanitizePersonName(item))
      .filter(Boolean);

    for (const candidate of candidates) {
      target.push(candidate);
    }
  }

  function sanitizePersonName(rawValue) {
    const value = normalizeWhitespace(rawValue || "")
      .replace(/^(作者|原著|著者|演播|播讲|主播|旁白|报幕)[:：]?\s*/u, "")
      .replace(/(原著|著者|著|演播|播讲|主播|旁白|单播)\s*$/u, "")
      .replace(/[《》"'“”]/g, "")
      .replace(/[()（）【】\[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!value || value.length < 2 || value.length > 24) {
      return "";
    }

    if (NOISY_PERSON_WORDS.some((word) => value.includes(word))) {
      return "";
    }

    return value;
  }

  function toYearString(timestamp) {
    if (!timestamp) {
      return "";
    }

    const date = new Date(Number(timestamp));
    const year = date.getFullYear();
    return Number.isFinite(year) ? String(year) : "";
  }

  function normalizeCoverUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) {
      return "";
    }

    const normalized = raw.startsWith("//") ? `https:${raw}` : raw;
    return normalized.replace(/!op_type=.*$/u, "");
  }

  function getTrackCount(playlistPage, albumDoc) {
    const totalCount = Number(playlistPage?.totalCount);
    if (Number.isFinite(totalCount) && totalCount > 0) {
      return totalCount;
    }

    const trackCount = Number(albumDoc?.tracks);
    return Number.isFinite(trackCount) && trackCount > 0 ? trackCount : 0;
  }

  function getRecommendedPadding(trackCount) {
    if (!trackCount || trackCount < 100) {
      return 2;
    }
    if (trackCount < 1000) {
      return 3;
    }
    return 4;
  }

  function normalizeWhitespace(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n/g, "\n")
      .replace(/\s*\n\s*/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  function uniqueList(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function openEditor(draft, albumDoc, playlistPage, albumId) {
    closeEditor();
    lockBodyScroll();

    const trackCount = getTrackCount(playlistPage, albumDoc);
    const recommendedPadding = getRecommendedPadding(trackCount);
    const coverUrl = normalizeCoverUrl(
      albumDoc?.cover_path || playlistPage?.list?.[0]?.coverLarge || playlistPage?.list?.[0]?.albumImage
    );

    const formState = {
      title: draft.title,
      subtitle: draft.subtitle,
      authors: draft.authors.join(", "),
      narrators: draft.narrators.join(", "),
      seriesName: draft.seriesName,
      seriesSequence: draft.seriesSequence,
      publishedYear: draft.publishedYear,
      genres: draft.genres.join(", "),
      description: draft.description,
      language: draft.language,
      publisher: draft.publisher,
    };
    const initialState = { ...formState };

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="${SCRIPT_NS}__backdrop" data-role="close"></div>
      <div class="${SCRIPT_NS}__dialog" role="dialog" aria-modal="true" aria-label="metadata 导出面板">
        <div class="${SCRIPT_NS}__header">
          <div>
            <h2 class="${SCRIPT_NS}__title">metadata.json 草稿</h2>
            <p class="${SCRIPT_NS}__subtitle">
              当前结构对齐 Audiobookshelf 常见整理方式。喜马拉雅没有稳定的作者 / 系列结构化字段，
              所以导出前最好手看一眼。
            </p>
          </div>
          <button class="${SCRIPT_NS}__close" type="button" data-role="close" aria-label="关闭">×</button>
        </div>

        <div class="${SCRIPT_NS}__body">
          <div class="${SCRIPT_NS}__meta">
            <div class="${SCRIPT_NS}__metaCard">
              <span class="${SCRIPT_NS}__metaLabel">Album ID</span>
              <div class="${SCRIPT_NS}__metaValue">${escapeHtml(albumId)}</div>
            </div>
            <div class="${SCRIPT_NS}__metaCard">
              <span class="${SCRIPT_NS}__metaLabel">原始标题</span>
              <div class="${SCRIPT_NS}__metaValue">${escapeHtml(albumDoc?.title || "")}</div>
            </div>
            <div class="${SCRIPT_NS}__metaCard">
              <span class="${SCRIPT_NS}__metaLabel">上传账号</span>
              <div class="${SCRIPT_NS}__metaValue">${escapeHtml(albumDoc?.nickname || "未知")}</div>
            </div>
            <div class="${SCRIPT_NS}__metaCard">
              <span class="${SCRIPT_NS}__metaLabel">分类</span>
              <div class="${SCRIPT_NS}__metaValue">${escapeHtml(albumDoc?.category_title || "未知")}</div>
            </div>
            <div class="${SCRIPT_NS}__metaCard">
              <span class="${SCRIPT_NS}__metaLabel">章节数</span>
              <div class="${SCRIPT_NS}__metaValue">${trackCount || "未获取"}</div>
            </div>
            <div class="${SCRIPT_NS}__metaCard">
              <span class="${SCRIPT_NS}__metaLabel">建议文件序号位数</span>
              <div class="${SCRIPT_NS}__metaValue">${trackCount ? recommendedPadding : "未计算"}</div>
            </div>
          </div>

          <div class="${SCRIPT_NS}__layout">
            <div class="${SCRIPT_NS}__card">
              <div class="${SCRIPT_NS}__cardHead">
                可编辑字段
                <span class="${SCRIPT_NS}__cardSub">逗号分隔可用于数组字段，例如作者、演播、分类。</span>
              </div>
              <form class="${SCRIPT_NS}__form">
                ${renderField("书名", "title", formState.title)}
                ${renderField("副标题", "subtitle", formState.subtitle)}
                ${renderField(
                  "作者",
                  "authors",
                  formState.authors,
                  "根据“原著 / 作者”关键词自动猜，猜不准时请你手改。"
                )}
                ${renderField(
                  "演播",
                  "narrators",
                  formState.narrators,
                  "优先从专辑标题和前几集章节名里的“演播 / 单播 / 播讲”提取。"
                )}
                ${renderField("系列名", "seriesName", formState.seriesName)}
                ${renderField("系列序号", "seriesSequence", formState.seriesSequence)}
                ${renderField(
                  "年份",
                  "publishedYear",
                  formState.publishedYear,
                  "默认取喜马拉雅专辑创建年份，不一定等于原书出版年份。"
                )}
                ${renderField("分类", "genres", formState.genres)}
                ${renderField("语言", "language", formState.language)}
                ${renderField(
                  "出版社 / 出品方",
                  "publisher",
                  formState.publisher,
                  "默认优先取上传账号名，其次回退为喜马拉雅。"
                )}
                ${renderField(
                  "简介",
                  "description",
                  formState.description,
                  "已自动裁掉“购买须知”一类尾部说明；如果简介还带宣传语，直接手改即可。",
                  true
                )}
              </form>
            </div>

            <div class="${SCRIPT_NS}__card ${SCRIPT_NS}__previewWrap">
              <div class="${SCRIPT_NS}__cardHead">
                metadata.json 预览
                <span class="${SCRIPT_NS}__cardSub">封面来源：${escapeHtml(coverUrl || "未拿到封面地址")}</span>
              </div>
              <pre class="${SCRIPT_NS}__preview"></pre>
              <div class="${SCRIPT_NS}__actions">
                <button class="${SCRIPT_NS}__action" type="button" data-action="download" data-tone="primary">下载 metadata.json</button>
                <button class="${SCRIPT_NS}__action" type="button" data-action="copy" data-tone="secondary">复制 JSON</button>
                <button class="${SCRIPT_NS}__action" type="button" data-action="reset" data-tone="secondary">恢复抓取结果</button>
                <button class="${SCRIPT_NS}__action" type="button" data-role="close" data-tone="ghost">关闭</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    const form = panel.querySelector("form");
    const preview = panel.querySelector(`.${SCRIPT_NS}__preview`);
    const escapeHandler = (event) => {
      if (event.key === "Escape") {
        closeEditor();
      }
    };

    function syncPreview() {
      const state = readFormState(form);
      const metadata = buildMetadataObject(state);
      preview.textContent = JSON.stringify(metadata, null, 2);
      return preview.textContent;
    }

    form.addEventListener("input", syncPreview);
    document.addEventListener("keydown", escapeHandler);

    panel.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const role = target.dataset.role;
      const action = target.dataset.action;

      if (role === "close") {
        closeEditor();
        return;
      }

      if (action === "reset") {
        applyFormState(form, initialState);
        syncPreview();
        showToast("已恢复为自动抓取结果。");
        return;
      }

      if (action === "copy") {
        const content = syncPreview();
        await copyToClipboard(content);
        showToast("JSON 已复制到剪贴板。");
        return;
      }

      if (action === "download") {
        const content = syncPreview();
        downloadTextFile("metadata.json", content);
        showToast("metadata.json 已开始下载。");
      }
    });

    panel.dataset.boundEscape = "true";
    panel.dataset.escapeListenerKey = "true";
    panel._escapeHandler = escapeHandler;

    syncPreview();
  }

  function renderField(label, name, value, hint = "", multiline = false) {
    const input = multiline
      ? `<textarea name="${escapeHtml(name)}">${escapeHtml(value)}</textarea>`
      : `<input name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`;

    return `
      <div class="${SCRIPT_NS}__field" data-span="${multiline ? "2" : "1"}">
        <label class="${SCRIPT_NS}__label" for="">${escapeHtml(label)}</label>
        ${input}
        ${hint ? `<div class="${SCRIPT_NS}__hint">${escapeHtml(hint)}</div>` : ""}
      </div>
    `;
  }

  function readFormState(form) {
    const formData = new FormData(form);
    return {
      title: normalizeWhitespace(formData.get("title")),
      subtitle: normalizeWhitespace(formData.get("subtitle")),
      authors: normalizeWhitespace(formData.get("authors")),
      narrators: normalizeWhitespace(formData.get("narrators")),
      seriesName: normalizeWhitespace(formData.get("seriesName")),
      seriesSequence: normalizeWhitespace(formData.get("seriesSequence")),
      publishedYear: normalizeWhitespace(formData.get("publishedYear")),
      genres: normalizeWhitespace(formData.get("genres")),
      description: normalizeWhitespace(formData.get("description")),
      language: normalizeWhitespace(formData.get("language")),
      publisher: normalizeWhitespace(formData.get("publisher")),
    };
  }

  function applyFormState(form, state) {
    for (const [key, value] of Object.entries(state)) {
      const field = form.elements.namedItem(key);
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
        field.value = value;
      }
    }
  }

  function buildMetadataObject(state) {
    const seriesEntry =
      state.seriesName || state.seriesSequence
        ? [
            {
              name: state.seriesName,
              sequence: state.seriesSequence,
            },
          ]
        : [];

    return {
      title: state.title,
      subtitle: state.subtitle,
      authors: parseListField(state.authors),
      narrators: parseListField(state.narrators),
      series: seriesEntry,
      publishedYear: state.publishedYear,
      genres: parseListField(state.genres),
      description: state.description,
      language: state.language,
      publisher: state.publisher,
    };
  }

  function parseListField(value) {
    return uniqueList(
      String(value || "")
        .split(/[、，,；;]/u)
        .map((item) => normalizeWhitespace(item))
        .filter(Boolean)
    );
  }

  async function copyToClipboard(text) {
    if (typeof GM_setClipboard === "function") {
      GM_setClipboard(text, "text");
      return;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  function downloadTextFile(filename, content) {
    const blob = new Blob([content], { type: "application/json;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
  }

  function closeEditor() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) {
      return;
    }

    const escapeHandler = panel._escapeHandler;
    if (escapeHandler) {
      document.removeEventListener("keydown", escapeHandler);
    }

    panel.remove();
    unlockBodyScroll();
  }

  function lockBodyScroll() {
    bodyOverflowCache = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }

  function unlockBodyScroll() {
    document.body.style.overflow = bodyOverflowCache;
  }

  function showToast(message, isError = false) {
    document.getElementById(TOAST_ID)?.remove();

    const toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.dataset.tone = isError ? "error" : "info";
    toast.textContent = message;
    document.body.appendChild(toast);

    window.setTimeout(() => {
      toast.remove();
    }, 2600);
  }
})();
