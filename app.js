"use strict";

/* ============================================================
   회지 메이커 — 롤플레이 로그를 소설책 내지로 변환
   실제 책처럼 페이지 분할 + 머리말 + 쪽번호
   ============================================================ */

const $ = (sel) => document.querySelector(sel);

const els = {
  book: $("#book"),
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
};

const PAGE_SIZE = {
  a5: { cls: "size-a5", css: "148mm 210mm" },
  a4: { cls: "size-a4", css: "210mm 297mm" },
  b6: { cls: "size-b6", css: "128mm 182mm" },
};

const SAMPLE = `*비가 추적추적 내리는 골목, 그는 우산도 없이 처마 밑에 서 있었다. 빗물이 어깨를 적셔도 그는 미동조차 하지 않았다.*
늦어서 미안.
*나는 숨을 고르며 그에게 다가갔다. 한참을 달려온 탓에 심장이 요란하게 뛰고 있었다.*
"한참 기다렸잖아."
괜찮아. 비 구경하고 있었어.

***

*그가 옅게 웃으며 손을 내밀었다. 차갑게 식은 손끝이 내 손에 닿았다.*
이제 가자.
"응."`;

/* ---------- 유틸 ---------- */
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isDivider(line) {
  const t = line.trim();
  return /^([-*=~_·•]\s?){3,}$/.test(t) || t === "###";
}

/* 한 줄 토큰화: *지문* / "대사" / 일반텍스트(=대사) */
function tokenizeLine(line) {
  const tokens = [];
  const re = /\*([^*]+)\*|"([^"]*)"|“([^”]*)”|「([^」]*)」/g;
  let lastIndex = 0, m;
  while ((m = re.exec(line)) !== null) {
    if (m.index > lastIndex) {
      const plain = line.slice(lastIndex, m.index);
      if (plain.trim()) tokens.push({ type: "dialogue", quoted: false, text: plain.trim() });
    }
    if (m[1] !== undefined) {
      tokens.push({ type: "narration", text: m[1].trim() });
    } else {
      const d = (m[2] ?? m[3] ?? m[4] ?? "").trim();
      if (d) tokens.push({ type: "dialogue", quoted: true, text: d });
    }
    lastIndex = re.lastIndex;
  }
  if (lastIndex < line.length) {
    const plain = line.slice(lastIndex);
    if (plain.trim()) tokens.push({ type: "dialogue", quoted: false, text: plain.trim() });
  }
  return tokens;
}

function parseLog(raw) {
  const blocks = [];
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  let blankRun = 0;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") { blankRun++; continue; }
    if (blankRun >= 2 || isDivider(line)) {
      if (blocks.length && blocks[blocks.length - 1].type !== "scene")
        blocks.push({ type: "scene" });
    }
    blankRun = 0;
    if (isDivider(line)) continue;
    const tokens = tokenizeLine(line);
    if (!tokens.length) continue;
    const hasDialogue = tokens.some((t) => t.type === "dialogue");
    blocks.push({ type: hasDialogue ? "dialogue" : "narration", tokens });
  }
  while (blocks.length && blocks[0].type === "scene") blocks.shift();
  while (blocks.length && blocks[blocks.length - 1].type === "scene") blocks.pop();
  return blocks;
}

function renderTokens(tokens, autoQuote) {
  return tokens.map((t) => {
    if (t.type === "narration")
      return `<span class="narration">${escapeHtml(t.text)}</span>`;
    const text = escapeHtml(t.text);
    const out = (t.quoted || autoQuote) ? `“${text}”` : text;
    return `<span class="dialogue">${out}</span>`;
  }).join(" ");
}

/* ---------- 블록 → DOM 엘리먼트 ---------- */
function blocksToElements(blocks, opts) {
  const out = [];
  let firstNarr = true;
  for (const b of blocks) {
    if (b.type === "scene") {
      const d = document.createElement("p");
      d.className = "scene";
      d.textContent = "·  ·  ·";
      out.push(d);
      continue;
    }
    const p = document.createElement("p");
    p.className = b.type === "dialogue" ? "dia" : "narr";
    if (opts.dropcap && b.type === "narration" && firstNarr) {
      p.classList.add("dropcap");
      firstNarr = false;
    }
    p.innerHTML = renderTokens(b.tokens, opts.autoQuote);
    out.push(p);
  }
  return out;
}

