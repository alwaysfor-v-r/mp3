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
  titleSubtitle: $("#titleSubtitle"),
  titleMeta: $("#titleMeta"),
  useTitle: $("#useTitle"),
  useAuthor: $("#useAuthor"),
  useSubtitle: $("#useSubtitle"),
  useMeta: $("#useMeta"),
  titleField: $("#titleField"),
  authorField: $("#authorField"),
  subtitleField: $("#subtitleField"),
  metaField: $("#metaField"),
  includeCover: $("#includeCover"),
  coverStyle: $("#coverStyle"),
  coverImage: $("#coverImage"),
  clearCoverImage: $("#clearCoverImage"),
  includeTitleLeaf: $("#includeTitleLeaf"),
  titleLeafStyle: $("#titleLeafStyle"),
  includeHalfTitle: $("#includeHalfTitle"),
  halfTitleStyle: $("#halfTitleStyle"),
  includePreface: $("#includePreface"),
  prefaceLabel: $("#prefaceLabel"),
  prefaceText: $("#prefaceText"),
  prefaceField: $("#prefaceField"),
  includeToc: $("#includeToc"),
  tocText: $("#tocText"),
  tocField: $("#tocField"),
  tocFromBody: $("#tocFromBody"),
  includeEpilogue: $("#includeEpilogue"),
  epilogueLabel: $("#epilogueLabel"),
  epilogueText: $("#epilogueText"),
  epilogueField: $("#epilogueField"),
  includeColophon: $("#includeColophon"),
  colophonText: $("#colophonText"),
  colophonStyle: $("#colophonStyle"),
  colophonField: $("#colophonField"),
  colophonHtml: $("#colophonHtml"),
  coverHtml: $("#coverHtml"),
  coverHtmlField: $("#coverHtmlField"),
  coverImageRow: $("#coverImageRow"),
  titleLeafHtml: $("#titleLeafHtml"),
  titleLeafHtmlField: $("#titleLeafHtmlField"),
  halfTitleHtml: $("#halfTitleHtml"),
  halfTitleHtmlField: $("#halfTitleHtmlField"),
  prefaceStyle: $("#prefaceStyle"),
  prefaceHtml: $("#prefaceHtml"),
  prefaceHtmlField: $("#prefaceHtmlField"),
  tocStyle: $("#tocStyle"),
  tocHtml: $("#tocHtml"),
  tocHtmlField: $("#tocHtmlField"),
  epilogueStyle: $("#epilogueStyle"),
  epilogueHtml: $("#epilogueHtml"),
  epilogueHtmlField: $("#epilogueHtmlField"),
  colophonHtmlField: $("#colophonHtmlField"),
  imgInsert: $("#imgInsert"),
  pageSize: $("#pageSize"),
  fontSize: $("#fontSize"),
  fontFamily: $("#fontFamily"),
  dropcap: $("#dropcap"),
  autoQuote: $("#autoQuote"),
  pdfBtn: $("#pdfBtn"),
  sampleBtn: $("#sampleBtn"),
  clearBtn: $("#clearBtn"),
  pageCount: $("#pageCount"),
  prevBtn: $("#prevBtn"),
  nextBtn: $("#nextBtn"),
  paraSpace: $("#paraSpace"),
  firstGap: $("#firstGap"),
  spreadMode: $("#spreadMode"),
  indent: $("#indent"),
  richToggle: $("#richToggle"),
  richDoc: $("#richDoc"),
  rtoolbar: $("#rtoolbar"),
};

let repaginateTimer = null;
let coverImageDataUrl = null;
const REPAGINATE_DELAY_MS = 1400;
const undoPast = [];
const undoFuture = [];

