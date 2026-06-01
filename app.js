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
  preview: $("#preview"),
  editorPreviewSlot: $("#editorPreviewSlot"),
  paraSpace: $("#paraSpace"),
  firstGap: $("#firstGap"),
  spreadMode: $("#spreadMode"),
  indent: $("#indent"),
  bigTools: $("#bigTools"),
  richPane: $("#richPane"),
  richDoc: $("#richDoc"),
  rtoolbar: $("#rtoolbar"),
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
let spreadOn = false;
let currentIndex = 0;
let totalPages = 0;
let useRich = false;
let editorMode = "text";

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

/* ---------- 블록 편집용: 원문을 블록 단위로 쪼개기 ---------- */
function splitBlocks(raw) {
  let text = (raw || "").replace(/\r\n/g, "\n");
  text = text.split("\n").map((l) => (isDivider(l) ? SCENE : l)).join("\n");

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
    for (const part of parts) {
      const mm = new RegExp(`^${NARR_OPEN}(\\d+)${NARR_CLOSE}$`).exec(part);
      if (mm) {
        const inner = narrs[+mm[1]] || "";
        inner.split(/\n+/).map((s) => s.trim()).filter(Boolean).forEach((para) => {
          blocks.push({ type: "narration", text: para });
        });
      } else if (part.trim()) {
        blocks.push({ type: "dialogue", text: part.trim() });
      }
    }
  }

  while (blocks.length && blocks[0].type === "scene") blocks.shift();
  while (blocks.length && blocks[blocks.length - 1].type === "scene") blocks.pop();
  return blocks;
}
function blocksToText(blocks) {
  return blocks
    .map((b) => {
      if (b.type === "scene") return "***";
      if (b.type === "narration") return "*" + (b.text || "").trim() + "*";
      return (b.text || "").trim();
    })
    .join("\n");
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

  // 첫 장 위 여백 (챕터 시작 느낌)
  if (opts.firstGap && opts.firstGap !== "none") {
    const sp = document.createElement("div");
    sp.setAttribute("aria-hidden", "true");
    sp.style.height = opts.firstGap === "lg" ? "70mm" : "38mm";
    sp.style.flex = "0 0 auto";
    st.body.appendChild(sp);
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

/* ---------- 서식(워드) 콘텐츠 → 페이지 (서식 보존 분할) ---------- */
function getRichBlocks() {
  const out = [];
  els.richDoc.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) {
      if (n.textContent.trim()) {
        const p = document.createElement("p");
        p.className = "rblk";
        p.textContent = n.textContent;
        out.push(p);
      }
      return;
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const txt = n.textContent || "";
    const isScene = (n.classList && n.classList.contains("scene")) || isDivider(txt);
    const p = document.createElement("p");
    p.className = "rblk" + (isScene ? " scene" : "");
    const st = n.getAttribute("style");
    if (st && !isScene) p.setAttribute("style", st);
    if (isScene) p.textContent = "·  ·  ·";
    else p.innerHTML = n.innerHTML && n.innerHTML.trim() ? n.innerHTML : "<br>";
    out.push(p);
  });
  return out;
}

