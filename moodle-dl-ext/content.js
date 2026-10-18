// content.js — v1.1.0
(() => {
  'use strict';

  const HOST = 'etest.bsmu.by';
  if (location.hostname !== HOST) return;
  if (window.__mdlDlInjected) return;
  window.__mdlDlInjected = true;

  // ============ Стили ============
  const style = document.createElement('style');
  style.textContent = `
    .mdl-dl-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin: 6px 0;
      padding: 5px 14px;
      font-size: 13px;
      font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
      font-weight: 500;
      color: #fff;
      background: #156b1b;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      transition: background .15s;
      white-space: nowrap;
    }
    .mdl-dl-btn:hover:not(:disabled) { background: #1a8a24; }
    .mdl-dl-btn:disabled { background: #97a4c0; cursor: not-allowed; }
    .mdl-dl-btn.mdl-dl-err { background: #b00020; }
    .mdl-dl-btn.mdl-dl-ok  { background: #0b5e11; }

    .mdl-dl-panel {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 99999;
      background: #0d1117;
      color: #c9d1d9;
      padding: 12px 16px;
      border-radius: 10px;
      font-family: ui-monospace, Consolas, monospace;
      font-size: 12px;
      box-shadow: 0 6px 24px rgba(0,0,0,.35);
      max-width: 420px;
      max-height: 260px;
      overflow-y: auto;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
      border: 1px solid #30363d;
    }
    .mdl-dl-panel .hdr {
      font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      font-weight: 600;
      color: #79c0ff;
      margin-bottom: 6px;
      border-bottom: 1px solid #30363d;
      padding-bottom: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .mdl-dl-panel .hdr button {
      background: transparent;
      color: #8b949e;
      border: none;
      cursor: pointer;
      font-size: 14px;
      padding: 0 4px;
    }
    .mdl-dl-panel .hdr button:hover { color: #ff7b72; }
    .mdl-dl-panel .ok  { color: #7ee787; }
    .mdl-dl-panel .err { color: #ff7b72; }
  `;
  document.head.appendChild(style);

  // ============ Лог-панель ============
  let panelEl = null, panelBody = null;
  function getPanel() {
    if (panelEl && document.body.contains(panelEl)) return panelBody;
    panelEl = document.createElement('div');
    panelEl.className = 'mdl-dl-panel';
    const hdr = document.createElement('div');
    hdr.className = 'hdr';
    const title = document.createElement('span');
    title.textContent = 'Moodle DL';
    hdr.appendChild(title);
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.onclick = () => panelEl.remove();
    hdr.appendChild(closeBtn);
    panelEl.appendChild(hdr);
    panelBody = document.createElement('div');
    panelEl.appendChild(panelBody);
    document.body.appendChild(panelEl);
    return panelBody;
  }
  function panelClear() { const b = getPanel(); b.innerHTML = ''; }
  function panelLog(cls, text) {
    const b = getPanel();
    const line = document.createElement('div');
    if (cls) line.className = cls;
    line.textContent = text;
    b.appendChild(line);
    panelEl.scrollTop = panelEl.scrollHeight;
  }

  // ============ Утилиты ============
  function extractSlidesFromHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = [];
    doc.querySelectorAll('slide').forEach((el) => {
      const d = el.getAttribute('data');
      if (d && d.length > 50) out.push(d);
    });
    return out;
  }

  function b64ToBytes(b64) {
    const clean = b64.replace(/\s+/g, '');
    const bin = atob(clean);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function sanitizeFileName(n) {
    return (n || 'lecture')
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
  }

  // ============ Сборка PDF ============
  async function buildAndDownloadPdf(slideDataArr, fileName, onLog) {
    const PDFLib = window.PDFLib;
    if (!PDFLib) throw new Error('pdf-lib не загружен');
    const { PDFDocument } = PDFLib;

    const pdf = await PDFDocument.create();
    let ok = 0, bad = 0;

    for (let i = 0; i < slideDataArr.length; i++) {
      let bytes;
      try { bytes = b64ToBytes(slideDataArr[i]); }
      catch (e) { bad++; continue; }

      let img;
      try { img = await pdf.embedJpg(bytes); }
      catch (e1) {
        try { img = await pdf.embedPng(bytes); }
        catch (e2) { bad++; continue; }
      }

      const page = pdf.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      ok++;
      if (ok <= 3 || ok === slideDataArr.length) {
        onLog('ok', '  slide ' + ok + ' (' + Math.round(bytes.length/1024) + ' KB)');
      } else if (ok === 4) {
        onLog('', '  ... ' + (slideDataArr.length - 3) + ' more');
      }
    }

    const outBytes = await pdf.save();
    const blob = new Blob([outBytes], { type: 'application/pdf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = sanitizeFileName(fileName) + '.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 15000);
    return { ok, bad, pages: pdf.getPageCount() };
  }

  // ============ Кнопка ============
  function makeButton(label, onClick) {
    const btn = document.createElement('button');
    btn.className = 'mdl-dl-btn';
    btn.textContent = label;
    btn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const orig = label;
      btn.disabled = true;
      btn.classList.remove('mdl-dl-ok', 'mdl-dl-err');
      btn.textContent = '...';
      panelClear();
      try {
        await onClick();
        btn.classList.add('mdl-dl-ok');
        btn.textContent = 'Готово';
      } catch (err) {
        btn.classList.add('mdl-dl-err');
        btn.textContent = 'Ошибка';
        btn.title = err.message;
        panelLog('err', err.message);
        console.error('[Moodle DL]', err);
      }
      setTimeout(() => {
        btn.disabled = false;
        btn.classList.remove('mdl-dl-ok', 'mdl-dl-err');
        btn.textContent = orig;
      }, 2500);
    };
    return btn;
  }

  // ============ Заголовок страницы как имя файла ============
  function getPageTitle() {
    const h1 = document.querySelector('h1.h2, .page-header-headings h1');
    if (h1) return h1.textContent.trim();
    const t = document.title.split('|')[0].trim();
    return t.replace(/^Курс:\s*/i, '') || 'lecture';
  }

  // ============ Главная логика ============
  function inject() {
    // 1) Найти элемент <presentation> на странице.
    //    Если его нет — ничего не делаем (значит это не лекция со слайдами).
    const presentation = document.querySelector('presentation');
    if (!presentation) {
      // Лекция грузится через footer.js при событии load — подождём
      return false;
    }

    // Не дублировать
    if (presentation.dataset.mdlDlInjected) return true;
    presentation.dataset.mdlDlInjected = '1';

    // 2) Собрать слайды прямо из DOM (они уже вставлены как <slide data="...">)
    const slides = [...presentation.querySelectorAll('slide')]
      .map((el) => el.getAttribute('data'))
      .filter((d) => d && d.length > 50);

    // 3) Заголовок для имени файла
    const title = getPageTitle();

    // 4) Кнопка
    const btn = makeButton('Скачать PDF (' + slides.length + ' слайдов)', async () => {
      panelClear();
      panelLog('', '— ' + title);
      panelLog('', 'slides in DOM: ' + slides.length);
      if (!slides.length) throw new Error('нет слайдов');
      const r = await buildAndDownloadPdf(slides, title, panelLog);
      panelLog('ok', 'DONE: ' + r.pages + ' pages' + (r.bad ? ', corrupted: ' + r.bad : ''));
    });

    // 5) Вставить перед контейнером presentation (или в его родителя, над "Presentation:")
    //    На странице есть строка "Presentation:" — она внутри <p> или <div>, идём выше
    let host = presentation.parentElement;
    // поднимаемся, пока родитель — просто обёртка без текста; хотим вставить
    // прямо перед presentation, чтобы кнопка была над слайдами
    host.insertBefore(btn, presentation);

    return true;
  }

  // ============ Ждём появления <presentation> ============
  function start() {
    // popup.js (footer.js) генерирует <presentation> при DOMContentLoaded,
    // но иногда позже. Наблюдаем за DOM, пока не появится.
    if (inject()) return;

    const mo = new MutationObserver(() => {
      if (inject()) mo.disconnect();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });

    // страховка: через 5 сек ещё раз
    setTimeout(() => { inject(); }, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();