const SANITIZE_TAGS = new Set([
  "P", "BR", "DIV", "SPAN", "H1", "H2", "H3", "H4", "EM", "STRONG", "B", "I", "U",
  "BLOCKQUOTE", "UL", "OL", "LI", "HR", "IMG", "FIGURE", "FIGCAPTION", "A", "SUB", "SUP",
]);
const SANITIZE_ATTRS = {
  IMG: ["src", "alt", "class", "style", "width", "height"],
  A: ["href", "title", "class"],
  "*": ["class", "style"],
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
let renderSeq = 0;
let paginateRoot = null;
let isRendering = false;
let lastPasteAt = 0;
const PASTE_GUARD_MS = 2800;
let lastEditAnchor = { idx: 0, mainIdx: -1, pageKey: null, textHint: "" };
let pendingRefocusAfterRender = false;
let pendingEditCaret = null;
let bookDirty = false;

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

  const parseLine = (line) => {
    if (line.trim() === SCENE) { pushScene(); return; }

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
  };

  const chunks = text.split(/\n\s*\n+/);
  if (chunks.length === 1 && !/\n\s*\n+/.test(text)) {
    text.split("\n").forEach((line) => {
      if (!line.trim()) return;
      parseLine(line);
    });
  } else {
    chunks.forEach((chunk) => {
      chunk.split("\n").forEach((line) => {
        if (!line.trim()) return;
        parseLine(line);
      });
    });
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
function titlePageParts(opts) {
  const sub = opts.titleSubtitle
    ? `<p class="title-wrap__sub">${escapeHtml(opts.titleSubtitle)}</p>` : "";
  const meta = opts.titleMeta
    ? `<p class="title-wrap__meta">${escapeHtml(opts.titleMeta)}</p>` : "";
  const author = opts.author
    ? `<div class="title-wrap__author">${escapeHtml(opts.author)}</div>` : "";
  const rule = opts.author ? `<div class="title-wrap__rule"></div>` : "";
  const h1 = opts.title ? `<h1 class="title-wrap__title">${escapeHtml(opts.title)}</h1>` : "";
  return { h1, sub, meta, author, rule };
}

function sanitizeHtml(raw) {
  if (!raw || !raw.trim()) return "";
  const doc = new DOMParser().parseFromString(`<div>${raw}</div>`, "text/html");
  const walk = (node) => {
    [...node.childNodes].forEach((ch) => {
      if (ch.nodeType === Node.TEXT_NODE) return;
      if (ch.nodeType !== Node.ELEMENT_NODE) { ch.remove(); return; }
      const tag = ch.tagName;
      if (!SANITIZE_TAGS.has(tag)) { ch.remove(); return; }
      [...ch.attributes].forEach((attr) => {
        const allowed = SANITIZE_ATTRS[tag] || SANITIZE_ATTRS["*"] || [];
        const ok = allowed.includes(attr.name) || (SANITIZE_ATTRS["*"] || []).includes(attr.name);
        if (!ok) ch.removeAttribute(attr.name);
        if (attr.name === "href" && /^javascript:/i.test(attr.value)) ch.removeAttribute("href");
      });
      if (tag === "IMG" && ch.getAttribute("src")?.startsWith("javascript:")) ch.removeAttribute("src");
      walk(ch);
    });
  };
  walk(doc.body.firstElementChild || doc.body);
  return (doc.body.firstElementChild || doc.body).innerHTML;
}

function tagPage(page, key) {
  if (page) page.dataset.pageKey = key;
  return page;
}

function makeSectionHtmlPage(pageClass, html, pageKey) {
  const clean = sanitizeHtml(html);
  if (!clean) return null;
  const page = document.createElement("section");
  page.className = `page ${pageClass}`;
  if (pageKey) page.dataset.pageKey = pageKey;
  const inner = document.createElement("div");
  inner.className = "custom-html body";
  inner.innerHTML = clean;
  page.appendChild(inner);
  return page;
}

function makeCoverPage(opts) {
  const style = opts.coverStyle || "text-classic";
  if (style === "html") {
    return makeSectionHtmlPage("page--cover page--cover-html", opts.coverHtml, "cover");
  }
  const page = document.createElement("section");
  page.className = `page page--cover page--cover-${style}`;
  page.dataset.pageKey = "cover";
  const { h1, sub, author } = titlePageParts(opts);
  const titleHtml = opts.title ? `<h1 class="cover-wrap__title">${escapeHtml(opts.title)}</h1>` : "";
  const subHtml = opts.titleSubtitle ? `<p class="cover-wrap__sub">${escapeHtml(opts.titleSubtitle)}</p>` : "";
  const authorHtml = opts.author ? `<p class="cover-wrap__author">${escapeHtml(opts.author)}</p>` : "";

  if (opts.coverImage && (style === "image-full" || style === "image-band")) {
    page.style.backgroundImage = `url(${opts.coverImage})`;
  }
  if (style === "image-band") {
    page.innerHTML = `<div class="cover-wrap"><div class="cover-wrap__band">${titleHtml}${subHtml}${authorHtml}</div></div>`;
  } else if (style.startsWith("text-")) {
    page.innerHTML = `<div class="cover-wrap">${titleHtml}${subHtml}${authorHtml}</div>`;
  } else {
    page.innerHTML = `<div class="cover-wrap cover-wrap--bare">${titleHtml}${subHtml}${authorHtml}</div>`;
  }
  return page;
}

function makeTitleLeafPage(opts) {
  const style = opts.titleLeafStyle || "center";
  if (style === "html") {
    return makeSectionHtmlPage("page--titleleaf page--titleleaf-html", opts.titleLeafHtml, "title-leaf");
  }
  const page = document.createElement("section");
  page.className = `page page--titleleaf page--titleleaf-${style}`;
  page.dataset.pageKey = "title-leaf";
  page.innerHTML = `
    <div class="titleleaf-wrap">
      ${opts.title ? `<h1 class="titleleaf-wrap__title">${escapeHtml(opts.title)}</h1>` : ""}
    </div>`;
  return page;
}

function makeHalfTitlePage(opts) {
  const style = opts.halfTitleStyle || "classic";
  if (style === "html") {
    return makeSectionHtmlPage("page--halftitle page--halftitle-html", opts.halfTitleHtml, "half-title");
  }
  const page = document.createElement("section");
  page.className = `page page--halftitle page--title page--title-${style} page--halftitle-${style}`;
  page.dataset.pageKey = "half-title";
  const { h1, sub, meta, author, rule } = titlePageParts(opts);

  if (style === "minimal") {
    page.innerHTML = `<div class="title-wrap"><div class="title-wrap__top">${h1}${sub}${meta}</div><div class="title-wrap__foot">${author}</div></div>`;
  } else if (style === "cover") {
    page.innerHTML = `<div class="title-wrap title-wrap--cover"><div class="title-wrap__top">${h1}${sub}${meta}</div><div class="title-wrap__foot">${rule}${author}</div></div>`;
  } else if (style === "ornate") {
    page.innerHTML = `<div class="title-wrap"><div class="title-wrap__orn" aria-hidden="true">· ❦ ·</div>${h1}${sub}${meta}${rule}${author}<div class="title-wrap__orn title-wrap__orn--foot" aria-hidden="true">· ❦ ·</div></div>`;
  } else {
    page.innerHTML = `<div class="title-wrap">${h1}${sub}${meta}${rule}${author}</div>`;
  }
  return page;
}

function makeMatterTextPage(kind, headLabel, text) {
  const paras = (text || "").split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (!paras.length) return null;
  const page = document.createElement("section");
  page.className = `page page--matter page--${kind}`;
  page.dataset.pageKey = kind;
  const head = document.createElement("div");
  head.className = "page__head";
  head.textContent = headLabel;
  const body = document.createElement("div");
  body.className = "page__body body matter-body";
  body.dataset.pageKind = kind;
  paras.forEach((t) => {
    const p = document.createElement("p");
    p.textContent = t;
    body.appendChild(p);
  });
  const num = document.createElement("div");
  num.className = "page__num";
  num.setAttribute("aria-hidden", "true");
  page.append(head, body, num);
  return page;
}

function parseTocLine(line) {
  const m = line.match(/^(.+?)(?:\s*[·．.…]{2,}\s*|\s+)(\d+)\s*$/);
  if (m) return { label: m[1].trim(), page: m[2] };
  return { label: line.trim(), page: "" };
}

function makeTocPage(opts) {
  if (opts.tocStyle === "html") {
    return makeSectionHtmlPage("page--matter page--toc page--toc-html", opts.tocHtml, "toc");
  }
  const lines = (opts.tocText || "").split("\n").map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return null;
  const page = document.createElement("section");
  page.className = "page page--matter page--toc";
  page.dataset.pageKey = "toc";
  const head = document.createElement("div");
  head.className = "page__head";
  head.textContent = "목차";
  const body = document.createElement("div");
  body.className = "page__body body matter-body";
  body.dataset.pageKind = "toc";
  const ul = document.createElement("ul");
  ul.className = "toc-list";
  lines.forEach((line) => {
    const { label, page: pg } = parseTocLine(line);
    const li = document.createElement("li");
    li.innerHTML = `<span class="toc-label">${escapeHtml(label)}</span><span class="toc-dots"></span><span class="toc-page">${escapeHtml(pg)}</span>`;
    ul.appendChild(li);
  });
  body.appendChild(ul);
  const num = document.createElement("div");
  num.className = "page__num";
  num.setAttribute("aria-hidden", "true");
  page.append(head, body, num);
  return page;
}

function makeColophonPage(opts) {
  if (opts.colophonStyle === "html") {
    return makeSectionHtmlPage("page--matter page--colophon page--colophon-html", opts.colophonHtml, "colophon");
  }
  const paras = (opts.colophonText || "").split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (!paras.length) return null;
  const page = document.createElement("section");
  page.className = `page page--matter page--colophon page--colophon-${opts.colophonStyle || "center"}`;
  page.dataset.pageKey = "colophon";
  const wrap = document.createElement("div");
  wrap.className = "colophon-wrap";
  paras.forEach((t) => {
    const p = document.createElement("p");
    p.textContent = t;
    wrap.appendChild(p);
  });
  page.appendChild(wrap);
  return page;
}

function appendFrontMatter(opts) {
  const root = paginateRoot || els.book;
  const add = (p) => { if (p) root.appendChild(p); };
  if (opts.includeCover) add(makeCoverPage(opts));
  if (opts.includeTitleLeaf) add(makeTitleLeafPage(opts));
  if (opts.includeHalfTitle) add(makeHalfTitlePage(opts));
  if (opts.includePreface) {
    if (opts.prefaceStyle === "html") {
      add(makeSectionHtmlPage("page--matter page--preface page--preface-html", opts.prefaceHtml, "preface"));
    } else {
      add(makeMatterTextPage("preface", opts.prefaceLabel || "서문", opts.prefaceText));
    }
  }
  if (opts.includeToc) add(makeTocPage(opts));
}

function appendBackMatter(opts) {
  const root = paginateRoot || els.book;
  const add = (p) => { if (p) root.appendChild(p); };
  if (opts.includeEpilogue) {
    if (opts.epilogueStyle === "html") {
      add(makeSectionHtmlPage("page--matter page--epilogue page--epilogue-html", opts.epilogueHtml, "epilogue"));
    } else {
      add(makeMatterTextPage("epilogue", opts.epilogueLabel || "참고", opts.epilogueText));
    }
  }
  if (opts.includeColophon) add(makeColophonPage(opts));
}

function makeContentPage(opts, pageNum) {
  const page = document.createElement("section");
  page.className = "page page--main";
  page.dataset.pageKey = `main-${pageNum}`;
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

  appendFrontMatter(opts);

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
    st.body.innerHTML = `<div class="empty">본문 페이지를 클릭해<br/>바로 입력하거나 로그를 붙여넣으세요.</div>`;
    st.body.parentElement.querySelector(".page__num").textContent = "";
    appendBackMatter(opts);
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
  appendBackMatter(opts);
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
    const trial = html + words[i];
    p.innerHTML = trial;
    if (!overflow()) {
      html = trial;
      continue;
    }
    if (html.trim() !== "") {
      p.innerHTML = html;
      newPage();
      p = makeP(false);
      html = words[i].replace(/^\s+/, "");
      p.innerHTML = html;
    } else {
      html = words[i];
      p.innerHTML = html;
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
    if (n.classList?.contains("empty")) return;
    const txt = n.textContent || "";
    const isScene = (n.classList && n.classList.contains("scene")) || isDivider(txt);
    const isSplit = n.dataset?.splitPart === "1";
    if (isSplit && out.length) {
      const prev = out[out.length - 1];
      if (prev.classList.contains("rblk") && !prev.classList.contains("scene")) {
        if (!isScene) prev.textContent = mergeContinuationText(prev.textContent, n.textContent);
        return;
      }
    }
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
function mergeContinuationText(prevText, contText) {
  const a = prevText || "";
  const b = contText || "";
  if (!b) return a;
  if (a.endsWith(b)) return a;
  const maxO = Math.min(a.length, b.length);
  for (let o = maxO; o > 0; o--) {
    if (a.slice(-o) === b.slice(0, o)) return a + b.slice(o);
  }
  return a + b;
}

function remainderBlock(blockEl, text) {
  const rem = shallowCloneEl(blockEl);
  rem.dataset.splitPart = "1";
  rem.textContent = text;
  return rem.textContent.trim() ? rem : null;
}

function snapSplitAtBoundary(full, best) {
  if (best <= 0 || best >= full.length) return best;
  const rest = full.slice(best);
  if (/^\s/.test(rest)) return best;
  const head = full.slice(0, best);
  const sp = head.lastIndexOf(" ");
  if (sp > 0 && sp > best - 32) return sp + 1;
  return best;
}

/* 페이지 나눔: 브라우저 줄바꿈 기준으로 들어가는 길이만 이진 탐색 (글자 단위 쪼개기 제거) */
function fillBlockByMeasure(body, blockEl, overflow) {
  const full = blockEl.textContent || "";
  const p = shallowCloneEl(blockEl);
  p.innerHTML = "";
  if (blockEl.dataset.splitPart === "1") p.dataset.splitPart = "1";
  body.appendChild(p);

  if (!full.length) {
    p.innerHTML = blockEl.innerHTML?.trim() ? blockEl.innerHTML : "<br>";
    return overflow() ? (body.removeChild(p), null) : null;
  }

  let lo = 0;
  let hi = full.length;
  let best = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    p.textContent = full.slice(0, mid);
    if (!overflow()) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (best <= 0 && full.length > 0) {
    p.textContent = full.slice(0, 1);
    if (overflow()) {
      body.removeChild(p);
      return remainderBlock(blockEl, full);
    }
    best = 1;
  }

  best = snapSplitAtBoundary(full, best);
  p.textContent = full.slice(0, best);
  const rest = full.slice(best);
  if (!rest.trim()) return null;
  return remainderBlock(blockEl, rest);
}

function fillBlock(body, blockEl, overflow) {
  if (blockEl.classList.contains("scene")) {
    const p = shallowCloneEl(blockEl);
    p.textContent = "·  ·  ·";
    body.appendChild(p);
    if (!overflow()) return null;
    body.removeChild(p);
    const rem = shallowCloneEl(blockEl);
    rem.textContent = "·  ·  ·";
    return rem;
  }

  const whole = shallowCloneEl(blockEl);
  whole.innerHTML = blockEl.innerHTML?.trim() ? blockEl.innerHTML : "<br>";
  body.appendChild(whole);
  if (!overflow()) return null;
  body.removeChild(whole);

  return fillBlockByMeasure(body, blockEl, overflow);
}

function paginateRich(blocks, opts, root) {
  paginateRoot = root || els.book;
  paginateRoot.classList.remove("book--flip");
  paginateRoot.innerHTML = "";
  appendFrontMatter(opts);

  const st = { pageNum: 0, body: null };
  const newPage = () => {
    st.pageNum += 1;
    const { page, body } = makeContentPage(opts, st.pageNum);
    paginateRoot.appendChild(page);
    st.body = body;
  };
  newPage();
  const overflow = () => {
    void st.body.offsetHeight;
    return Math.ceil(st.body.scrollHeight) > Math.floor(st.body.clientHeight) + 4;
  };

  if (!blocks.length) {
    st.body.innerHTML = `<div class="empty">본문 페이지를 클릭해<br/>바로 입력하거나 로그를 붙여넣으세요.</div>`;
    st.body.parentElement.querySelector(".page__num").textContent = "";
    appendBackMatter(opts);
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
    let block = blk.cloneNode(true);
    let guard = 0;
    while (block && guard++ < 4000) {
      const rem = fillBlock(st.body, block, overflow);
      if (!rem) break;
      newPage();
      block = rem;
    }
  }
  appendBackMatter(opts);
}

/* ---------- 렌더 ---------- */
function getOpts() {
  return {
    title: els.useTitle.checked ? els.title.value.trim() : "",
    author: els.useAuthor.checked ? els.author.value.trim() : "",
    titleSubtitle: els.useSubtitle.checked ? els.titleSubtitle.value.trim() : "",
    titleMeta: els.useMeta.checked ? els.titleMeta.value.trim() : "",
    includeCover: els.includeCover.checked,
    coverStyle: els.coverStyle.value,
    coverImage: coverImageDataUrl,
    includeTitleLeaf: els.includeTitleLeaf.checked,
    titleLeafStyle: els.titleLeafStyle.value,
    includeHalfTitle: els.includeHalfTitle.checked,
    halfTitleStyle: els.halfTitleStyle.value,
    includePreface: els.includePreface.checked,
    prefaceLabel: els.prefaceLabel.value.trim() || "서문",
    prefaceText: els.prefaceText.value,
    includeToc: els.includeToc.checked,
    tocText: els.tocText.value,
    includeEpilogue: els.includeEpilogue.checked,
    epilogueLabel: els.epilogueLabel.value.trim() || "참고",
    epilogueText: els.epilogueText.value,
    includeColophon: els.includeColophon.checked,
    colophonText: els.colophonText.value,
    colophonStyle: els.colophonStyle.value,
    colophonHtml: els.colophonHtml.value,
    coverHtml: els.coverHtml.value,
    titleLeafHtml: els.titleLeafHtml.value,
    halfTitleHtml: els.halfTitleHtml.value,
    prefaceStyle: els.prefaceStyle.value,
    prefaceHtml: els.prefaceHtml.value,
    tocStyle: els.tocStyle.value,
    tocHtml: els.tocHtml.value,
    epilogueStyle: els.epilogueStyle.value,
    epilogueHtml: els.epilogueHtml.value,
    autoQuote: els.autoQuote.checked,
    dropcap: els.dropcap.checked,
    firstGap: els.firstGap.value,
  };
}

function isHtmlMode(sel) {
  return sel && sel.value === "html";
}

function updateMatterFields() {
  if (els.titleField) els.titleField.hidden = !els.useTitle.checked;
  if (els.authorField) els.authorField.hidden = !els.useAuthor.checked;
  if (els.subtitleField) els.subtitleField.hidden = !els.useSubtitle.checked;
  if (els.metaField) els.metaField.hidden = !els.useMeta.checked;

  els.prefaceField.hidden = !els.includePreface.checked;
  els.tocField.hidden = !els.includeToc.checked;
  els.epilogueField.hidden = !els.includeEpilogue.checked;
  els.colophonField.hidden = !els.includeColophon.checked;

  const coverHtml = isHtmlMode(els.coverStyle);
  els.coverHtmlField.hidden = !coverHtml;
  if (els.coverImageRow) els.coverImageRow.hidden = coverHtml;

  els.titleLeafHtmlField.hidden = !isHtmlMode(els.titleLeafStyle);
  els.halfTitleHtmlField.hidden = !isHtmlMode(els.halfTitleStyle);

  const preHtml = isHtmlMode(els.prefaceStyle);
  els.prefaceHtmlField.hidden = !preHtml;
  els.prefaceLabel.hidden = preHtml;
  els.prefaceText.hidden = preHtml;

  const tocHtml = isHtmlMode(els.tocStyle);
  els.tocHtmlField.hidden = !tocHtml;
  els.tocText.hidden = tocHtml;
  if (els.tocFromBody) els.tocFromBody.hidden = tocHtml;

  const epiHtml = isHtmlMode(els.epilogueStyle);
  els.epilogueHtmlField.hidden = !epiHtml;
  els.epilogueLabel.hidden = epiHtml;
  els.epilogueText.hidden = epiHtml;

  const colHtml = isHtmlMode(els.colophonStyle);
  els.colophonHtmlField.hidden = !colHtml;
  els.colophonText.hidden = colHtml;
}

function syncMatterFromBook(kind) {
  const body = els.book.querySelector(`.page--${kind} .matter-body`);
  if (!body) return;
  if (kind === "toc") {
    const lines = [...body.querySelectorAll(".toc-list li")].map((li) => {
      const label = li.querySelector(".toc-label")?.textContent.trim() || "";
      const pg = li.querySelector(".toc-page")?.textContent.trim() || "";
      return pg ? `${label}······${pg}` : label;
    });
    els.tocText.value = lines.join("\n");
    return;
  }
  const text = [...body.querySelectorAll("p")]
    .map((p) => p.textContent.trim())
    .filter(Boolean)
    .join("\n\n");
  if (kind === "preface") els.prefaceText.value = text;
  else if (kind === "epilogue") els.epilogueText.value = text;
}

function extractTocFromBody() {
  const blocks = getRichBlocks();
  const lines = [];
  blocks.forEach((el) => {
    const t = (el.textContent || "").trim();
    if (/^제\s*\d+\s*장/.test(t) || /^Chapter\s+\d+/i.test(t)) lines.push(t);
  });
  if (lines.length) {
    els.tocText.value = lines.map((l, i) => `${l}······${i + 1}`).join("\n");
    els.includeToc.checked = true;
    updateMatterFields();
    renderBook();
  }
}

function insertImageFile(file, forCover = false) {
  if (!file || !file.type.startsWith("image/")) return;
  const r = new FileReader();
  r.onload = () => {
    if (forCover) {
      coverImageDataUrl = r.result;
      renderBook();
      return;
    }
    restoreRange();
    const inBook = window.getSelection()?.anchorNode && els.book.contains(window.getSelection().anchorNode);
    if (!inBook) els.richDoc.focus();
    const html = `<img src="${r.result}" alt="" />`;
    try { document.execCommand("insertHTML", false, html); }
    catch (e) { /* ignore */ }
    saveRange();
    syncBookToSource();
    scheduleRepaginate();
  };
  r.readAsDataURL(file);
}
function clampPageIndex(i, max) {
  let n = Number(i);
  if (!Number.isFinite(n)) n = 0;
  return Math.max(0, Math.min(max, n));
}

function alignSpreadLeft(i, max) {
  let n = clampPageIndex(i, max);
  if (viewMode === "flip" && spreadOn) n -= n % 2;
  return n;
}

function captureViewAnchor() {
  const pages = [...els.book.querySelectorAll(".page")];
  const max = Math.max(0, pages.length - 1);
  const idx = clampPageIndex(currentIndex, max);
  const page = pages[idx];
  if (!page) return { idx: 0, mainIdx: -1, pageKey: null };
  const mains = [...els.book.querySelectorAll(".page--main")];
  const mainIdx = page.classList.contains("page--main") ? mains.indexOf(page) : -1;
  return { idx, mainIdx, pageKey: page.dataset.pageKey || null };
}

function goToEndIndex() {
  const pages = [...els.book.querySelectorAll(".page")];
  if (!pages.length) {
    currentIndex = 0;
    return;
  }
  const max = pages.length - 1;
  const mains = [...els.book.querySelectorAll(".page--main")];
  if (mains.length) {
    currentIndex = alignSpreadLeft(pages.indexOf(mains[mains.length - 1]), max);
  } else {
    currentIndex = max;
  }
}

function scrollStageToPage(page) {
  if (!page || viewMode === "flip") return;
  const stage = els.stage;
  const top = page.getBoundingClientRect().top - stage.getBoundingClientRect().top + stage.scrollTop;
  stage.scrollTop = Math.max(0, top - 48);
}

function scrollViewToCurrentPage() {
  const pages = [...els.book.querySelectorAll(".page")];
  scrollStageToPage(pages[clampPageIndex(currentIndex, Math.max(0, pages.length - 1))]);
}

function rememberEditAnchor(anchor) {
  if (!anchor || anchor.gotoEnd) return;
  lastEditAnchor = {
    idx: anchor.idx ?? 0,
    mainIdx: anchor.mainIdx ?? -1,
    pageKey: anchor.pageKey || null,
    textHint: anchor.textHint || "",
  };
}

function buildEditAnchorFromBody(body) {
  const page = body?.closest?.(".page");
  if (!page || !els.book.contains(page)) return captureViewAnchor();
  const pages = [...els.book.querySelectorAll(".page")];
  const mains = [...els.book.querySelectorAll(".page--main")];
  const idx = pages.indexOf(page);
  const text = (body.textContent || "").replace(/\s+/g, " ").trim();
  const anchor = {
    idx: idx >= 0 ? idx : 0,
    mainIdx: page.classList.contains("page--main") ? mains.indexOf(page) : -1,
    pageKey: page.dataset.pageKey || null,
    textHint: text.slice(0, 96),
  };
  rememberEditAnchor(anchor);
  return anchor;
}

function findMainPageByTextHint(hint) {
  if (!hint || hint.length < 16) return -1;
  const prefix = hint.replace(/\s+/g, " ").trim().slice(0, 48);
  const mains = [...els.book.querySelectorAll(".page--main")];
  for (let i = 0; i < mains.length; i++) {
    const t = (mains[i].querySelector(".page__body")?.textContent || "").replace(/\s+/g, " ").trim();
    if (t.startsWith(prefix)) return i;
  }
  return -1;
}

function captureEditAnchor() {
  const ae = document.activeElement;
  const body = ae?.closest?.(".page__body, .matter-body");
  if (body && els.book.contains(body)) return buildEditAnchorFromBody(body);
  const page = ae?.closest?.(".page");
  if (page && els.book.contains(page)) {
    const b = page.querySelector(".page__body, .matter-body");
    if (b) return buildEditAnchorFromBody(b);
  }
  return lastEditAnchor || captureViewAnchor();
}

function isPlaceholderBody(body) {
  const kids = [...body.children];
  return kids.length === 1 && kids[0].classList?.contains("empty");
}

function hasRealBookBody() {
  return [...els.book.querySelectorAll(".page--main .page__body")].some((b) => {
    if (isPlaceholderBody(b)) return false;
    return b.textContent.trim() || b.querySelector("img");
  });
}

function isPlaceholderOnlySource(html) {
  if (!html?.trim()) return true;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const wrap = doc.body.firstElementChild || doc.body;
  const kids = [...wrap.children];
  return kids.length === 1 && kids[0].classList?.contains("empty");
}

function stripPlaceholderFromSource(html) {
  if (!html?.trim() || isPlaceholderOnlySource(html)) return "";
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const wrap = doc.body.firstElementChild || doc.body;
  [...wrap.querySelectorAll(".empty")].forEach((el) => el.remove());
  return wrap.innerHTML.trim();
}

function ensureSourceFromBook() {
  if (hasRealBookBody()) syncBookToSource();
}

function logToHtmlWithFallback(text) {
  let html = logToHtml(text);
  if (html.trim()) return html;
  return text
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p class="rblk">${escapeHtml(line)}</p>`)
    .join("");
}

function appendLogText(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return;
  lastPasteAt = Date.now();
  bookDirty = true;
  clearTimeout(repaginateTimer);
  pushUndoBefore(els.richDoc.innerHTML);

  const html = logToHtmlWithFallback(trimmed);
  if (hasRealBookBody()) ensureSourceFromBook();
  let cur = stripPlaceholderFromSource(els.richDoc.innerHTML);
  els.richDoc.innerHTML = cur ? cur + html : html;

  const seq = ++renderSeq;
  Promise.resolve().then(async () => {
    await ensureBookFontLoaded();
    if (seq !== renderSeq) return;
    renderBookNow({ gotoEnd: true });
  });
}

function restoreViewAnchor(anchor) {
  const pages = [...els.book.querySelectorAll(".page")];
  if (!pages.length) {
    currentIndex = 0;
    return;
  }
  if (anchor.gotoEnd) {
    goToEndIndex();
    return;
  }
  const max = pages.length - 1;
  const mains = [...els.book.querySelectorAll(".page--main")];

  if (anchor.pageKey) {
    const byKey = pages.findIndex((p) => p.dataset.pageKey === anchor.pageKey);
    if (byKey >= 0) {
      currentIndex = alignSpreadLeft(byKey, max);
      return;
    }
  }
  if (anchor.mainIdx >= 0 && mains.length) {
    const page = mains[Math.min(anchor.mainIdx, mains.length - 1)];
    const at = pages.indexOf(page);
    currentIndex = alignSpreadLeft(at >= 0 ? at : 0, max);
  } else if (anchor.idx > 0) {
    currentIndex = alignSpreadLeft(anchor.idx, max);
  } else {
    currentIndex = alignSpreadLeft(anchor.idx ?? 0, max);
  }
}

function syncFlipIndexFromTarget(target) {
  if (viewMode !== "flip") return false;
  const page = target?.closest?.(".page");
  if (!page) return false;
  const pages = [...els.book.querySelectorAll(".page")];
  const i = pages.indexOf(page);
  if (i < 0) return false;
  const max = pages.length - 1;
  const next = spreadOn ? i - (i % 2) : i;
  if (next === currentIndex) return false;
  currentIndex = clampPageIndex(next, max);
  return true;
}

function bookFontFamily() {
  const v = els.fontFamily.value || "";
  const m = v.match(/['"]([^'"]+)['"]/);
  return m ? m[1] : v.split(",")[0].trim().replace(/^['"]|['"]$/g, "");
}

async function ensureBookFontLoaded() {
  const fam = bookFontFamily();
  const pt = els.fontSize.value === "small" ? "9pt" : els.fontSize.value === "large" ? "11.5pt" : "10.2pt";
  const probe = document.getElementById("fontProbe");
  if (probe) {
    probe.style.fontFamily = els.fontFamily.value;
    probe.style.fontSize = pt;
  }
  if (!document.fonts?.load) return;
  const specs = [`400 9pt "${fam}"`, `400 10.2pt "${fam}"`, `400 11.5pt "${fam}"`, `400 ${pt} "${fam}"`];
  try {
    await Promise.all(specs.map((s) => document.fonts.load(s)));
  } catch (e) { /* ignore */ }
  await document.fonts.ready;
  for (let i = 0; i < 60; i++) {
    if (document.fonts.check(`12px "${fam}"`)) break;
    await new Promise((r) => setTimeout(r, 50));
  }
}

function captureEditCaret(body) {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !body?.contains(sel.anchorNode)) return buildEditAnchorFromBody(body);
  const range = sel.getRangeAt(0);
  const pre = range.cloneRange();
  pre.selectNodeContents(body);
  pre.setEnd(range.endContainer, range.endOffset);
  const anchor = buildEditAnchorFromBody(body);
  anchor.offset = pre.toString().length;
  return anchor;
}

function placeCaretInBody(body, offset) {
  const want = Math.max(0, offset || 0);
  let left = want;
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const len = node.length;
    if (left <= len) {
      const range = document.createRange();
      range.setStart(node, left);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    left -= len;
  }
  const range = document.createRange();
  range.selectNodeContents(body);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function findEditableBodyForAnchor(caret) {
  if (!caret) return null;
  const mains = [...els.book.querySelectorAll(".page--main")];
  if (caret.mainIdx >= 0 && mains[caret.mainIdx]) {
    return mains[caret.mainIdx].querySelector(".page__body");
  }
  if (caret.pageKey) {
    const page = els.book.querySelector(`[data-page-key="${caret.pageKey}"]`);
    return page?.querySelector(".page__body, .matter-body") || null;
  }
  if (caret.textHint) {
    const mi = findMainPageByTextHint(caret.textHint);
    if (mi >= 0 && mains[mi]) return mains[mi].querySelector(".page__body");
  }
  return mains[0]?.querySelector(".page__body") || null;
}

function restoreEditCaret(caret) {
  const body = findEditableBodyForAnchor(caret);
  if (!body) return;
  body.focus({ preventScroll: viewMode === "flip" });
  const len = (body.textContent || "").length;
  placeCaretInBody(body, Math.min(caret.offset ?? len, len));
}

function markPendingRefocus(body) {
  pendingRefocusAfterRender = true;
  pendingEditCaret = captureEditCaret(body);
}

function isAtEditableStart(body) {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !body.contains(sel.anchorNode)) return false;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return false;
  const start = document.createRange();
  start.selectNodeContents(body);
  start.collapse(true);
  return range.compareBoundaryPoints(Range.START_TO_START, start) === 0;
}

function getPreviousEditableBody(body) {
  const page = body.closest(".page");
  if (!page) return null;
  if (page.classList.contains("page--main")) {
    const mains = [...els.book.querySelectorAll(".page--main")];
    const i = mains.indexOf(page);
    return i > 0 ? mains[i - 1].querySelector(".page__body") : null;
  }
  const pages = [...els.book.querySelectorAll(".page")];
  const i = pages.indexOf(page);
  for (let j = i - 1; j >= 0; j--) {
    const b = pages[j].querySelector(".matter-body");
    if (b) return b;
  }
  return null;
}

function mergeEditableBodies(prev, cur) {
  while (cur.firstChild) prev.appendChild(cur.firstChild);
  if (!cur.textContent.trim() && !cur.querySelector("img")) cur.innerHTML = "";
}

function renderBookNow(anchor) {
  isRendering = true;
  const opts = getOpts();
  const size = PAGE_SIZE[els.pageSize.value] || PAGE_SIZE.a5;
  const narr = document.querySelector('input[name="narr"]:checked')?.value || "plain";
  const ps = els.paraSpace.value;
  const indent = els.indent.checked ? "indent-on" : "indent-off";

  const mods = `${size.cls} fs-${els.fontSize.value} narration--${narr} ps-${ps} ${indent}`;
  els.book.className = `book ${mods}`;
  els.book.style.setProperty("--book-font", els.fontFamily.value);

  applyPrintPageSize(size.css);

  const tmp = document.createElement("div");
  tmp.className = els.book.className;
  tmp.style.cssText = "position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;";
  tmp.style.setProperty("--book-font", els.fontFamily.value);
  document.body.appendChild(tmp);
  paginateRich(getRichBlocks(), opts, tmp);
  els.book.replaceChildren(...tmp.children);
  tmp.remove();
  paginateRoot = null;

  restoreViewAnchor(anchor);
  updateView();
  const refocus = pendingRefocusAfterRender;
  const caret = pendingEditCaret;
  isRendering = false;
  bookDirty = false;
  if (anchor?.gotoEnd) {
    requestAnimationFrame(() => {
      const mains = [...els.book.querySelectorAll(".page--main")];
      const body = mains[mains.length - 1]?.querySelector(".page__body");
      if (body) {
        body.focus({ preventScroll: viewMode === "flip" });
        placeCaretInBody(body, body.textContent.length);
      }
    });
    pendingRefocusAfterRender = false;
    pendingEditCaret = null;
  } else if (refocus && caret) {
    scrollViewToCurrentPage();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => restoreEditCaret(caret));
    });
    pendingRefocusAfterRender = false;
    pendingEditCaret = null;
  }
}

function renderBook(forcedAnchor) {
  const anchor = forcedAnchor || captureEditAnchor();
  const seq = ++renderSeq;
  Promise.resolve().then(async () => {
    await ensureBookFontLoaded();
    if (seq !== renderSeq) return;
    renderBookNow(anchor);
  });
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
  const max = Math.max(0, totalPages - 1);

  if (viewMode === "flip" && !totalPages) {
    els.stage.classList.add("is-flip");
    els.book.classList.add("book--flip");
    els.pageCount.textContent = "준비 중…";
    els.prevBtn.disabled = true;
    els.nextBtn.disabled = true;
    return;
  }

  currentIndex = alignSpreadLeft(currentIndex, max);

  pages.forEach((p) => p.classList.remove("is-current", "is-left", "is-right"));
  els.book.style.transform = "";
  els.spreadMode.hidden = viewMode !== "flip";

  if (viewMode !== "flip") {
    els.stage.classList.remove("is-flip");
    els.book.classList.remove("book--flip", "is-spread");
    els.pageCount.textContent = totalPages ? `전체 ${totalPages}쪽` : "";
    applyPageEditability();
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
  applyPageEditability();
}

/* 스크롤·편집: 페이지 본문에서 직접 입력 → 원본 동기화 */
function syncBookToSource() {
  const bodies = [...els.book.querySelectorAll(".page--main .page__body")];
  els.richDoc.innerHTML = "";
  bodies.forEach((b, bi) => {
    [...b.children].forEach((child, ci) => {
      if (child.classList?.contains("empty")) return;
      const clone = child.cloneNode(true);
      const prev = els.richDoc.lastElementChild;
      const crossPage = bi > 0 && ci === 0;
      const mergeable =
        crossPage &&
        clone.dataset?.splitPart === "1" &&
        prev?.classList?.contains("rblk") &&
        !prev.classList.contains("scene") &&
        clone.classList?.contains("rblk") &&
        !clone.classList.contains("scene");
      if (mergeable) {
        prev.textContent = mergeContinuationText(prev.textContent, clone.textContent);
        delete prev.dataset.splitPart;
        return;
      }
      if (
        crossPage &&
        prev?.classList?.contains("rblk") &&
        !prev.classList.contains("scene") &&
        clone.classList?.contains("rblk") &&
        !clone.classList.contains("scene")
      ) {
        const merged = mergeContinuationText(prev.textContent, clone.textContent);
        if (merged.length < (prev.textContent || "").length + (clone.textContent || "").length) {
          prev.textContent = merged;
          return;
        }
      }
      els.richDoc.appendChild(clone);
    });
  });
}

function clearUndoHistory() {
  undoPast.length = 0;
  undoFuture.length = 0;
}

function pushUndoBefore(prevHtml) {
  if (undoPast.length && undoPast[undoPast.length - 1] === prevHtml) return;
  undoPast.push(prevHtml);
  if (undoPast.length > 80) undoPast.shift();
  undoFuture.length = 0;
}

function isBookTypingTarget(el) {
  return el && el.isContentEditable && els.book.contains(el);
}

function undoBookEdit() {
  if (!undoPast.length) return false;
  undoFuture.push(els.richDoc.innerHTML);
  els.richDoc.innerHTML = undoPast.pop();
  pendingRefocusAfterRender = true;
  pendingEditCaret = { ...lastEditAnchor, offset: null };
  renderBook(lastEditAnchor);
  return true;
}

function redoBookEdit() {
  if (!undoFuture.length) return false;
  pushUndoBefore(els.richDoc.innerHTML);
  els.richDoc.innerHTML = undoFuture.pop();
  pendingRefocusAfterRender = true;
  pendingEditCaret = { ...lastEditAnchor, offset: null };
  renderBook(lastEditAnchor);
  return true;
}

function handleBookUndoRedo(e) {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
  const ae = document.activeElement;
  if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.tagName === "SELECT")) return;
  if (ae === els.richDoc || els.richDoc.contains(ae)) return;
  const inBook = ae && ae.isContentEditable && els.book.contains(ae);
  if (!inBook && !undoPast.length && !undoFuture.length) return;
  if (e.shiftKey) {
    if (redoBookEdit()) {
      e.preventDefault();
      e.stopPropagation();
    }
  } else if (undoBookEdit()) {
    e.preventDefault();
    e.stopPropagation();
  }
}

function scheduleRepaginate(anchor, delay = REPAGINATE_DELAY_MS) {
  clearTimeout(repaginateTimer);
  if (anchor && !anchor.gotoEnd) rememberEditAnchor(anchor);
  repaginateTimer = setTimeout(() => renderBook(lastEditAnchor), delay);
}

function flushRepaginate(anchor) {
  clearTimeout(repaginateTimer);
  const a = anchor || lastEditAnchor || captureEditAnchor();
  if (a && !a.gotoEnd) rememberEditAnchor(a);
  renderBook(a);
}

function pasteLogInto(_target, text) {
  appendLogText(text);
}

function handleEditableInput(body, matterKinds) {
  const kind = body.dataset.pageKind;
  const prevRich = els.richDoc.innerHTML;
  bookDirty = true;
  markPendingRefocus(body);
  if (matterKinds.has(kind)) syncMatterFromBook(kind);
  else syncBookToSource();
  if (!matterKinds.has(kind) && els.richDoc.innerHTML !== prevRich) pushUndoBefore(prevRich);
  scheduleRepaginate(buildEditAnchorFromBody(body));
}

function handleEditableBackspace(body, matterKinds, e) {
  if (!isAtEditableStart(body)) return;
  e.preventDefault();
  const prev = getPreviousEditableBody(body);
  if (!prev) return;
  const page = body.closest(".page--main");
  const mains = page ? [...els.book.querySelectorAll(".page--main")] : [];
  const mergeFrom = page ? mains.indexOf(page) : -1;
  const prevRich = els.richDoc.innerHTML;
  bookDirty = true;
  markPendingRefocus(prev);
  mergeEditableBodies(prev, body);
  const kind = body.dataset.pageKind;
  if (matterKinds.has(kind)) syncMatterFromBook(kind);
  else {
    syncBookToSource();
    if (els.richDoc.innerHTML !== prevRich) pushUndoBefore(prevRich);
  }
  clearTimeout(repaginateTimer);
  const anchor =
    mergeFrom > 0
      ? { mainIdx: mergeFrom - 1, idx: captureViewAnchor().idx, pageKey: `main-${mergeFrom}` }
      : captureViewAnchor();
  renderBook(anchor);
}

function applyPageEditability() {
  const matterKinds = new Set(["preface", "toc", "epilogue"]);
  els.book.querySelectorAll(".page--main .page__body, .page--matter .matter-body").forEach((body) => {
    body.contentEditable = "true";
    if (body.dataset.editBound) return;
    body.dataset.editBound = "1";
    body.addEventListener("mousedown", () => {
      rememberEditAnchor(buildEditAnchorFromBody(body));
      clearTimeout(repaginateTimer);
    });
    body.addEventListener("input", () => handleEditableInput(body, matterKinds));
    body.addEventListener("keydown", (e) => {
      if (e.key === "Backspace") handleEditableBackspace(body, matterKinds, e);
    });
    body.addEventListener("focus", () => {
      const anchor = buildEditAnchorFromBody(body);
      rememberEditAnchor(anchor);
      if (viewMode !== "flip") currentIndex = anchor.idx;
      else if (syncFlipIndexFromTarget(body)) updateView();
    });
    body.addEventListener("blur", () => {
      if (isRendering || pendingRefocusAfterRender || Date.now() - lastPasteAt < PASTE_GUARD_MS) return;
      pendingRefocusAfterRender = false;
      pendingEditCaret = null;
      if (!bookDirty) return;
      bookDirty = false;
      const anchor = body.closest(".page") ? buildEditAnchorFromBody(body) : captureEditAnchor();
      flushRepaginate(anchor);
    });
    body.addEventListener("paste", (e) => {
      let text = (e.clipboardData || window.clipboardData)?.getData("text/plain") || "";
      if (!text.trim()) {
        const html = (e.clipboardData || window.clipboardData)?.getData("text/html") || "";
        if (html) {
          const doc = new DOMParser().parseFromString(html, "text/html");
          text = doc.body.innerText || "";
        }
      }
      if (!text.trim()) return;
      const kind = body.dataset.pageKind;
      if (matterKinds.has(kind)) return;
      e.preventDefault();
      pasteLogInto(body, text);
    });
  });
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
  const pages = els.book.querySelectorAll(".page");
  const max = Math.max(0, pages.length - 1);
  const step = (viewMode === "flip" && spreadOn) ? 2 : 1;
  currentIndex = alignSpreadLeft(clampPageIndex(currentIndex, max) + delta * step, max);
  rememberEditAnchor(captureViewAnchor());
  updateView();
  if (viewMode === "flip") els.stage.scrollTop = 0;
  else scrollViewToCurrentPage();
}

/* ---------- PDF ---------- */
function saveAsPdf() {
  const title = els.title.value.trim();
  const prev = document.title;
  if (title) document.title = title;
  window.print();
  setTimeout(() => (document.title = prev), 500);
}

/* ---------- 서식(워드) 편집 ---------- */
let savedRange = null;
function saveRange() {
  const s = window.getSelection();
  if (!s || !s.rangeCount) return;
  const node = s.anchorNode;
  if (node && (els.richDoc.contains(node) || els.book.contains(node))) {
    savedRange = s.getRangeAt(0).cloneRange();
  }
}
function restoreRange() {
  if (!savedRange) return;
  const s = window.getSelection();
  s.removeAllRanges();
  s.addRange(savedRange);
}
/* 로그 텍스트 → 서식 HTML (지문/대사/장면 자동 정리) */
function logToHtml(text) {
  const blocks = parseLog(text);
  const autoQuote = els.autoQuote.checked;
  return blocks
    .map((b) => {
      if (b.type === "scene") return '<p class="scene">·  ·  ·</p>';
      const t = b.tokens
        .map((tk) => {
          const inner = escapeHtml(tk.text);
          if (tk.type === "narration") return `<span class="narration">${inner}</span>`;
          const show = tk.quoted || autoQuote;
          return `<span class="dialogue">${show ? `“${inner}”` : inner}</span>`;
        })
        .join(" ");
      return `<p>${t || "<br>"}</p>`;
    })
    .join("");
}
function loadLogIntoSheet(text, append = false) {
  if (append) appendLogText(text);
  else {
    els.richDoc.innerHTML = logToHtml(text);
    renderBook({ gotoEnd: true });
  }
}
function execRich(cmd, val) {
  restoreRange();
  const s = window.getSelection();
  const inBook = s?.anchorNode && els.book.contains(s.anchorNode);
  if (!inBook) els.richDoc.focus();
  try { document.execCommand("styleWithCSS", false, true); } catch (e) {}
  document.execCommand(cmd, false, val);
  saveRange();
  if (inBook) { bookDirty = true; syncBookToSource(); scheduleRepaginate(); }
  else schedule();
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
/* '서식 편집' = 툴바만 토글. 편집은 항상 미리보기 시트에서. */
function setRichMode(on) {
  useRich = on;
  els.rtoolbar.hidden = !on;
}

/* ---------- 이벤트 ---------- */
let timer = null;
const schedule = () => {
  clearTimeout(timer);
  timer = setTimeout(() => renderBook(lastEditAnchor), 130);
};

function bind() {
  const matterInputs = [
    els.title, els.author, els.titleSubtitle, els.titleMeta,
    els.prefaceText, els.prefaceLabel, els.tocText, els.epilogueText, els.epilogueLabel,
    els.colophonText, els.colophonHtml,
    els.coverHtml, els.titleLeafHtml, els.halfTitleHtml,
    els.prefaceHtml, els.tocHtml, els.epilogueHtml,
  ];
  matterInputs.forEach((el) => el && el.addEventListener("input", schedule));

  const matterChanges = [
    els.coverStyle, els.titleLeafStyle, els.halfTitleStyle, els.colophonStyle,
    els.prefaceStyle, els.tocStyle, els.epilogueStyle,
    els.pageSize, els.fontSize, els.fontFamily, els.dropcap, els.autoQuote, els.paraSpace, els.firstGap, els.indent,
    els.includeCover, els.includeTitleLeaf, els.includeHalfTitle,
    els.includePreface, els.includeToc, els.includeEpilogue, els.includeColophon,
    els.useTitle, els.useAuthor, els.useSubtitle, els.useMeta,
  ];
  matterChanges.forEach((el) => el && el.addEventListener("change", () => { updateMatterFields(); renderBook(); }));

  els.coverImage.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) insertImageFile(file, true);
    e.target.value = "";
  });
  els.clearCoverImage.addEventListener("click", () => {
    coverImageDataUrl = null;
    els.coverImage.value = "";
    renderBook();
  });
  els.tocFromBody.addEventListener("click", extractTocFromBody);
  document.querySelectorAll('input[name="narr"]').forEach((r) => r.addEventListener("change", renderBook));

  document.querySelectorAll('input[name="view"]').forEach((r) =>
    r.addEventListener("change", (e) => {
      viewMode = e.target.value;
      updateView();
    })
  );
  document.querySelectorAll('input[name="spread"]').forEach((r) =>
    r.addEventListener("change", (e) => {
      spreadOn = e.target.value === "spread";
      const max = Math.max(0, els.book.querySelectorAll(".page").length - 1);
      currentIndex = alignSpreadLeft(currentIndex, max);
      updateView();
    })
  );
  const blockNavBlur = (e) => e.preventDefault();
  els.prevBtn.addEventListener("mousedown", blockNavBlur);
  els.nextBtn.addEventListener("mousedown", blockNavBlur);
  els.prevBtn.addEventListener("click", () => go(-1));
  els.nextBtn.addEventListener("click", () => go(1));
  els.book.addEventListener("click", (e) => {
    if (e.target.closest(".nav")) return;
    const body = e.target.closest(".page__body, .matter-body");
    if (body && els.book.contains(body)) {
      const anchor = buildEditAnchorFromBody(body);
      rememberEditAnchor(anchor);
      currentIndex = anchor.idx;
      clearTimeout(repaginateTimer);
      if (viewMode === "flip" && syncFlipIndexFromTarget(e.target)) updateView();
      return;
    }
    if (viewMode !== "flip") return;
    if (syncFlipIndexFromTarget(e.target)) {
      rememberEditAnchor(captureViewAnchor());
      updateView();
    }
  });
  window.addEventListener("resize", () => { if (viewMode === "flip" && spreadOn) updateView(); });

  els.richToggle.addEventListener("change", (e) => setRichMode(e.target.checked));

  ["keyup", "mouseup"].forEach((ev) => {
    els.richDoc.addEventListener(ev, saveRange);
    els.book.addEventListener(ev, saveRange);
  });
  els.richDoc.addEventListener("blur", saveRange);
  els.richDoc.addEventListener("paste", (e) => {
    let text = (e.clipboardData || window.clipboardData)?.getData("text/plain") || "";
    if (!text.trim()) {
      const html = (e.clipboardData || window.clipboardData)?.getData("text/html") || "";
      if (html) {
        const doc = new DOMParser().parseFromString(html, "text/html");
        text = doc.body.innerText || "";
      }
    }
    if (!text.trim()) return;
    e.preventDefault();
    pasteLogInto(els.richDoc, text);
  });

  // 서식 툴바
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
        if (cmd === "createLink") {
          const url = prompt("링크 URL", "https://");
          if (url) execRich("createLink", url);
        } else execRich(cmd);
      });
    }
  });

  els.imgInsert.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) insertImageFile(file);
    e.target.value = "";
  });

  els.pdfBtn.addEventListener("click", saveAsPdf);
  els.sampleBtn.addEventListener("click", () => {
    els.useTitle.checked = true;
    els.useSubtitle.checked = true;
    updateMatterFields();
    if (!els.title.value) els.title.value = "비 오는 날의 약속";
    if (!els.titleSubtitle.value) els.titleSubtitle.value = "롤플레이 로그 회지";
    els.coverStyle.value = "text-classic";
    els.includeCover.checked = true;
    els.includeTitleLeaf.checked = true;
    els.includeHalfTitle.checked = true;
    els.includePreface.checked = true;
    els.includeToc.checked = true;
    els.includeColophon.checked = true;
    updateMatterFields();
    els.prefaceText.value =
      "이 글은 채팅 로그를 소설책 형식으로 옮긴 회지입니다. 머리말·추천사·감사의 말 등을 자유롭게 쓸 수 있습니다.";
    els.tocText.value = "제1장  비 오는 날······1\n제2장  만남······12";
    els.colophonText.value = "2026년 6월 · 회지 메이커로 제작\n© 저작자. 무단 전재 금지.";
    loadLogIntoSheet(SAMPLE);
    const body = els.book.querySelector(".page--main .page__body");
    if (body) body.focus();
  });
  els.clearBtn.addEventListener("click", () => {
    clearTimeout(repaginateTimer);
    clearTimeout(timer);
    clearUndoHistory();
    bookDirty = false;
    els.richDoc.innerHTML = "";
    els.title.value = "";
    els.titleSubtitle.value = "";
    els.author.value = "";
    els.titleMeta.value = "";
    els.prefaceText.value = "";
    els.tocText.value = "";
    els.epilogueText.value = "";
    els.colophonText.value = "";
    els.useTitle.checked = false;
    els.useAuthor.checked = false;
    els.useSubtitle.checked = false;
    els.useMeta.checked = false;
    els.coverHtml.value = "";
    els.titleLeafHtml.value = "";
    els.halfTitleHtml.value = "";
    els.prefaceHtml.value = "";
    els.tocHtml.value = "";
    els.epilogueHtml.value = "";
    els.colophonHtml.value = "";
    coverImageDataUrl = null;
    els.coverImage.value = "";
    els.includeCover.checked = false;
    els.includeTitleLeaf.checked = false;
    els.includeHalfTitle.checked = false;
    els.includePreface.checked = false;
    els.includeToc.checked = false;
    els.includeEpilogue.checked = false;
    els.includeColophon.checked = false;
    updateMatterFields();
    currentIndex = 0;
    renderBook({ idx: 0, mainIdx: -1, pageKey: null });
  });

  window.addEventListener("keydown", (e) => {
    handleBookUndoRedo(e);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p") { e.preventDefault(); saveAsPdf(); return; }
    const ae = document.activeElement;
    const typing = ae === els.richDoc || els.richDoc.contains(ae) ||
      (ae && ae.isContentEditable && els.book.contains(ae)) ||
      (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.tagName === "SELECT"));
    if (viewMode === "flip" && !typing) {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); go(-1); }
    }
  });
}

bind();
updateMatterFields();
try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) {}
renderBook();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(renderBook);
