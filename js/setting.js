import {
  ensureDefaults,
  registerServiceWorker,
  getActiveList,
  getListName,
  setListName,
  readList,
  writeList,
  swapWithPrelist,
  normalizeYouTubeUrl,
  fetchYouTubeTitle,
  thumbnailUrl,
  initPageSwipe,
} from "./store.js";

ensureDefaults();
registerServiceWorker();

const activeList = getActiveList();

const listTitle = document.getElementById("listTitle");
const nameInput = document.getElementById("nameInput");
const btnEditName = document.getElementById("btnEditName");
const btnSaveName = document.getElementById("btnSaveName");

const urlInput = document.getElementById("urlInput");
const btnPaste = document.getElementById("btnPaste");
const btnUpload = document.getElementById("btnUpload");
const msg = document.getElementById("msg");

const manageList = document.getElementById("manageList");
const btnUndo = document.getElementById("btnUndo");
const btnCopyUrls = document.getElementById("btnCopyUrls");

let orderDirty = false;

function updateOrderButtons() {
  document.querySelectorAll(".btnSaveOrder").forEach((btn) => {
    btn.classList.toggle("order-dirty", orderDirty);
  });
}

function setMsg(text) {
  if (msg) msg.textContent = text || "";
}

function refreshTitle() {
  listTitle.textContent = getListName(activeList);
}

function getPositionValue() {
  return document.querySelector("input[name='position']:checked")?.value || "top";
}

function parseUrlLines() {
  return urlInput.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function pasteFromClipboard() {
  try {
    if (!navigator.clipboard || !window.isSecureContext) {
      setMsg("클립보드 접근이 제한되었습니다. 입력창을 눌러 직접 Ctrl+V 또는 붙여넣기를 사용하세요.");
      urlInput.focus();
      return;
    }

    const text = await navigator.clipboard.readText();

    if (!text.trim()) {
      setMsg("클립보드가 비어 있습니다.");
      urlInput.focus();
      return;
    }

    const current = urlInput.value.trim();

    urlInput.value = current
      ? current + "\n" + text.trim()
      : text.trim();

    urlInput.focus();
    setMsg("클립보드 내용을 붙여넣었습니다.");
  } catch {
    setMsg("클립보드 읽기가 차단되었습니다. 입력창을 눌러 직접 Ctrl+V 또는 붙여넣기를 사용하세요.");
    urlInput.focus();
  }
}

async function uploadUrls() {
  const lines = parseUrlLines();

  if (!lines.length) {
    setMsg("URL을 입력하세요.");
    return;
  }

  btnUpload.disabled = true;
  setMsg("URL 확인 중...");

  const items = [];
  let fail = 0;

  for (let i = 0; i < lines.length; i++) {
    const normalized = normalizeYouTubeUrl(lines[i]);

    if (!normalized) {
      fail++;
      setMsg(`유효하지 않은 URL 제외: ${fail}개`);
      continue;
    }

    setMsg(`제목 불러오는 중... (${items.length + fail + 1}/${lines.length})`);
    const title = await fetchYouTubeTitle(normalized);

    items.push({
      url: normalized,
      title,
    });
  }

  if (!items.length) {
    btnUpload.disabled = false;
    setMsg("등록 가능한 YouTube URL이 없습니다.");
    return;
  }

  const current = getCurrentVisibleItems();
  const position = getPositionValue();

  const next = position === "top"
    ? items.concat(current)
    : current.concat(items);

  writeList(activeList, next, { backup: true });

  urlInput.value = "";
  btnUpload.disabled = false;

  renderManageList();

  const failText = fail ? `, 실패 ${fail}개` : "";
  setMsg(`등록 완료: ${items.length}개${failText}`);
}

function renderManageList() {
  const items = readList(activeList);
  manageList.replaceChildren();
  orderDirty = false;
  updateOrderButtons();

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-box";
    empty.textContent = "저장된 영상이 없습니다.";
    manageList.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();

  items.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "manage-card";
    card.dataset.index = String(index);

    const checkCell = document.createElement("label");
    checkCell.className = "check-cell";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "delete-check";
    checkCell.appendChild(checkbox);

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

    card.appendChild(checkCell);
    card.appendChild(title);
    card.appendChild(url);
    card.appendChild(thumbWrap);

    frag.appendChild(card);
  });

  manageList.appendChild(frag);
}

function getCards() {
  return Array.from(manageList.querySelectorAll(".manage-card"));
}

function getCurrentVisibleItems() {
  const savedItems = readList(activeList);

  return getCards()
    .map((card) => {
      const index = Number(card.dataset.index);
      return savedItems[index];
    })
    .filter(Boolean);
}

function getSelectedCards() {
  return getCards().filter((card) => {
    return card.querySelector(".delete-check")?.checked;
  });
}

function hasSelectedCard() {
  return getSelectedCards().length > 0;
}

function applyCardOrder(cards) {
  manageList.replaceChildren(...cards);
}

function moveSelectedUp() {
  const cards = getCards();

  if (!cards.length) {
    setMsg("이동할 영상이 없습니다.");
    return;
  }

  if (!hasSelectedCard()) {
    setMsg("이동할 영상을 체크하세요.");
    return;
  }

  let moved = false;

  for (let i = 1; i < cards.length; i++) {
    const currentChecked = cards[i].querySelector(".delete-check")?.checked;
    const prevChecked = cards[i - 1].querySelector(".delete-check")?.checked;

    if (currentChecked && !prevChecked) {
      const temp = cards[i - 1];
      cards[i - 1] = cards[i];
      cards[i] = temp;
      moved = true;
    }
  }

  if (!moved) {
    setMsg("더 위로 이동할 수 없습니다.");
    return;
  }

applyCardOrder(cards);
orderDirty = true;
updateOrderButtons();
setMsg("선택한 영상이 아래로 이동했습니다. 저장하려면 순서 확정을 누르세요.");
}