function shallowCloneEl(el) {
  const c = document.createElement(el.tagName);
  if (el.className) c.className = el.className;
  const st = el.getAttribute("style");
  if (st) c.setAttribute("style", st);
  return c;
}
/* cur에 srcNodes를 넘침 직전까지 채우고, 남은 노드 배열을 반환(서식 보존) */
function fillInline(cur, srcNodes, overflow) {
  for (let idx = 0; idx < srcNodes.length; idx++) {
    const node = srcNodes[idx];
    if (node.nodeType === Node.TEXT_NODE) {
      const tokens = node.textContent.split(/(\s+)/).filter((t) => t !== "");
      const tnode = document.createTextNode("");
      cur.appendChild(tnode);
      let acc = "";
      for (let i = 0; i < tokens.length; i++) {
        tnode.textContent = acc + tokens[i];
        if (overflow() && acc.trim() !== "") {
          tnode.textContent = acc;
          const restText = tokens.slice(i).join("").replace(/^\s+/, "");
          const leftover = [];
          if (restText) leftover.push(document.createTextNode(restText));
          for (let j = idx + 1; j < srcNodes.length; j++) leftover.push(srcNodes[j]);
          return leftover;
        }
        acc += tokens[i];
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const clone = shallowCloneEl(node);
      cur.appendChild(clone);
      const childLeft = fillInline(clone, [...node.childNodes], overflow);
      if (childLeft.length) {
        const leftEl = shallowCloneEl(node);
        childLeft.forEach((n) => leftEl.appendChild(n));
        const leftover = [leftEl];
        for (let j = idx + 1; j < srcNodes.length; j++) leftover.push(srcNodes[j]);
        return leftover;
      }
      if (overflow() && cur.childNodes.length > 1) {
        cur.removeChild(clone);
        const leftover = [node];
        for (let j = idx + 1; j < srcNodes.length; j++) leftover.push(srcNodes[j]);
        return leftover;
      }
    }
  }
  return [];
}
function fillBlock(body, blockEl, overflow) {
  const cur = shallowCloneEl(blockEl);
  body.appendChild(cur);
  const leftover = fillInline(cur, [...blockEl.childNodes], overflow);
  if (!leftover.length) return null;
  const rem = shallowCloneEl(blockEl);
  leftover.forEach((n) => rem.appendChild(n));
  return rem;
}

function paginateRich(blocks, opts) {
  els.book.classList.remove("book--flip");
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
    st.body.innerHTML = `<div class="empty">서식 편집에서 글을 작성하면<br/>여기에 책 내지처럼 정리돼요.</div>`;
    st.body.parentElement.querySelector(".page__num").textContent = "";
    return;
  }

  if (opts.firstGap && opts.firstGap !== "none") {
    const sp = document.createElement("div");
    sp.setAttribute("aria-hidden", "true");
    sp.style.height = opts.firstGap === "lg" ? "70mm" : "38mm";
    sp.style.flex = "0 0 auto";
    st.body.appendChild(sp);
  }

  for (const blk of blocks) {
    const whole = blk.cloneNode(true);
    st.body.appendChild(whole);
    if (!overflow()) continue;
    st.body.removeChild(whole);

    if (st.body.childElementCount > 0) {
      newPage();
      const w2 = blk.cloneNode(true);
      st.body.appendChild(w2);
      if (!overflow()) continue;
      st.body.removeChild(w2);
    }

    let block = blk.cloneNode(true);
    let guard = 0;
    while (block && guard++ < 4000) {
      const rem = fillBlock(st.body, block, overflow);
      if (!rem) break;
      newPage();
      block = rem;
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
    firstGap: els.firstGap.value,
  };
}
function renderBook() {
  const opts = getOpts();
  const size = PAGE_SIZE[els.pageSize.value] || PAGE_SIZE.a5;
  const narr = document.querySelector('input[name="narr"]:checked')?.value || "plain";
  const ps = els.paraSpace.value;
  const indent = els.indent.checked ? "indent-on" : "indent-off";

  els.book.className = `book ${size.cls} fs-${els.fontSize.value} narration--${narr} ps-${ps} ${indent}`;
  els.book.style.setProperty("--book-font", els.fontFamily.value);
  applyPrintPageSize(size.css);

  if (useRich) paginateRich(getRichBlocks(), opts);
  else paginate(parseLog(els.log.value), opts);
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

  pages.forEach((p) => p.classList.remove("is-current", "is-left", "is-right"));
  els.book.style.transform = "";
  els.spreadMode.hidden = viewMode !== "flip";

  if (viewMode !== "flip") {
    els.stage.classList.remove("is-flip");
    els.book.classList.remove("book--flip", "is-spread");
    els.pageCount.textContent = totalPages ? `전체 ${totalPages}쪽` : "";
    return;
  }

  els.stage.classList.add("is-flip");
  els.book.classList.add("book--flip");

  if (spreadOn && totalPages > 0) {
    els.book.classList.add("is-spread");
    pages[currentIndex] && pages[currentIndex].classList.add("is-left");
    pages[currentIndex + 1] && pages[currentIndex + 1].classList.add("is-right");
    scaleSpread(pages[currentIndex] || pages[0]);
    const right = Math.min(currentIndex + 2, totalPages);
    els.pageCount.textContent = `${currentIndex + 1}–${right} / ${totalPages}`;
    els.prevBtn.disabled = currentIndex <= 0;
    els.nextBtn.disabled = currentIndex + 2 >= totalPages;
  } else {
    els.book.classList.remove("is-spread");
    pages[currentIndex] && pages[currentIndex].classList.add("is-current");
    els.pageCount.textContent = totalPages ? `${currentIndex + 1} / ${totalPages}` : "";
    els.prevBtn.disabled = currentIndex <= 0;
    els.nextBtn.disabled = currentIndex >= totalPages - 1;
  }
}
function scaleSpread(sample) {
  if (!sample) return;
  const pageW = sample.getBoundingClientRect().width;
  if (!pageW) return;
  const avail = els.stage.clientWidth - 40;
  const scale = Math.min(1, avail / (pageW * 2));
  els.book.style.transformOrigin = "top center";
  els.book.style.transform = scale < 0.999 ? `scale(${scale})` : "";
}
function go(delta) {
  const step = (viewMode === "flip" && spreadOn) ? 2 : 1;
  currentIndex += delta * step;
  updateView();
  const cur = els.book.querySelector(".page.is-current, .page.is-left");
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

/* ---------- 서식(워드) 편집 ---------- */
let savedRange = null;
function saveRange() {
  const s = window.getSelection();
  if (s && s.rangeCount && els.richDoc.contains(s.anchorNode)) {
    savedRange = s.getRangeAt(0).cloneRange();
  }
}
function restoreRange() {
  if (!savedRange) return;
  const s = window.getSelection();
  s.removeAllRanges();
  s.addRange(savedRange);
}
function richHasContent() {
  const t = (els.richDoc.textContent || "").trim();
  return t.length > 0;
}
function seedRichFromText() {
  const blocks = parseLog(els.log.value);
  const html = blocks
    .map((b) => {
      if (b.type === "scene") return '<p class="scene">·  ·  ·</p>';
      const text = b.tokens
        .map((t) => {
          const inner = escapeHtml(t.text);
          if (t.type === "narration") return inner;
          return t.quoted ? `“${inner}”` : inner;
        })
        .join(" ");
      return `<p>${text || "<br>"}</p>`;
    })
    .join("");
  els.richDoc.innerHTML = html || "<p><br></p>";
}
function execRich(cmd, val) {
  els.richDoc.focus();
  restoreRange();
  try { document.execCommand("styleWithCSS", false, true); } catch (e) {}
  document.execCommand(cmd, false, val);
  saveRange();
  schedule();
}
function applyFontSizePx(px) {
  els.richDoc.focus();
  restoreRange();
  try { document.execCommand("styleWithCSS", false, false); } catch (e) {}
  document.execCommand("fontSize", false, "7");
  els.richDoc.querySelectorAll('font[size="7"]').forEach((f) => {
    f.removeAttribute("size");
    f.style.fontSize = px + "px";
  });
  saveRange();
  schedule();
}
function setEditorMode(mode) {
  editorMode = mode;
  const rich = mode === "rich";
  els.richPane.hidden = !rich;
  els.logBig.hidden = rich;
  els.bigTools.style.visibility = rich ? "hidden" : "visible";
  if (rich) {
    useRich = true;
    els.richDoc.style.fontFamily = els.fontFamily.value;
    if (!richHasContent()) seedRichFromText();
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) {}
    renderBook();
    els.richDoc.focus();
  } else {
    useRich = false;
    renderBook();
  }
}

/* 큰 편집 화면 (좌: 편집 / 우: 실시간 미리보기) */
let previewHome = null;
function openEditor() {
  if (!previewHome) {
    previewHome = { parent: els.preview.parentNode, next: els.preview.nextSibling };
  }
  els.editorPreviewSlot.appendChild(els.preview); // 미리보기를 모달로 이동
  els.logBig.value = els.log.value;
  const mode = useRich ? "rich" : "text";
  const radio = document.querySelector(`input[name="emode"][value="${mode}"]`);
  if (radio) radio.checked = true;
  setEditorMode(mode);
  els.editorModal.classList.add("open");
  els.editorModal.setAttribute("aria-hidden", "false");
  if (mode === "text") {
    els.logBig.focus();
    const len = els.logBig.value.length;
    els.logBig.setSelectionRange(len, len);
  }
}
function closeEditor() {
  els.editorModal.classList.remove("open");
  els.editorModal.setAttribute("aria-hidden", "true");
  if (previewHome) previewHome.parent.insertBefore(els.preview, previewHome.next); // 원위치
  if (!useRich) els.log.value = els.logBig.value;
  renderBook();
}

/* ---------- 이벤트 ---------- */
let timer = null;
const schedule = () => { clearTimeout(timer); timer = setTimeout(renderBook, 130); };

function bind() {
  [els.title, els.author, els.log].forEach((el) => el.addEventListener("input", schedule));
  [els.pageSize, els.fontSize, els.fontFamily, els.dropcap, els.autoQuote, els.paraSpace, els.firstGap, els.indent].forEach((el) =>
    el.addEventListener("change", renderBook)
  );
  document.querySelectorAll('input[name="narr"]').forEach((r) => r.addEventListener("change", renderBook));

  document.querySelectorAll('input[name="view"]').forEach((r) =>
    r.addEventListener("change", (e) => { viewMode = e.target.value; updateView(); })
  );
  document.querySelectorAll('input[name="spread"]').forEach((r) =>
    r.addEventListener("change", (e) => {
      spreadOn = e.target.value === "spread";
      if (spreadOn && currentIndex % 2 === 1) currentIndex -= 1; // 짝수에서 시작
      updateView();
    })
  );
  els.prevBtn.addEventListener("click", () => go(-1));
  els.nextBtn.addEventListener("click", () => go(1));
  window.addEventListener("resize", () => { if (viewMode === "flip" && spreadOn) updateView(); });

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
  document.querySelectorAll('input[name="emode"]').forEach((r) =>
    r.addEventListener("change", (e) => setEditorMode(e.target.value))
  );

  // 서식(워드) 편집 동작
  els.richDoc.addEventListener("input", schedule);
  ["keyup", "mouseup"].forEach((ev) => els.richDoc.addEventListener(ev, saveRange));
  els.richDoc.addEventListener("blur", saveRange);
  els.rtoolbar.querySelectorAll("[data-cmd]").forEach((el) => {
    const cmd = el.dataset.cmd;
    if (el.tagName === "SELECT") {
      el.addEventListener("change", () => {
        if (cmd === "fontSize") applyFontSizePx(el.value);
        else execRich(cmd, el.value);
        el.selectedIndex = 0;
      });
    } else if (el.tagName === "INPUT") {
      el.addEventListener("mousedown", saveRange);
      el.addEventListener("input", () => execRich(cmd, el.value));
    } else {
      el.addEventListener("mousedown", (e) => { e.preventDefault(); saveRange(); });
      el.addEventListener("click", () => {
        if (cmd === "seed") { seedRichFromText(); renderBook(); els.richDoc.focus(); }
        else execRich(cmd);
      });
    }
  });
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
    useRich = false;
    els.richDoc.innerHTML = "";
    const tRadio = document.querySelector('input[name="emode"][value="text"]');
    if (tRadio) tRadio.checked = true;
    renderBook();
  });
  els.clearBtn.addEventListener("click", () => {
    els.log.value = "";
    useRich = false;
    els.richDoc.innerHTML = "";
    const tRadio = document.querySelector('input[name="emode"][value="text"]');
    if (tRadio) tRadio.checked = true;
    renderBook();
    els.log.focus();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && els.editorModal.classList.contains("open")) { closeEditor(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p") { e.preventDefault(); saveAsPdf(); return; }
    if (viewMode === "flip" && !els.editorModal.classList.contains("open") &&
        document.activeElement !== els.log) {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); go(-1); }
    }
  });
}

bind();
renderBook();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(renderBook);
