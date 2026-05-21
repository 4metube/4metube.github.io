import {
  ensureDefaults,
  registerServiceWorker,
  getActiveList,
  getListName,
  readList,
  getAutoNext,
  extractYouTubeId,
  getReturnPage,
} from "./store.js";

ensureDefaults();
registerServiceWorker();

const activeList = getActiveList();
const items = readList(activeList);

const watchInfo = document.getElementById("watchInfo");
const tapToPlay = document.getElementById("tapToPlay");

let player = null;
let currentIndex = getStartIndex();
let ready = false;

function getStartIndex() {
  const params = new URLSearchParams(location.search);
  const idx = Number(params.get("idx") || "0");

  if (!Number.isInteger(idx)) return 0;
  if (idx < 0) return 0;
  if (idx >= items.length) return Math.max(0, items.length - 1);

  return idx;
}

function showInfo(text) {
  if (watchInfo) watchInfo.textContent = text || "";
}

function currentItem() {
  return items[currentIndex] || null;
}

function currentVideoId() {
  return extractYouTubeId(currentItem()?.url || "");
}

function updateInfo() {
  const item = currentItem();

  if (!item) {
    showInfo("저장된 영상이 없습니다.");
    return;
  }

  const title = item.title || "(제목 없음)";
  showInfo(`${getListName(activeList)} · ${currentIndex + 1}/${items.length} · ${title}`);
}

function loadCurrentVideo() {
  const id = currentVideoId();

  updateInfo();

  if (!id) {
    showInfo("재생할 수 없는 URL입니다.");
    return;
  }

  if (!player || !ready) return;

  try {
    player.loadVideoById(id);
    setTimeout(() => {
      try {
        player.playVideo();
      } catch {}
    }, 250);
  } catch {
    tapToPlay.classList.remove("hidden");
  }
}

function goNext() {
  if (currentIndex >= items.length - 1) {
    updateInfo();
    return;
  }

  currentIndex += 1;
  history.replaceState(null, "", `watch.html?idx=${currentIndex}`);
  loadCurrentVideo();
}

function goPrev() {
  if (currentIndex <= 0) {
    updateInfo();
    return;
  }

  currentIndex -= 1;
  history.replaceState(null, "", `watch.html?idx=${currentIndex}`);
  loadCurrentVideo();
}

window.onYouTubeIframeAPIReady = function () {
  if (!items.length) {
    showInfo("저장된 영상이 없습니다.");
    tapToPlay.classList.add("hidden");
    return;
  }

  const firstId = currentVideoId();

  player = new YT.Player("ytPlayer", {
    width: "100%",
    height: "100%",
    videoId: firstId,
    playerVars: {
      autoplay: 1,
      playsinline: 1,
      rel: 0,
      modestbranding: 1,
      controls: 1,
    },
    events: {
      onReady: () => {
        ready = true;
        updateInfo();

        try {
          player.playVideo();
          tapToPlay.classList.remove("hidden");
        } catch {
          tapToPlay.classList.remove("hidden");
        }
      },
      onStateChange: (event) => {
        if (event.data === YT.PlayerState.PLAYING) {
          tapToPlay.classList.add("hidden");
        }

        if (event.data === YT.PlayerState.ENDED && getAutoNext()) {
          goNext();
        }
      },
      onError: () => {
        tapToPlay.classList.remove("hidden");
        showInfo("영상을 재생할 수 없습니다. 위로 스와이프하면 다음 영상으로 이동합니다.");
      },
    },
  });
};

tapToPlay.addEventListener("click", () => {
  if (!player) return;

  try {
    player.unMute?.();
    player.playVideo();
    tapToPlay.classList.add("hidden");
  } catch {
    tapToPlay.classList.remove("hidden");
  }
});

/* 위로 스와이프 = 다음 / 아래로 스와이프 = 이전 */
let sy = 0;
let sx = 0;
let startTime = 0;

function point(e) {
  return e.touches?.[0] || e.changedTouches?.[0] || e;
}

document.addEventListener("touchstart", (e) => {
  const p = point(e);
  sx = p.clientX;
  sy = p.clientY;
  startTime = Date.now();
}, { passive: true });

document.addEventListener("touchend", (e) => {
  const p = point(e);
  const dx = p.clientX - sx;
  const dy = p.clientY - sy;
  const dt = Date.now() - startTime;

  if (dt > 800) return;
  if (Math.abs(dx) > 90) return;
  if (Math.abs(dy) < 70) return;

  if (dy < 0) {
    goNext();
  } else {
    goPrev();
  }
}, { passive: true });

/* 키보드 보조 */
document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp" || e.key === "ArrowRight") {
    goNext();
  } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
    goPrev();
  } else if (e.key === "Escape") {
    location.href = getReturnPage();
  }
});

/* 안드로이드/브라우저 뒤로가기 보강 */
(function setupBackGuard() {
  const returnPage = getReturnPage();

  history.replaceState({ page: "watch" }, "", location.href);
  history.pushState({ page: "watch-guard" }, "", location.href);

  window.addEventListener("popstate", () => {
    location.replace(returnPage);
  });
})();

updateInfo();
