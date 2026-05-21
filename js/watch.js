import {
  ensureDefaults,
  registerServiceWorker,
  getActiveList,
  readList,
  getAutoNext,
  extractYouTubeId,
  getReturnPage,
} from "./store.js";

ensureDefaults();
registerServiceWorker();

/* ---------- viewport fix: CopyTube 방식 ---------- */
function updateVh() {
  document.documentElement.style.setProperty("--app-vh", `${window.innerHeight}px`);
}

updateVh();
window.addEventListener("resize", updateVh, { passive: true });
window.addEventListener("orientationchange", updateVh, { passive: true });

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", updateVh, { passive: true });
}

/* ---------- Samsung Internet 보정 ---------- */
const isSamsungInternet = /SamsungBrowser/i.test(navigator.userAgent);

if (isSamsungInternet) {
  document.documentElement.classList.add("ua-sbrowser");
}

function updateSnapHeightForSamsung() {
  if (!isSamsungInternet) return;

  const vc = document.getElementById("videoContainer");
  if (!vc) return;

  const h = vc.clientHeight;
  document.documentElement.style.setProperty("--snap-h", `${h}px`);
}

updateSnapHeightForSamsung();
window.addEventListener("resize", updateSnapHeightForSamsung, { passive: true });
window.addEventListener("orientationchange", updateSnapHeightForSamsung, { passive: true });

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", updateSnapHeightForSamsung, { passive: true });
}

/* ---------- DOM / data ---------- */
const videoContainer = document.getElementById("videoContainer");

const activeList = getActiveList();
const items = readList(activeList);

let currentActive = null;
let userSoundConsent = false;
let AUTO_NEXT = getAutoNext();

const winToCard = new Map();
const YT_ID_SAFE = /^[a-zA-Z0-9_-]{6,20}$/;

/* ---------- URL / params ---------- */
function getParam(name) {
  try {
    return new URL(location.href).searchParams.get(name);
  } catch {
    return null;
  }
}

function getStartIndex() {
  const raw = Number(getParam("idx") || "0");

  if (!Number.isInteger(raw)) return 0;
  if (raw < 0) return 0;
  if (raw >= items.length) return Math.max(0, items.length - 1);

  return raw;
}

function safeExtractYouTubeId(url) {
  const id = extractYouTubeId(url);
  return YT_ID_SAFE.test(id) ? id : "";
}

/* ---------- YouTube postMessage control ---------- */
function ytCmd(iframe, func, args = []) {
  if (!iframe?.contentWindow) return;

  iframe.contentWindow.postMessage(
    JSON.stringify({
      event: "command",
      func,
      args,
    }),
    "*"
  );
}

function applyAudioPolicy(iframe) {
  if (!iframe) return;

  if (userSoundConsent) {
    ytCmd(iframe, "setVolume", [100]);
    ytCmd(iframe, "unMute");
  } else {
    ytCmd(iframe, "mute");
  }
}

function grantSoundFromCard() {
  userSoundConsent = true;

  document.querySelectorAll(".gesture-capture").forEach((el) => {
    el.classList.add("hidden");
  });

  document.querySelectorAll(".sound-tip").forEach((el) => {
    el.classList.add("hidden");
  });

  const iframe = currentActive?.querySelector("iframe");

  if (iframe) {
    ytCmd(iframe, "setVolume", [100]);
    ytCmd(iframe, "unMute");
    ytCmd(iframe, "playVideo");
  }
}

