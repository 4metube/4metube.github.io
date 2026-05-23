const LIST_KEYS = ["list1", "list2", "list3"];

const PRESET_VERSION = "v2";
const PRESET_FILE = "./presetlist.txt";
const PRESET_TARGET_LIST = "list3";
const PRESET_TARGET_NAME = "스트레칭";

const KEYS = {
  activeList: "4metube:activeList",
  listNames: "4metube:listNames",
  autoNext: "4metube:autonext",
  returnPage: "4metube:returnPage",
  presetApplied: `4metube:presetApplied:${PRESET_VERSION}`,
};

const defaultNames = {
  list1: "List1",
  list2: "List2",
  list3: "List3",
};

export function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
}

export function ensureDefaults() {
  if (!LIST_KEYS.includes(localStorage.getItem(KEYS.activeList))) {
    localStorage.setItem(KEYS.activeList, "list1");
  }

  const names = getListNames();
  let changed = false;

  for (const key of LIST_KEYS) {
    if (!names[key]) {
      names[key] = defaultNames[key];
      changed = true;
    }

    const listKey = listStorageKey(key);
    const preKey = prelistStorageKey(key);

    if (!localStorage.getItem(listKey)) {
      localStorage.setItem(listKey, JSON.stringify([]));
    }
    if (!localStorage.getItem(preKey)) {
      localStorage.setItem(preKey, JSON.stringify([]));
    }
  }

  if (changed) {
    localStorage.setItem(KEYS.listNames, JSON.stringify(names));
  }

  if (!localStorage.getItem(KEYS.autoNext)) {
    localStorage.setItem(KEYS.autoNext, "1");
  }
}

export async function initializeAppData() {
  ensureDefaults();
  await applyPresetListOnce();
}

export async function applyPresetListOnce() {
  // 이미 preset을 적용한 적이 있으면 다시 적용하지 않음
  if (localStorage.getItem(KEYS.presetApplied) === "1") {
    return false;
  }

  // 사용자가 이미 list1에 영상을 넣은 상태라면 절대 덮어쓰지 않음
  const currentPresetList = readList(PRESET_TARGET_LIST);
  if (currentPresetList.length > 0) {
    localStorage.setItem(KEYS.presetApplied, "1");
    return false;
  }

  let text = "";

  try {
    const res = await fetch(PRESET_FILE, { cache: "no-cache" });
    if (!res.ok) return false;
    text = await res.text();
  } catch {
    return false;
  }

  const urls = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => normalizeYouTubeUrl(line))
    .filter(Boolean);

  const uniqueUrls = [...new Set(urls)];

  if (!uniqueUrls.length) {
    return false;
  }

  const presetItems = await Promise.all(
    uniqueUrls.map(async (url) => {
      const title = await fetchYouTubeTitle(url);
      return {
        url,
        title,
      };
    })
  );

  // 최초 preset은 사용자의 이전 목록을 백업할 필요가 없으므로 backup:false
  writeList(PRESET_TARGET_LIST, presetItems, { backup: false });

  // list1 이름도 최초 1회만 "스트레칭"으로 변경
  setListName(PRESET_TARGET_LIST, PRESET_TARGET_NAME);

  // 이후 앱 실행 때 다시 presetlist.txt로 덮어쓰지 않게 표시
  localStorage.setItem(KEYS.presetApplied, "1");

  return true;
}

export function listStorageKey(listKey) {
  return `4metube:list:${listKey}`;
}

export function prelistStorageKey(listKey) {
  return `4metube:prelist:${listKey}`;
}

export function getListKeys() {
  return LIST_KEYS.slice();
}

export function getActiveList() {
  const value = localStorage.getItem(KEYS.activeList);
  return LIST_KEYS.includes(value) ? value : "list1";
}

export function setActiveList(listKey) {
  const safe = LIST_KEYS.includes(listKey) ? listKey : "list1";
  localStorage.setItem(KEYS.activeList, safe);
  return safe;
}

export function getListNames() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEYS.listNames) || "{}");
    return { ...defaultNames, ...(parsed && typeof parsed === "object" ? parsed : {}) };
  } catch {
    return { ...defaultNames };
  }
}

export function getListName(listKey = getActiveList()) {
  return getListNames()[listKey] || defaultNames[listKey] || "List";
}

export function setListName(listKey, name) {
  const safeKey = LIST_KEYS.includes(listKey) ? listKey : "list1";
  const clean = String(name || "").trim().slice(0, 20) || defaultNames[safeKey];

  const names = getListNames();
  names[safeKey] = clean;
  localStorage.setItem(KEYS.listNames, JSON.stringify(names));

  return clean;
}

export function readList(listKey = getActiveList()) {
  try {
    const parsed = JSON.parse(localStorage.getItem(listStorageKey(listKey)) || "[]");
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(normalizeItem)
      .filter((item) => item.url);
  } catch {
    return [];
  }
}

export function readPrelist(listKey = getActiveList()) {
  try {
    const parsed = JSON.parse(localStorage.getItem(prelistStorageKey(listKey)) || "[]");
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(normalizeItem)
      .filter((item) => item.url);
  } catch {
    return [];
  }
}

