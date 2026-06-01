"use strict";

/* ============================================================
   회지 메이커 — 롤플레이 로그 → 소설책 내지
   ============================================================ */

const $ = (s) => document.querySelector(s);

const els = {
  book: $("#book"),
  stage: $("#stage"),
  title: $("#bookTitle"),
  author: $("#bookAuthor"),
  pageSize: $("#pageSize"),
  fontSize: $("#fontSize"),
  fontFamily: $("#fontFamily"),
  dropcap: $("#dropcap"),
  autoQuote: $("#autoQuote"),
  log: $("#logInput"),
  pdfBtn: $("#pdfBtn"),
  sampleBtn: $("#sampleBtn"),
  clearBtn: $("#clearBtn"),
  pageCount: $("#pageCount"),
  prevBtn: $("#prevBtn"),
  nextBtn: $("#nextBtn"),
  editBtn: $("#editBtn"),
  editorModal: $("#editorModal"),
  editorClose: $("#editorClose"),
  logBig: $("#logInputBig"),
};

const PAGE_SIZE = {
  a5: { cls: "size-a5", css: "148mm 210mm" },
  a4: { cls: "size-a4", css: "210mm 297mm" },
  b6: { cls: "size-b6", css: "128mm 182mm" },
};

const SAMPLE = `*비가 추적추적 내리는 골목, 그는 우산도 없이 처마 밑에 서 있었다. 빗물이 어깨를 적셔도 그는 미동조차 하지 않았다.

골목 끝, 노란 가로등 불빛만이 흐릿하게 번지고 있었다. 나는 한참을 망설이다 결국 그쪽으로 발을 옮겼다.*
늦어서 미안.
*나는 숨을 고르며 그에게 다가갔다.*
"한참 기다렸잖아."
괜찮아. 비 구경하고 있었어.

***

*그가 옅게 웃으며 손을 내밀었다. 차갑게 식은 손끝이 내 손에 닿았다.*
이제 가자.
"응."`;

let viewMode = "scroll";
let currentIndex = 0;
let totalPages = 0;

/* ---------- 유틸 ---------- */
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function isDivider(line) {
  const t = line.trim();
  return /^([-*=~_·•—⸻]\s?){3,}$/.test(t) || t === "###";
}

/* 라인 안의 인라인 토큰화(따옴표/일반텍스트=대사). *지문*은 이미 치환된 상태 */
function tokenizeInline(text) {
  const tokens = [];
  const re = /"([^"]*)"|“([^”]*)”|「([^」]*)」/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      const p = text.slice(last, m.index);
      if (p.trim()) tokens.push({ type: "dialogue", quoted: false, text: p.trim() });
    }
    const d = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (d) tokens.push({ type: "dialogue", quoted: true, text: d });
    last = re.lastIndex;
  }
  if (last < text.length) {
    const p = text.slice(last);
    if (p.trim()) tokens.push({ type: "dialogue", quoted: false, text: p.trim() });
  }
  return tokens;
}

const NARR_OPEN = "\u0002", NARR_CLOSE = "\u0003", SCENE = "\u0001";