/* ---------- player events ---------- */
window.addEventListener("message", (e) => {
  if (typeof e.data !== "string") return;

  let data;

  try {
    data = JSON.parse(e.data);
  } catch {
    return;
  }

  if (!data?.event) return;

  if (data.event === "onReady") {
    const card = winToCard.get(e.source);
    if (!card) return;

    const iframe = card.querySelector("iframe");
    if (!iframe) return;

    if (card === currentActive) {
      applyAudioPolicy(iframe);
      ytCmd(iframe, "playVideo");
    } else {
      ytCmd(iframe, "mute");
      ytCmd(iframe, "pauseVideo");
    }

    return;
  }

  if (data.event === "onStateChange" && data.info === 0) {
    const card = winToCard.get(e.source);
    if (!card) return;

    const activeIframe = currentActive?.querySelector("iframe");

    if (activeIframe && e.source === activeIframe.contentWindow && AUTO_NEXT) {
      goToNextCard();
    }
  }
}, false);

/* ---------- card creation ---------- */
function makeInfoRow(text) {
  const row = document.createElement("div");
  row.className = "empty-row";
  row.textContent = text;
  return row;
}

function makeCard(item, index) {
  const id = safeExtractYouTubeId(item?.url || "");
  if (!id) return null;

  const card = document.createElement("section");
  card.className = "video";
  card.dataset.vid = id;
  card.dataset.index = String(index);
  card.dataset.url = item.url || "";

  const thumb = document.createElement("div");
  thumb.className = "thumb";

  const img = document.createElement("img");
  img.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  img.alt = item.title || "thumbnail";
  img.loading = "lazy";
  thumb.appendChild(img);

  const hint = document.createElement("div");
  hint.className = "playhint";
  hint.textContent = "위로 스와이프 · 아래로 이전";
  thumb.appendChild(hint);

  card.appendChild(thumb);

  const soundTip = document.createElement("div");
  soundTip.className = `sound-tip ${userSoundConsent ? "hidden" : ""}`;
  soundTip.textContent = "탭하면 소리 허용";
  card.appendChild(soundTip);

  const gesture = document.createElement("div");
  gesture.className = `gesture-capture ${userSoundConsent ? "hidden" : ""}`;
  gesture.setAttribute("aria-label", "tap to enable sound");
  gesture.addEventListener("pointerdown", grantSoundFromCard, { passive: true });
  card.appendChild(gesture);

  activeIO.observe(card);

  return card;
}

function ensureIframe(card, preload = false) {
  if (!card || card.querySelector("iframe")) return;

  const id = card.dataset.vid;
  if (!YT_ID_SAFE.test(id)) return;

  const origin = encodeURIComponent(location.origin);
  const playerId = `yt-${id}-${Math.random().toString(36).slice(2, 8)}`;

  const iframe = document.createElement("iframe");
  iframe.id = playerId;
  iframe.src =
    `https://www.youtube.com/embed/${id}` +
    `?enablejsapi=1` +
    `&playsinline=1` +
    `&autoplay=1` +
    `&mute=1` +
    `&rel=0` +
    `&controls=1` +
    `&modestbranding=1` +
    `&origin=${origin}` +
    `&widget_referrer=${encodeURIComponent(location.href)}` +
    `&playerapiid=${encodeURIComponent(playerId)}`;

  iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
  iframe.allowFullscreen = true;
  iframe.setAttribute("allowfullscreen", "");
  iframe.setAttribute("title", "YouTube video player");

  iframe.addEventListener("load", () => {
    try {
      iframe.contentWindow.postMessage(
        JSON.stringify({
          event: "listening",
          id: playerId,
        }),
        "*"
      );

      ytCmd(iframe, "addEventListener", ["onReady"]);
      ytCmd(iframe, "addEventListener", ["onStateChange"]);

      winToCard.set(iframe.contentWindow, card);

      if (preload) {
        ytCmd(iframe, "mute");
        ytCmd(iframe, "pauseVideo");
      }
    } catch {}
  });

  const thumb = card.querySelector(".thumb");

  if (thumb) {
    card.replaceChild(iframe, thumb);
  } else {
    card.appendChild(iframe);
  }
}

