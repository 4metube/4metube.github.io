import {
  initializeAppData,
  registerServiceWorker,
  getActiveList,
  setActiveList,
  getListKeys,
  getListName,
  readList,
  getAutoNext,
  setAutoNext,
  setReturnPage,
  initPageSwipe,
  goWithSlide,
} from "./store.js";

await initializeAppData();
registerServiceWorker();

const msg = document.getElementById("msg");
const btnPlay = document.getElementById("btnPlay");
const btnGoList = document.getElementById("btnGoList");
const btnGoSetting = document.getElementById("btnGoSetting");
const autoNextToggle = document.getElementById("autoNextToggle");
const listButtons = Array.from(document.querySelectorAll(".list-toggle"));

function setMsg(text) {
  if (msg) msg.textContent = text || "";
}

function renderListButtons() {
  const active = getActiveList();

  for (const btn of listButtons) {
    const key = btn.dataset.list;
    btn.textContent = getListName(key);
    btn.classList.toggle("active", key === active);
    btn.setAttribute("aria-pressed", key === active ? "true" : "false");
  }
}

for (const btn of listButtons) {
  btn.addEventListener("click", () => {
    const key = btn.dataset.list;
    if (!getListKeys().includes(key)) return;

    setActiveList(key);
    renderListButtons();

    const count = readList(key).length;
    setMsg(`${getListName(key)} 선택됨 · ${count}개 영상`);
  });
}

autoNextToggle.checked = getAutoNext();
autoNextToggle.addEventListener("change", () => {
  setAutoNext(autoNextToggle.checked);
});

btnPlay.addEventListener("click", () => {
  const active = getActiveList();
  const list = readList(active);

  if (!list.length) {
    setMsg("저장된 영상이 없습니다. Setting에서 URL을 먼저 등록하세요.");
    return;
  }

  setReturnPage("index.html");
  location.href = "watch.html?idx=0";
});

btnGoList.addEventListener("click", () => {
  goWithSlide("list.html", "right");
});

btnGoSetting.addEventListener("click", () => {
  goWithSlide("setting.html", "left");
});

document.getElementById("logoHome")?.addEventListener("click", () => {
  location.href = "index.html";
});

renderListButtons();

const initialCount = readList(getActiveList()).length;
setMsg(`${getListName(getActiveList())} · ${initialCount}개 영상`);

initPageSwipe({
  leftHref: "setting.html",
  rightHref: "list.html",
});