/* ---------- 파싱 (멀티라인 지문 지원) ---------- */
function parseLog(raw) {
  let text = raw.replace(/\r\n/g, "\n");

  // 1) 구분선 라인을 보호
  text = text.split("\n").map((l) => (isDivider(l) ? SCENE : l)).join("\n");

  // 2) *...* 지문 추출 (여러 줄/문단 가능)
  const narrs = [];
  text = text.replace(/\*([\s\S]+?)\*/g, (_, inner) => {
    const i = narrs.push(inner) - 1;
    return `${NARR_OPEN}${i}${NARR_CLOSE}`;
  });

  const blocks = [];
  const pushScene = () => {
    if (blocks.length && blocks[blocks.length - 1].type !== "scene") blocks.push({ type: "scene" });
  };

  const lines = text.split("\n");
  let blankRun = 0;

  for (const line of lines) {
    if (line.trim() === "") { blankRun++; continue; }
    if (blankRun >= 2) pushScene();
    blankRun = 0;
    if (line.trim() === SCENE) { pushScene(); continue; }

    const parts = line.split(new RegExp(`(${NARR_OPEN}\\d+${NARR_CLOSE})`));
    const multiline = parts.some((p) => {
      const mm = new RegExp(`^${NARR_OPEN}(\\d+)${NARR_CLOSE}$`).exec(p);
      return mm && /\n/.test(narrs[+mm[1]] || "");
    });

    if (multiline) {
      // 멀티라인 지문 → 문단별로 분리
      for (const part of parts) {
        const mm = new RegExp(`^${NARR_OPEN}(\\d+)${NARR_CLOSE}$`).exec(part);
        if (mm) {
          const inner = narrs[+mm[1]] || "";
          inner.split(/\n+/).map((s) => s.trim()).filter(Boolean).forEach((para) => {
            blocks.push({ type: "narration", tokens: [{ type: "narration", text: para }] });
          });
        } else if (part.trim()) {
          const toks = tokenizeInline(part);
          if (toks.length) blocks.push({ type: "dialogue", tokens: toks });
        }
      }
    } else {
      // 한 줄 = 한 블록 (인라인 혼합 유지)
      const tokens = [];
      for (const part of parts) {
        const mm = new RegExp(`^${NARR_OPEN}(\\d+)${NARR_CLOSE}$`).exec(part);
        if (mm) {
          const inner = (narrs[+mm[1]] || "").replace(/\s*\n\s*/g, " ").trim();
          if (inner) tokens.push({ type: "narration", text: inner });
        } else if (part.trim()) {
          tokens.push(...tokenizeInline(part));
        }
      }
      if (tokens.length) {
        const hasDialogue = tokens.some((t) => t.type === "dialogue");
        blocks.push({ type: hasDialogue ? "dialogue" : "narration", tokens });
      }
    }
  }

  while (blocks.length && blocks[0].type === "scene") blocks.shift();
  while (blocks.length && blocks[blocks.length - 1].type === "scene") blocks.pop();
  return blocks;
}

/* ---------- 토큰 → HTML / 단어 배열 ---------- */
function tokenHtml(t, autoQuote) {
  if (t.type === "narration") return `<span class="narration">${escapeHtml(t.text)}</span>`;
  const inner = escapeHtml(t.text);
  const show = t.quoted || autoQuote;
  return `<span class="dialogue">${show ? `“${inner}”` : inner}</span>`;
}
function blockHtml(b, autoQuote) {
  return b.tokens.map((t) => tokenHtml(t, autoQuote)).join(" ");
}
/* 단어 단위 HTML 조각(페이지 분할용) */
function blockWords(b, autoQuote) {
  const words = [];
  b.tokens.forEach((t, ti) => {
    let display, cls;
    if (t.type === "narration") { display = escapeHtml(t.text); cls = "narration"; }
    else {
      const inner = escapeHtml(t.text);
      display = (t.quoted || autoQuote) ? `“${inner}”` : inner;
      cls = "dialogue";
    }
    display.split(/(\s+)/).filter((p) => p !== "").forEach((piece) => {
      words.push(/^\s+$/.test(piece) ? " " : `<span class="${cls}">${piece}</span>`);
    });
    if (ti < b.tokens.length - 1) words.push(" ");
  });
  return words;
}

/* ---------- 페이지 빌더 ---------- */
function makeTitlePage(opts) {
  const page = document.createElement("section");
  page.className = "page page--title";
  page.innerHTML = `
    <div class="title-wrap">
      <h1 class="title-wrap__title">${escapeHtml(opts.title)}</h1>
      ${opts.author ? `<div class="title-wrap__rule"></div><div class="title-wrap__author">${escapeHtml(opts.author)}</div>` : ""}
    </div>`;
  return page;
}
function makeContentPage(opts, pageNum) {
  const page = document.createElement("section");
  page.className = "page";
  const head = document.createElement("div");
  head.className = "page__head";
  head.textContent = opts.title || "";
  const body = document.createElement("div");
  body.className = "page__body body";
  const num = document.createElement("div");
  num.className = "page__num";
  num.textContent = String(pageNum);
  page.append(head, body, num);
  return { page, body };
}