/* ---------- IntersectionObserver: 현재 영상만 재생 ---------- */
const activeIO = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    const card = entry.target;
    const iframe = card.querySelector("iframe");

    if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
      if (currentActive && currentActive !== card) {
        const prev = currentActive.querySelector("iframe");

        if (prev) {
          ytCmd(prev, "mute");
          ytCmd(prev, "pauseVideo");
        }
      }

      currentActive = card;
      ensureIframe(card);

      const currentIframe = card.querySelector("iframe");

      if (currentIframe) {
        applyAudioPolicy(currentIframe);
        ytCmd(currentIframe, "playVideo");
      }

      const index = Number(card.dataset.index || "0");
      sessionStorage.setItem("4metube:playIndex", String(index));

      try {
        history.replaceState(history.state, "", `watch.html?idx=${index}`);
      } catch {}

      const next = card.nextElementSibling;
      if (next && next.classList.contains("video")) {
        ensureIframe(next, true);
      }

      const prev = card.previousElementSibling;
      if (prev && prev.classList.contains("video")) {
        ensureIframe(prev, true);
      }
    } else {
      if (iframe) {
        ytCmd(iframe, "mute");
        ytCmd(iframe, "pauseVideo");
      }
    }
  });
}, {
  root: videoContainer,
  threshold: [0, 0.6, 1],
});

/* ---------- movement ---------- */
function getCurrentIndex() {
  if (!currentActive) return getStartIndex();

  const idx = Number(currentActive.dataset.index || "0");
  return Number.isInteger(idx) ? idx : 0;
}

function scrollToIndex(index, behavior = "smooth") {
  const cards = Array.from(videoContainer.querySelectorAll(".video"));
  const target = cards[index];

  if (!target) return;

  target.scrollIntoView({
    behavior,
    block: "start",
  });
}

function goToNextCard() {
  const idx = getCurrentIndex();

  if (idx >= items.length - 1) return;

  scrollToIndex(idx + 1, "smooth");
}

function goToPrevCard() {
  const idx = getCurrentIndex();

  if (idx <= 0) return;

  scrollToIndex(idx - 1, "smooth");
}

/* ---------- keyboard helper ---------- */
window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp" || e.key === "ArrowRight") {
    goToNextCard();
  } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
    goToPrevCard();
  } else if (e.key === "Escape") {
    location.href = getReturnPage();
  }
});

/* ---------- browser/android back guard ---------- */
function setupBackGuard() {
  const returnPage = getReturnPage();

  try {
    history.replaceState({ page: "watch-base" }, "", location.href);
    history.pushState({ page: "watch-guard" }, "", location.href);

    window.addEventListener("popstate", () => {
      location.replace(returnPage);
    });
  } catch {}
}

/* ---------- start ---------- */
function renderFeed() {
  videoContainer.replaceChildren();

  if (!items.length) {
    videoContainer.appendChild(
      makeInfoRow("저장된 영상이 없습니다. Setting에서 URL을 먼저 등록하세요.")
    );
    return;
  }

  const frag = document.createDocumentFragment();

  items.forEach((item, index) => {
    const card = makeCard(item, index);

    if (card) {
      frag.appendChild(card);
    }
  });

  if (!frag.childNodes.length) {
    videoContainer.appendChild(
      makeInfoRow("재생 가능한 YouTube URL이 없습니다.")
    );
    return;
  }

  videoContainer.appendChild(frag);
}

function startAtInitialIndex() {
  const startIndex = getStartIndex();

  requestAnimationFrame(() => {
    scrollToIndex(startIndex, "auto");

    const cards = Array.from(videoContainer.querySelectorAll(".video"));
    const target = cards[startIndex];

    if (target) {
      currentActive = target;
      ensureIframe(target);
    }

    updateSnapHeightForSamsung();
  });
}

window.addEventListener("storage", (e) => {
  if (e.key === "4metube:autonext") {
    AUTO_NEXT = getAutoNext();
  }
});

renderFeed();
setupBackGuard();
startAtInitialIndex();