/* ---------- 페이지 생성 ---------- */
function makeTitlePage(opts) {
  const page = document.createElement("section");
  page.className = "page page--title";
  page.innerHTML = `
    <div class="title-wrap">
      <h1 class="title-wrap__title">${escapeHtml(opts.title)}</h1>
      ${opts.author ? `<div class="title-wrap__rule"></div>
      <div class="title-wrap__author">${escapeHtml(opts.author)}</div>` : ""}
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
  body.className = "body";
  const num = document.createElement("div");
  num.className = "page__num";
  num.textContent = String(pageNum);
  page.append(head, body, num);
  return { page, body };
}

/* ---------- 페이지네이션 ---------- */
function paginate(elements, opts) {
  const frag = document.createDocumentFragment();
  if (opts.title) frag.appendChild(makeTitlePage(opts));

  if (!elements.length) {
    const { page, body } = makeContentPage(opts, 1);
    body.innerHTML = `<div class="empty">왼쪽에 로그를 붙여넣으면<br/>여기에 책 내지처럼 정리돼요.</div>`;
    page.querySelector(".page__num").textContent = "";
    frag.appendChild(page);
    return frag;
  }

  let pageNum = 1;
  let { page, body } = makeContentPage(opts, pageNum);
  frag.appendChild(page);
  const overflows = () => body.scrollHeight > body.clientHeight + 1;

  for (const el of elements) {
    body.appendChild(el);
    if (overflows()) {
      if (body.childElementCount === 1) {
        // 단일 블록이 한 페이지보다 큼 → 그대로 둠(드문 경우)
        continue;
      }
      body.removeChild(el);
      pageNum++;
      ({ page, body } = makeContentPage(opts, pageNum));
      frag.appendChild(page);
      body.appendChild(el);
    }
  }
  return frag;
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
  const narr = document.querySelector('input[name="narr"]:checked')?.value || "italic";

  els.book.className = `book ${size.cls} fs-${els.fontSize.value} narration--${narr}`;
  els.book.style.setProperty("--book-font", els.fontFamily.value);
  applyPrintPageSize(size.css);

  const blocks = parseLog(els.log.value);
  const elements = blocksToElements(blocks, opts);

  els.book.innerHTML = "";
  els.book.appendChild(paginate(elements, opts));
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

/* ---------- PDF 저장 ---------- */
function saveAsPdf() {
  const title = els.title.value.trim();
  const prev = document.title;
  if (title) document.title = title;
  window.print();
  setTimeout(() => (document.title = prev), 500);
}

/* ---------- 이벤트 ---------- */
let renderTimer = null;
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderBook, 120);
}

function bind() {
  [els.title, els.author].forEach((el) => el.addEventListener("input", scheduleRender));
  els.log.addEventListener("input", scheduleRender);
  [els.pageSize, els.fontSize, els.fontFamily, els.dropcap, els.autoQuote].forEach((el) =>
    el.addEventListener("change", renderBook)
  );
  document.querySelectorAll('input[name="narr"]').forEach((r) =>
    r.addEventListener("change", renderBook)
  );

  els.pdfBtn.addEventListener("click", saveAsPdf);
  els.sampleBtn.addEventListener("click", () => {
    els.log.value = SAMPLE;
    if (!els.title.value) els.title.value = "비 오는 날의 약속";
    renderBook();
  });
  els.clearBtn.addEventListener("click", () => {
    els.log.value = "";
    renderBook();
    els.log.focus();
  });

  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p") {
      e.preventDefault();
      saveAsPdf();
    }
  });
}

bind();
renderBook();
// 폰트 로딩 후 정확한 높이로 재계산
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(renderBook);
}