function moveSelectedDown() {
  const cards = getCards();

  if (!cards.length) {
    setMsg("이동할 영상이 없습니다.");
    return;
  }

  if (!hasSelectedCard()) {
    setMsg("이동할 영상을 체크하세요.");
    return;
  }

  let moved = false;

  for (let i = cards.length - 2; i >= 0; i--) {
    const currentChecked = cards[i].querySelector(".delete-check")?.checked;
    const nextChecked = cards[i + 1].querySelector(".delete-check")?.checked;

    if (currentChecked && !nextChecked) {
      const temp = cards[i + 1];
      cards[i + 1] = cards[i];
      cards[i] = temp;
      moved = true;
    }
  }

  if (!moved) {
    setMsg("더 아래로 이동할 수 없습니다.");
    return;
  }

applyCardOrder(cards);
orderDirty = true;
updateOrderButtons();
setMsg("선택한 영상이 위로 이동했습니다. 저장하려면 순서 확정을 누르세요.");
}

function deleteSelected() {
  const cards = getCards();

  if (!cards.length) {
    setMsg("삭제할 영상이 없습니다.");
    return;
  }

  const selectedCount = cards.filter((card) => {
    return card.querySelector(".delete-check")?.checked;
  }).length;

  if (!selectedCount) {
    setMsg("삭제할 영상을 체크하세요.");
    return;
  }

  const visibleItems = getCurrentVisibleItems();

  const next = cards
    .map((card, orderIndex) => {
      const checked = card.querySelector(".delete-check")?.checked;
      return checked ? null : visibleItems[orderIndex];
    })
    .filter(Boolean);

  writeList(activeList, next, { backup: true });
  renderManageList();

  setMsg(`삭제 완료: ${selectedCount}개`);
}

function saveCurrentOrder() {
  const next = getCurrentVisibleItems();

  if (!next.length) {
    setMsg("저장할 목록이 없습니다.");
    return;
  }

  // localStorage 저장 규칙:
  // 1) 현재 list를 먼저 prelist로 백업
  // 2) 바뀐 순서를 list에 저장
  writeList(activeList, next, { backup: true });

  const wasDirty = orderDirty;
  orderDirty = false;
  updateOrderButtons();

  renderManageList();

  if (wasDirty) {
    setMsg("순서가 저장되었습니다.");
  } else {
    setMsg("현재 순서를 다시 저장했습니다.");
  }
}

function undoList() {
  swapWithPrelist(activeList);
  renderManageList();
  setMsg("이전 목록과 바꾸었습니다.");
}

async function copyCurrentUrls() {
  const items = getCurrentVisibleItems();
  const urls = items
    .map((item) => String(item.url || "").trim())
    .filter(Boolean);

  if (!urls.length) {
    setMsg("복사할 URL이 없습니다.");
    return;
  }

  const text = urls.join("\n");

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      fallbackCopyText(text);
    }

    setMsg(`영상 URL ${urls.length}개를 클립보드에 복사했습니다.`);
  } catch {
    try {
      fallbackCopyText(text);
      setMsg(`영상 URL ${urls.length}개를 클립보드에 복사했습니다.`);
    } catch {
      setMsg("클립보드 복사에 실패했습니다. 브라우저 권한을 확인하세요.");
    }
  }
}

function fallbackCopyText(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const ok = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!ok) {
    throw new Error("copy failed");
  }
}

/* 이름 변경 */
btnEditName.addEventListener("click", () => {
  listTitle.classList.add("hidden");
  nameInput.classList.remove("hidden");

  nameInput.value = getListName(activeList);
  nameInput.focus();
  nameInput.select();

  btnSaveName.disabled = false;
});

btnSaveName.addEventListener("click", () => {
  const saved = setListName(activeList, nameInput.value);

  nameInput.classList.add("hidden");
  listTitle.classList.remove("hidden");
  btnSaveName.disabled = true;

  listTitle.textContent = saved;
  setMsg("리스트 이름이 저장되었습니다.");
});

nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !btnSaveName.disabled) {
    btnSaveName.click();
  }
});

/* 붙여넣기/등록 */
btnPaste.addEventListener("click", pasteFromClipboard);
btnUpload.addEventListener("click", uploadUrls);

/* 위쪽/아래쪽 공통 버튼 */
document.querySelectorAll(".btnDelete").forEach((btn) => {
  btn.addEventListener("click", deleteSelected);
});

document.querySelectorAll(".btnMoveUp").forEach((btn) => {
  btn.addEventListener("click", moveSelectedUp);
});

document.querySelectorAll(".btnMoveDown").forEach((btn) => {
  btn.addEventListener("click", moveSelectedDown);
});

document.querySelectorAll(".btnSaveOrder").forEach((btn) => {
  btn.addEventListener("click", saveCurrentOrder);
});

/* 복사/되돌리기 */
btnCopyUrls.addEventListener("click", copyCurrentUrls);
btnUndo.addEventListener("click", undoList);

document.getElementById("logoHome")?.addEventListener("click", () => {
  location.href = "index.html";
});

refreshTitle();
renderManageList();

initPageSwipe({
  leftHref: null,
  rightHref: "index.html",
});