export function writeList(listKey, items, options = {}) {
  const safeKey = LIST_KEYS.includes(listKey) ? listKey : getActiveList();
  const backup = options.backup !== false;

  if (backup) {
    const current = readList(safeKey);
    localStorage.setItem(prelistStorageKey(safeKey), JSON.stringify(current));
  }

  const clean = Array.isArray(items)
    ? items.map(normalizeItem).filter((item) => item.url)
    : [];

  localStorage.setItem(listStorageKey(safeKey), JSON.stringify(clean));
  return clean;
}

export function swapWithPrelist(listKey = getActiveList()) {
  const safeKey = LIST_KEYS.includes(listKey) ? listKey : getActiveList();

  const cur = readList(safeKey);
  const pre = readPrelist(safeKey);

  localStorage.setItem(listStorageKey(safeKey), JSON.stringify(pre));
  localStorage.setItem(prelistStorageKey(safeKey), JSON.stringify(cur));

  return pre;
}

export function normalizeItem(item) {
  if (typeof item === "string") {
    return { url: normalizeYouTubeUrl(item), title: "" };
  }

  return {
    url: normalizeYouTubeUrl(item?.url || ""),
    title: String(item?.title || "").trim().slice(0, 200),
  };
}

export function getAutoNext() {
  const v = localStorage.getItem(KEYS.autoNext);
  return v === "1" || v === "true" || v === "on";
}

export function setAutoNext(on) {
  localStorage.setItem(KEYS.autoNext, on ? "1" : "0");
}

export function setReturnPage(page) {
  sessionStorage.setItem(KEYS.returnPage, page || "index.html");
}

export function getReturnPage() {
  return sessionStorage.getItem(KEYS.returnPage) || "index.html";
}

export function normalizeYouTubeUrl(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";

  if (/^(www\.)?youtube\.com/i.test(s) || /^youtu\.be/i.test(s)) {
    s = "https://" + s;
  }

  try {
    const url = new URL(s);
    if (url.protocol !== "https:") return "";

    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const id = extractYouTubeId(url.toString());

    if (!id) return "";

    if (host === "youtu.be") {
      return `https://youtu.be/${id}`;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      return `https://www.youtube.com/watch?v=${id}`;
    }

    return "";
  } catch {
    return "";
  }
}

export function extractYouTubeId(url) {
  const s = String(url || "").trim();

  let m = s.match(/youtu\.be\/([a-zA-Z0-9_-]{6,20})/i);
  if (m) return m[1];

  m = s.match(/[?&]v=([a-zA-Z0-9_-]{6,20})/i);
  if (m) return m[1];

  m = s.match(/\/shorts\/([a-zA-Z0-9_-]{6,20})/i);
  if (m) return m[1];

  m = s.match(/\/embed\/([a-zA-Z0-9_-]{6,20})/i);
  if (m) return m[1];

  m = s.match(/\/live\/([a-zA-Z0-9_-]{6,20})/i);
  if (m) return m[1];

  return "";
}

export function thumbnailUrl(url) {
  const id = extractYouTubeId(url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : "";
}

export async function fetchYouTubeTitle(url) {
  const id = extractYouTubeId(url);
  if (!id) return "";

  const cacheKey = `4metube:title:${id}`;

  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
    if (cached?.title && cached?.expires > Date.now()) {
      return cached.title;
    }
  } catch {}

  try {
    const oembedUrl =
      "https://www.youtube.com/oembed?format=json&url=" +
      encodeURIComponent(`https://www.youtube.com/watch?v=${id}`);

    const res = await fetch(oembedUrl);
    if (!res.ok) throw new Error("oEmbed failed");

    const data = await res.json();
    const title = String(data?.title || "").trim().slice(0, 200);

    if (title) {
      localStorage.setItem(
        cacheKey,
        JSON.stringify({
          title,
          expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        })
      );
    }

    return title;
  } catch {
    return "";
  }
}

export function goWithSlide(href, direction = "left") {
  document.body.classList.add(direction === "right" ? "page-slide-right" : "page-slide-left");
  setTimeout(() => {
    location.href = href;
  }, 180);
}

export function initPageSwipe({ leftHref = null, rightHref = null } = {}) {
  let sx = 0;
  let sy = 0;
  let startTime = 0;
  let tracking = false;

  const thresholdX = 68;
  const maxY = 85;
  const maxTime = 700;

  const isInteractive = (target) => {
    return !!target?.closest?.("button,input,textarea,select,a,label,[contenteditable='true']");
  };

  function point(e) {
    return e.touches?.[0] || e.changedTouches?.[0] || e;
  }

  function start(e) {
    if (isInteractive(e.target)) return;

    const p = point(e);
    sx = p.clientX;
    sy = p.clientY;
    startTime = Date.now();
    tracking = true;
  }

  function end(e) {
    if (!tracking) return;
    tracking = false;

    const p = point(e);
    const dx = p.clientX - sx;
    const dy = p.clientY - sy;
    const dt = Date.now() - startTime;

    if (Math.abs(dy) > maxY || dt > maxTime) return;

    if (dx <= -thresholdX && leftHref) {
      goWithSlide(leftHref, "left");
    } else if (dx >= thresholdX && rightHref) {
      goWithSlide(rightHref, "right");
    }
  }

  document.addEventListener("touchstart", start, { passive: true });
  document.addEventListener("touchend", end, { passive: true });
  document.addEventListener("pointerdown", start, { passive: true });
  document.addEventListener("pointerup", end, { passive: true });
}
