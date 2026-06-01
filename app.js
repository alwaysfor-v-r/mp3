"use strict";

/* ============================================================
   회지 메이커 — 롤플레이 로그를 소설책 형식으로 변환
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
  a5: { cls: "book--a5", css: "148mm 210mm" },
  a4: { cls: "book--a4", css: "210mm 297mm" },
  b6: { cls: "book--b6", css: "128mm 182mm" },
};

const SAMPLE = `*비가 추적추적 내리는 골목, 그는 우산도 없이 처마 밑에 서 있었다.*
늦어서 미안.
*나는 숨을 고르며 그에게 다가갔다.*
"한참 기다렸잖아."
괜찮아. 비 구경하고 있었어.

***

*그가 옅게 웃으며 손을 내밀었다.*
이제 가자.
"응."`;

/* ------------------------------------------------------------
   유틸
   ------------------------------------------------------------ */
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isDivider(line) {
  const t = line.trim();
  return /^([-*=~_·•]\s?){3,}$/.test(t) || t === "###" || t === "[scene]";
}

/* 한 줄을 토큰으로 분해: 지문(*...*) / 대사("...") / 일반텍스트(=대사) */
function tokenizeLine(line) {
  const tokens = [];
  // *지문*  또는  "대사"/“대사”/「대사」 매칭
  const re = /\*([^*]+)\*|"([^"]*)"|“([^”]*)”|「([^」]*)」/g;
  let lastIndex = 0;
  let m;
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

/* ------------------------------------------------------------
   파싱: 로그 → 구조화된 블록 목록
   ------------------------------------------------------------ */
function parseLog(raw) {
  const blocks = [];
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  let blankRun = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line === "") {
      blankRun++;
      continue;
    }

    // 연속 빈 줄(2+) 또는 명시적 구분선 → 장면 구분
    if (blankRun >= 2 || isDivider(line)) {
      if (blocks.length && blocks[blocks.length - 1].type !== "scene")
        blocks.push({ type: "scene" });
    }
    blankRun = 0;

    if (isDivider(line)) continue;

    const tokens = tokenizeLine(line);
    if (!tokens.length) continue;

    const hasDialogue = tokens.some((t) => t.type === "dialogue");
    blocks.push({
      type: hasDialogue ? "dialogue" : "narration",
      tokens,
    });
  }
  // 끝/시작의 장면구분 정리
  while (blocks.length && blocks[0].type === "scene") blocks.shift();
  while (blocks.length && blocks[blocks.length - 1].type === "scene") blocks.pop();
  return blocks;
}

/* ------------------------------------------------------------
   렌더링
   ------------------------------------------------------------ */
function renderTokens(tokens, autoQuote) {
  return tokens
    .map((t) => {
      if (t.type === "narration") {
        return `<span class="narration">${escapeHtml(t.text)}</span>`;
      }
      const text = escapeHtml(t.text);
      const showQuotes = t.quoted || autoQuote;
      const out = showQuotes ? `“${text}”` : text;
      return `<span class="dialogue">${out}</span>`;
    })
    .join(" ");
}

function renderBook() {
  const title = els.title.value.trim();
  const author = els.author.value.trim();
  const autoQuote = els.autoQuote.checked;
  const useDropcap = els.dropcap.checked;
  const blocks = parseLog(els.log.value);

  // 책 클래스(판형/글씨크기/지문스타일) 적용
  const size = PAGE_SIZE[els.pageSize.value] || PAGE_SIZE.a5;
  const narrStyle = document.querySelector('input[name="narr"]:checked')?.value || "italic";
  els.book.className = `book ${size.cls} fs-${els.fontSize.value} narration--${narrStyle}`;
  els.book.style.fontFamily = els.fontFamily.value;
  applyPrintPageSize(size.css);

  let html = "";

  // 표지
  if (title) {
    html += `
      <section class="book__page cover">
        <div class="cover__rule"></div>
        <h1 class="cover__title">${escapeHtml(title)}</h1>
        ${author ? `<div class="cover__author">${escapeHtml(author)}</div>` : ""}
        <div class="cover__ornament">❦</div>
      </section>`;
  }

  // 본문
  if (!blocks.length) {
    html += `
      <div class="empty">
        <span class="empty__icon">❦</span>
        왼쪽에 로그를 붙여넣으면<br />여기에 책처럼 정리돼요.
      </div>`;
  } else {
    let body = "";
    let firstProse = true;
    for (const b of blocks) {
      if (b.type === "scene") {
        body += `<div class="scene-break">❖ ❖ ❖</div>`;
        continue;
      }
      if (b.type === "narration") {
        const cls = ["indent"];
        if (useDropcap && firstProse) {
          cls.push("dropcap");
          firstProse = false;
        }
        body += `<p class="${cls.join(" ")}">${renderTokens(b.tokens, autoQuote)}</p>`;
      } else {
        body += `<p class="line-dialogue">${renderTokens(b.tokens, autoQuote)}</p>`;
      }
    }
    html += `<section class="book__page"><div class="body">${body}</div></section>`;
  }

  els.book.innerHTML = html;
}

/* 인쇄 시 @page 크기를 판형에 맞게 주입 */
function applyPrintPageSize(sizeCss) {
  let style = document.getElementById("print-page-style");
  if (!style) {
    style = document.createElement("style");
    style.id = "print-page-style";
    document.head.appendChild(style);
  }
  style.textContent = `@media print { @page { size: ${sizeCss}; margin: 14mm; } }`;
}

/* ------------------------------------------------------------
   PDF 저장 (브라우저 인쇄 → "PDF로 저장")
   ------------------------------------------------------------ */
function saveAsPdf() {
  const title = els.title.value.trim();
  const prev = document.title;
  if (title) document.title = title; // 저장 파일명 힌트
  window.print();
  setTimeout(() => (document.title = prev), 500);
}

/* ------------------------------------------------------------
   이벤트
   ------------------------------------------------------------ */
function bind() {
  const inputs = [
    els.title, els.author, els.pageSize, els.fontSize,
    els.fontFamily, els.dropcap, els.autoQuote, els.log,
  ];
  inputs.forEach((el) => {
    el.addEventListener("input", renderBook);
    el.addEventListener("change", renderBook);
  });
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

  // Ctrl/Cmd + P → 우리 PDF 저장 흐름 사용
  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p") {
      e.preventDefault();
      saveAsPdf();
    }
  });
}

bind();
renderBook();
