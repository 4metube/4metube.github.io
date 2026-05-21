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
const btnDelete = document.getElementById("btnDelete");
const btnSaveOrder = document.getElementById("btnSaveOrder");
const btnUndo = document.getElementById("btnUndo");
const btnCopyUrls = document.getElementById("btnCopyUrls");

let orderDirty = false;

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

  const current = readList(activeList);
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
  initLongPressReorder();
}

function deleteSelected() {
  const items = readList(activeList);
  const selected = Array.from(manageList.querySelectorAll(".manage-card"))
    .filter((card) => card.querySelector(".delete-check")?.checked)
    .map((card) => Number(card.dataset.index));

  if (!selected.length) {
    setMsg("선택된 항목이 없습니다.");
    return;
  }

  const selectedSet = new Set(selected);
  const next = items.filter((_, index) => !selectedSet.has(index));

  writeList(activeList, next, { backup: true });
  renderManageList();

  setMsg(`삭제 완료: ${selected.length}개`);
}

function saveCurrentOrder() {
  const items = readList(activeList);
  const orderedIndexes = Array.from(manageList.querySelectorAll(".manage-card"))
    .map((card) => Number(card.dataset.index))
    .filter((n) => Number.isInteger(n));

  if (!orderedIndexes.length) {
    setMsg("저장할 목록이 없습니다.");
    return;
  }

  const next = orderedIndexes
    .map((index) => items[index])
    .filter(Boolean);

  writeList(activeList, next, { backup: true });
  renderManageList();

  setMsg("순서가 저장되었습니다.");
}

function undoList() {
  swapWithPrelist(activeList);
  renderManageList();
  setMsg("이전 목록과 바꾸었습니다.");
}

async function copyCurrentUrls() {
  const items = readList(activeList);
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

/* 붙여넣기/등록/삭제/순서/복사/되돌리기 */
btnPaste.addEventListener("click", pasteFromClipboard);
btnUpload.addEventListener("click", uploadUrls);
btnDelete.addEventListener("click", deleteSelected);
btnSaveOrder.addEventListener("click", saveCurrentOrder);
btnCopyUrls.addEventListener("click", copyCurrentUrls);
btnUndo.addEventListener("click", undoList);

document.getElementById("logoHome")?.addEventListener("click", () => {
  location.href = "index.html";
});

/* 2초 롱프레스 순서변경 */
function initLongPressReorder() {
  const cards = Array.from(manageList.querySelectorAll(".manage-card"));

  let pressTimer = null;
  let dragging = null;
  let startX = 0;
  let startY = 0;
  let activated = false;

  function clearPressTimer() {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  }

  function getPoint(e) {
    return e.touches?.[0] || e.changedTouches?.[0] || e;
  }

  function getAfterElement(container, y) {
    const draggableElements = [
      ...container.querySelectorAll(".manage-card:not(.dragging)"),
    ];

    return draggableElements.reduce(
      (closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;

        if (offset < 0 && offset > closest.offset) {
          return { offset, element: child };
        }

        return closest;
      },
      { offset: Number.NEGATIVE_INFINITY, element: null }
    ).element;
  }

  cards.forEach((card) => {
    card.addEventListener("pointerdown", (e) => {
      if (e.target.closest("input,button,label")) return;

      const p = getPoint(e);
      startX = p.clientX;
      startY = p.clientY;
      activated = false;

      clearPressTimer();

      pressTimer = setTimeout(() => {
        activated = true;
        dragging = card;
        card.classList.add("dragging");
        card.setPointerCapture?.(e.pointerId);
        setMsg("순서 변경 중입니다. 원하는 위치에서 손을 떼세요.");
      }, 2000);
    });

    card.addEventListener("pointermove", (e) => {
      const p = getPoint(e);
      const dx = Math.abs(p.clientX - startX);
      const dy = Math.abs(p.clientY - startY);

      if (!activated && (dx > 10 || dy > 10)) {
        clearPressTimer();
        return;
      }

      if (!activated || !dragging) return;

      e.preventDefault();

      const afterElement = getAfterElement(manageList, p.clientY);

      if (afterElement == null) {
        manageList.appendChild(dragging);
      } else {
        manageList.insertBefore(dragging, afterElement);
      }

      orderDirty = true;
    });

    card.addEventListener("pointerup", () => {
      clearPressTimer();

      if (dragging) {
        dragging.classList.remove("dragging");
        dragging = null;
      }

      if (orderDirty) {
        setMsg("순서가 임시 변경되었습니다. ‘순서 확정’을 누르면 저장됩니다.");
      }

      activated = false;
    });

    card.addEventListener("pointercancel", () => {
      clearPressTimer();

      if (dragging) {
        dragging.classList.remove("dragging");
        dragging = null;
      }

      activated = false;
    });
  });
}

refreshTitle();
renderManageList();

initPageSwipe({
  leftHref: null,
  rightHref: "index.html",
});