/* ---------- 페이지네이션 (단어 단위 분할로 잘림 방지) ---------- */
function paginate(blocks, opts) {
  els.book.classList.remove("book--flip"); // 측정은 항상 펼친 상태에서
  els.book.innerHTML = "";

  if (opts.title) els.book.appendChild(makeTitlePage(opts));

  const st = { pageNum: 0, body: null };
  const newPage = () => {
    st.pageNum += 1;
    const { page, body } = makeContentPage(opts, st.pageNum);
    els.book.appendChild(page);
    st.body = body;
  };
  newPage();
  const overflow = () => st.body.scrollHeight > st.body.clientHeight + 1;

  if (!blocks.length) {
    st.body.innerHTML = `<div class="empty">왼쪽에 로그를 붙여넣으면<br/>여기에 책 내지처럼 정리돼요.</div>`;
    st.body.parentElement.querySelector(".page__num").textContent = "";
    return;
  }

  for (const b of blocks) {
    if (b.type === "scene") {
      const p = document.createElement("p");
      p.className = "scene";
      p.textContent = "·  ·  ·";
      st.body.appendChild(p);
      if (overflow() && st.body.childElementCount > 1) {
        st.body.removeChild(p);
        newPage();
        st.body.appendChild(p);
      }
      continue;
    }

    const cls = b.type === "dialogue" ? "dia" : "narr";
    const dropFirst = opts.dropcap && b.type === "narration" && !st.usedDrop;
    if (dropFirst) st.usedDrop = true;

    // 빠른 경로: 통째로 들어가면 그대로
    const p = document.createElement("p");
    p.className = dropFirst ? cls + " dropcap" : cls;
    st.body.appendChild(p);
    p.innerHTML = blockHtml(b, opts.autoQuote);
    if (!overflow()) continue;

    // 안 들어가면 → 현재 페이지 바닥까지 채우고 다음 쪽으로 이어붙임
    st.body.removeChild(p);
    fillWords(blockWords(b, opts.autoQuote), cls, dropFirst, st, newPage, overflow);
  }
}

function fillWords(words, cls, dropFirst, st, newPage, overflow) {
  const makeP = (drop) => {
    const p = document.createElement("p");
    p.className = drop ? cls + " dropcap" : cls;
    st.body.appendChild(p);
    return p;
  };
  let p = makeP(dropFirst);
  let html = "";
  for (let i = 0; i < words.length; i++) {
    p.innerHTML = html + words[i];
    if (overflow() && html.trim() !== "") {
      p.innerHTML = html;            // 현재 페이지 확정 (바닥까지 채움)
      newPage();
      p = makeP(false);              // 다음 쪽에서 같은 문단 이어쓰기
      html = words[i].replace(/^\s+/, "");
      p.innerHTML = html;
    } else {
      html = html + words[i];
    }
  }
}

/* ---------- 렌더 ---------- */
function getOpts() {
  return {
    title: els.title.value.trim(),
    author: els.author.value.trim(),
    autoQuote: els.autoQuote.checked,
    dropcap: els.dropcap.checked,
  };
}
function renderBook() {
  const opts = getOpts();
  const size = PAGE_SIZE[els.pageSize.value] || PAGE_SIZE.a5;
  const narr = document.querySelector('input[name="narr"]:checked')?.value || "plain";

  els.book.className = `book ${size.cls} fs-${els.fontSize.value} narration--${narr}`;
  els.book.style.setProperty("--book-font", els.fontFamily.value);
  applyPrintPageSize(size.css);

  paginate(parseLog(els.log.value), opts);
  updateView();
}

function applyPrintPageSize(sizeCss) {
  let style = document.getElementById("print-page-style");
  if (!style) {
    style = document.createElement("style");
    style.id = "print-page-style";
    document.head.appendChild(style);
  }
  style.textContent = `@media print { @page { size: ${sizeCss}; margin: 0; } }`;
}

/* ---------- 뷰 모드(스크롤 / 넘기기) ---------- */
function updateView() {
  const pages = [...els.book.querySelectorAll(".page")];
  totalPages = pages.length;
  if (currentIndex > totalPages - 1) currentIndex = totalPages - 1;
  if (currentIndex < 0) currentIndex = 0;

  if (viewMode === "flip") {
    els.stage.classList.add("is-flip");
    els.book.classList.add("book--flip");
    pages.forEach((p, i) => p.classList.toggle("is-current", i === currentIndex));
    els.pageCount.textContent = totalPages ? `${currentIndex + 1} / ${totalPages}` : "";
    els.prevBtn.disabled = currentIndex <= 0;
    els.nextBtn.disabled = currentIndex >= totalPages - 1;
  } else {
    els.stage.classList.remove("is-flip");
    els.book.classList.remove("book--flip");
    pages.forEach((p) => p.classList.remove("is-current"));
    els.pageCount.textContent = totalPages ? `전체 ${totalPages}쪽` : "";
  }
}
function go(delta) {
  currentIndex += delta;
  updateView();
  const cur = els.book.querySelector(".page.is-current");
  if (cur) cur.scrollIntoView({ block: "nearest" });
}

