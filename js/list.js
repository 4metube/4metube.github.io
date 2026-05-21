import {
  ensureDefaults,
  registerServiceWorker,
  getActiveList,
  getListName,
  readList,
  thumbnailUrl,
  setReturnPage,
  initPageSwipe,
} from "./store.js";

ensureDefaults();
registerServiceWorker();

const activeList = getActiveList();
const listTitle = document.getElementById("listTitle");
const cards = document.getElementById("cards");
const msg = document.getElementById("msg");

function setMsg(text) {
  if (msg) msg.textContent = text || "";
}

function render() {
  const items = readList(activeList);
  listTitle.textContent = getListName(activeList);

  cards.replaceChildren();

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-box";
    empty.textContent = "저장된 영상이 없습니다. Setting에서 URL을 등록하세요.";
    cards.appendChild(empty);
    setMsg("0개");
    return;
  }

  const frag = document.createDocumentFragment();

  items.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "video-card";
    card.tabIndex = 0;

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = item.title || "(제목 없음)";

    const url = document.createElement("div");
    url.className = "url";
    url.textContent = item.url;

    const thumbWrap = document.createElement("div");
    thumbWrap.className = "thumb-wrap";

    const img = document.createElement("img");
    img.src = thumbnailUrl(item.url);
    img.alt = "thumbnail";
    img.loading = "lazy";
    thumbWrap.appendChild(img);

    card.appendChild(title);
    card.appendChild(url);
    card.appendChild(thumbWrap);

    const open = () => {
      setReturnPage("list.html");
      location.href = `watch.html?idx=${index}`;
    };

    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });

    frag.appendChild(card);
  });

  cards.appendChild(frag);
  setMsg(`총 ${items.length}개`);
}

document.getElementById("logoHome")?.addEventListener("click", () => {
  location.href = "index.html";
});

render();

initPageSwipe({
  leftHref: "index.html",
  rightHref: null,
});