/* ---------- PDF ---------- */
function saveAsPdf() {
  const title = els.title.value.trim();
  const prev = document.title;
  if (title) document.title = title;
  window.print();
  setTimeout(() => (document.title = prev), 500);
}

/* ---------- 편집 도구 ---------- */
function wrapSelection(before, after, placeholder) {
  const ta = els.log;
  const s = ta.selectionStart, e = ta.selectionEnd;
  const sel = ta.value.slice(s, e) || placeholder;
  ta.value = ta.value.slice(0, s) + before + sel + after + ta.value.slice(e);
  const pos = s + before.length;
  ta.focus();
  ta.setSelectionRange(pos, pos + sel.length);
  renderBook();
}
function wrapIn(ta, before, after, placeholder) {
  const s = ta.selectionStart, e = ta.selectionEnd;
  const sel = ta.value.slice(s, e) || placeholder;
  ta.value = ta.value.slice(0, s) + before + sel + after + ta.value.slice(e);
  const pos = s + before.length;
  ta.focus();
  ta.setSelectionRange(pos, pos + sel.length);
}
function sceneIn(ta) {
  const s = ta.selectionStart;
  const ins = "\n***\n";
  ta.value = ta.value.slice(0, s) + ins + ta.value.slice(s);
  ta.focus();
  ta.setSelectionRange(s + ins.length, s + ins.length);
}
function insertScene() { sceneIn(els.log); renderBook(); }

/* 큰 편집 화면 */
function openEditor() {
  els.logBig.value = els.log.value;
  els.editorModal.classList.add("open");
  els.editorModal.setAttribute("aria-hidden", "false");
  els.logBig.focus();
  const len = els.logBig.value.length;
  els.logBig.setSelectionRange(len, len);
}
function closeEditor() {
  els.editorModal.classList.remove("open");
  els.editorModal.setAttribute("aria-hidden", "true");
  els.log.value = els.logBig.value;
  renderBook();
  els.log.focus();
}

/* ---------- 이벤트 ---------- */
let timer = null;
const schedule = () => { clearTimeout(timer); timer = setTimeout(renderBook, 130); };

function bind() {
  [els.title, els.author, els.log].forEach((el) => el.addEventListener("input", schedule));
  [els.pageSize, els.fontSize, els.fontFamily, els.dropcap, els.autoQuote].forEach((el) =>
    el.addEventListener("change", renderBook)
  );
  document.querySelectorAll('input[name="narr"]').forEach((r) => r.addEventListener("change", renderBook));

  document.querySelectorAll('input[name="view"]').forEach((r) =>
    r.addEventListener("change", (e) => { viewMode = e.target.value; updateView(); })
  );
  els.prevBtn.addEventListener("click", () => go(-1));
  els.nextBtn.addEventListener("click", () => go(1));

  document.querySelectorAll(".chip[data-act]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const act = btn.dataset.act;
      if (act === "narr") wrapSelection("*", "*", "지문을 입력");
      else if (act === "dia") wrapSelection('"', '"', "대사를 입력");
      else if (act === "scene") insertScene();
    })
  );

  // 큰 편집 화면
  els.editBtn.addEventListener("click", openEditor);
  els.editorClose.addEventListener("click", closeEditor);
  els.editorModal.addEventListener("mousedown", (e) => { if (e.target === els.editorModal) closeEditor(); });
  els.logBig.addEventListener("input", () => { els.log.value = els.logBig.value; schedule(); });
  document.querySelectorAll(".chip[data-bact]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const act = btn.dataset.bact;
      if (act === "narr") wrapIn(els.logBig, "*", "*", "지문을 입력");
      else if (act === "dia") wrapIn(els.logBig, '"', '"', "대사를 입력");
      else if (act === "scene") sceneIn(els.logBig);
      els.log.value = els.logBig.value;
      schedule();
    })
  );

  els.pdfBtn.addEventListener("click", saveAsPdf);
  els.sampleBtn.addEventListener("click", () => {
    els.log.value = SAMPLE;
    if (!els.title.value) els.title.value = "비 오는 날의 약속";
    renderBook();
  });
  els.clearBtn.addEventListener("click", () => { els.log.value = ""; renderBook(); els.log.focus(); });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && els.editorModal.classList.contains("open")) { closeEditor(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p") { e.preventDefault(); saveAsPdf(); return; }
    if (viewMode === "flip" && document.activeElement !== els.log) {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); go(-1); }
    }
  });
}

bind();
renderBook();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(renderBook);
