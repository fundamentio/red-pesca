(() => {
  "use strict";

  const ROWS = 200;
  const COLS = 10;
  const LETTERS = "ABCDEFGHIJ";
  const STORE_KEY = "redpesca:v1";

  const $ = (sel) => document.querySelector(sel);
  const net = $("#net");

  // ---------- Estado ----------
  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.cells === "object") {
          return { currency: parsed.currency || "USD", cells: parsed.cells };
        }
      }
    } catch (_) { /* almacenamiento no disponible */ }
    return { currency: "USD", cells: {} };
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (_) { toast("No se pudo guardar en este navegador"); }
  }

  const key = (r, c) => `${r}-${c}`;
  const label = (r, c) => `${LETTERS[c]}${r + 1}`;

  function cost(item) {
    if (!item) return 0;
    const unit = Number(item.unit) || 0;
    const qty = item.qty === "" || item.qty == null ? 1 : Number(item.qty) || 0;
    return unit * qty;
  }

  // ---------- Formato ----------
  let money;
  function setFormatter() {
    money = new Intl.NumberFormat("es", { style: "currency", currency: state.currency });
  }
  setFormatter();

  function compact(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "k";
    if (n >= 10) return String(Math.round(n));
    return String(Math.round(n * 10) / 10);
  }

  // ---------- Construcción de la red ----------
  function build() {
    // Un solo innerHTML es mucho más rápido que crear 2200 nodos uno a uno
    let html = "";
    for (let r = 0; r < ROWS; r++) {
      html += `<div class="net-row${(r + 1) % 10 === 0 ? " mark" : ""}" role="row">` +
        `<button type="button" class="rowlabel" data-row="${r}" aria-label="Total de la fila ${r + 1}">${r + 1}</button>`;
      for (let c = 0; c < COLS; c++) {
        html += `<button type="button" class="cell" data-r="${r}" data-c="${c}" role="gridcell" aria-label="Paño ${label(r, c)}: vacío"><span></span></button>`;
      }
      html += "</div>";
    }
    net.innerHTML = html;
  }

  function cellEl(r, c) {
    return net.children[r].children[c + 1];
  }

  // ---------- Render ----------
  // Se actualiza sólo lo que cambia: el paño editado, su fila y los totales.
  // Los niveles de color dependen del máximo; sólo si éste cambia se repintan
  // los paños con costo (nunca los 2000).
  let currentMax = 0;
  let painted = new Set(); // paños pintados con costo (para limpiarlos luego)

  function stats() {
    let total = 0, count = 0, max = 0;
    for (const k in state.cells) {
      const v = cost(state.cells[k]);
      total += v;
      count++;
      if (v > max) max = v;
    }
    return { total, count, max };
  }

  function rowTotal(r) {
    let t = 0;
    for (let c = 0; c < COLS; c++) t += cost(state.cells[key(r, c)]);
    return t;
  }

  function rowHasItems(r) {
    for (let c = 0; c < COLS; c++) if (state.cells[key(r, c)]) return true;
    return false;
  }

  function paintCell(r, c) {
    const el = cellEl(r, c);
    const item = state.cells[key(r, c)];
    const span = el.firstChild;
    if (item) {
      const v = cost(item);
      span.textContent = compact(v);
      el.dataset.l = currentMax > 0 ? Math.max(1, Math.ceil((v / currentMax) * 4)) : 1;
      el.setAttribute("aria-label", `Paño ${label(r, c)}: ${money.format(v)}${item.concept ? ", " + item.concept : ""}`);
    } else {
      span.textContent = "";
      delete el.dataset.l;
      el.setAttribute("aria-label", `Paño ${label(r, c)}: vacío`);
    }
  }

  function paintRowLabel(r) {
    net.children[r].firstChild.classList.toggle("has-cost", rowHasItems(r));
  }

  function paintTotals(s) {
    $("#grandTotal").textContent = money.format(s.total);
    $("#filledCount").textContent = s.count;
  }

  // Tras cambiar UN paño
  function refreshCell(r, c) {
    const s = stats();
    if (s.max !== currentMax) {
      currentMax = s.max;
      for (const k in state.cells) {
        const [kr, kc] = k.split("-").map(Number);
        paintCell(kr, kc);
      }
    }
    paintCell(r, c);
    painted.add(key(r, c));
    paintRowLabel(r);
    paintTotals(s);
  }

  // Repintado completo: al cargar, restaurar, borrar todo o cambiar moneda.
  // Sólo se tocan paños/filas que tienen o tenían costo.
  function renderAll() {
    const s = stats();
    currentMax = s.max;
    const now = new Set(Object.keys(state.cells));
    const rows = new Set();
    for (const k of new Set([...painted, ...now])) {
      const [r, c] = k.split("-").map(Number);
      paintCell(r, c);
      rows.add(r);
    }
    rows.forEach(paintRowLabel);
    painted = now;
    paintTotals(s);
  }

  // ---------- Edición de paño ----------
  const cellDialog = $("#cellDialog");
  const form = $("#cellForm");
  let editing = null;

  function openCell(r, c) {
    editing = { r, c };
    const item = state.cells[key(r, c)] || {};
    $("#cellTitle").textContent = `Paño ${label(r, c)} · fila ${r + 1}, columna ${LETTERS[c]}`;
    form.concept.value = item.concept || "";
    form.qty.value = item.qty ?? "";
    form.unit.value = item.unit ?? "";
    form.note.value = item.note || "";
    updateSubtotal();
    openSheet(cellDialog);
    // En móvil no forzamos el foco para no abrir el teclado sin querer
    if (matchMedia("(pointer: fine)").matches) form.concept.focus();
  }

  function updateSubtotal() {
    $("#cellSubtotal").textContent = money.format(cost({ qty: form.qty.value, unit: form.unit.value }));
  }
  form.qty.addEventListener("input", updateSubtotal);
  form.unit.addEventListener("input", updateSubtotal);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!editing) return;
    const { r, c } = editing;
    const item = {
      concept: form.concept.value.trim(),
      qty: form.qty.value,
      unit: form.unit.value,
      note: form.note.value.trim(),
    };
    const empty = !item.concept && !item.note && item.unit === "" && item.qty === "";
    if (empty) delete state.cells[key(r, c)];
    else state.cells[key(r, c)] = item;
    cellDialog.close();
    refreshCell(r, c);
    save();
  });

  $("#btnCancel").addEventListener("click", () => cellDialog.close());
  $("#btnClearCell").addEventListener("click", () => {
    if (!editing) return;
    delete state.cells[key(editing.r, editing.c)];
    cellDialog.close();
    refreshCell(editing.r, editing.c);
    save();
    toast(`Paño ${label(editing.r, editing.c)} vaciado`);
  });

  net.addEventListener("click", (e) => {
    const cell = e.target.closest(".cell");
    if (cell) return openCell(Number(cell.dataset.r), Number(cell.dataset.c));
    const rl = e.target.closest(".rowlabel");
    if (rl) {
      const r = Number(rl.dataset.row);
      toast(`Fila ${r + 1}: ${money.format(rowTotal(r))}`);
    }
  });

  // ---------- Diálogos genéricos ----------
  // Se usa show() + scrim propio en vez de showModal(): showModal vuelve inerte
  // todo el documento (2000 paños) y eso cuesta un recálculo de estilos en cada toque.
  const scrim = $("#scrim");
  let openDialog = null;

  function openSheet(d) {
    if (openDialog && openDialog !== d) openDialog.close();
    openDialog = d;
    scrim.hidden = false;
    d.show();
  }

  document.querySelectorAll("dialog").forEach((d) => {
    d.addEventListener("close", () => {
      if (openDialog === d) { openDialog = null; scrim.hidden = true; }
    });
    d.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => d.close()));
  });
  scrim.addEventListener("click", () => openDialog && openDialog.close());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openDialog) openDialog.close();
  });

  // ---------- Ir a fila ----------
  $("#btnJump").addEventListener("click", () => {
    const v = prompt(`Ir a fila (1–${ROWS}):`);
    if (v == null) return;
    const r = parseInt(v, 10);
    if (!(r >= 1 && r <= ROWS)) return toast("Fila inválida");
    goToRow(r - 1);
  });

  function goToRow(r) {
    const row = net.children[r];
    const header = $(".stick").offsetHeight;
    const y = row.getBoundingClientRect().top + window.scrollY - header - 8;
    window.scrollTo({ top: y, behavior: "smooth" });
    for (let c = 0; c < COLS; c++) {
      const el = cellEl(r, c);
      el.classList.remove("flash");
      void el.offsetWidth;
      el.classList.add("flash");
    }
  }

  // ---------- Resumen ----------
  const summaryDialog = $("#summaryDialog");
  $("#btnSummary").addEventListener("click", () => {
    const { total, count } = stats();
    $("#sTotal").textContent = money.format(total);
    $("#sCount").textContent = `${count} / ${ROWS * COLS}`;
    $("#sAvg").textContent = money.format(count ? total / count : 0);

    let maxK = null, maxV = -1;
    for (const k in state.cells) {
      const v = cost(state.cells[k]);
      if (v > maxV) { maxV = v; maxK = k; }
    }
    if (maxK) {
      const [r, c] = maxK.split("-").map(Number);
      $("#sMax").textContent = `${label(r, c)} · ${money.format(maxV)}`;
    } else {
      $("#sMax").textContent = "—";
    }

    const list = $("#rowList");
    list.textContent = "";
    for (let r = 0; r < ROWS; r++) {
      if (!rowHasItems(r)) continue;
      const t = rowTotal(r);
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.innerHTML = `<span></span><strong></strong>`;
      b.firstChild.textContent = `Fila ${r + 1}`;
      b.lastChild.textContent = money.format(t);
      b.addEventListener("click", () => { summaryDialog.close(); goToRow(r); });
      li.appendChild(b);
      list.appendChild(li);
    }
    if (!list.children.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "Aún no hay paños con costo. Toca cualquier paño de la red para agregar uno.";
      list.appendChild(li);
    }
    openSheet(summaryDialog);
  });

  // ---------- Menú ----------
  const menuDialog = $("#menuDialog");
  const currencySel = $("#currency");
  $("#btnMenu").addEventListener("click", () => {
    currencySel.value = state.currency;
    openSheet(menuDialog);
  });

  currencySel.addEventListener("change", () => {
    state.currency = currencySel.value;
    setFormatter();
    save();
    renderAll();
  });

  $("#btnCsv").addEventListener("click", () => {
    const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const lines = [["Paño", "Fila", "Columna", "Concepto", "Cantidad", "Costo unitario", "Subtotal", "Nota"].join(",")];
    let total = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const it = state.cells[key(r, c)];
        if (!it) continue;
        const v = cost(it);
        total += v;
        lines.push([label(r, c), r + 1, LETTERS[c], esc(it.concept), it.qty || 1, it.unit || 0, v.toFixed(2), esc(it.note)].join(","));
      }
    }
    lines.push(["TOTAL", "", "", "", "", "", total.toFixed(2), ""].join(","));
    download(`red-pesca-${today()}.csv`, "﻿" + lines.join("\r\n"), "text/csv;charset=utf-8");
  });

  $("#btnJson").addEventListener("click", () => {
    download(`red-pesca-${today()}.json`, JSON.stringify({ app: "red-pesca", version: 1, ...state }, null, 2), "application/json");
  });

  $("#fileJson").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || typeof data.cells !== "object") throw new Error("formato");
      const cells = {};
      for (const k in data.cells) {
        const m = /^(\d+)-(\d+)$/.exec(k);
        if (!m || +m[1] >= ROWS || +m[2] >= COLS) continue;
        const it = data.cells[k] || {};
        cells[k] = {
          concept: String(it.concept || "").slice(0, 80),
          qty: it.qty === "" || it.qty == null ? "" : String(Number(it.qty) || 0),
          unit: it.unit === "" || it.unit == null ? "" : String(Number(it.unit) || 0),
          note: String(it.note || "").slice(0, 240),
        };
      }
      if (!confirm(`¿Reemplazar la red actual con ${Object.keys(cells).length} paños del respaldo?`)) return;
      state = { currency: data.currency || state.currency, cells };
      setFormatter();
      save();
      renderAll();
      menuDialog.close();
      toast("Respaldo restaurado");
    } catch (_) {
      toast("Archivo no válido");
    }
  });

  $("#btnReset").addEventListener("click", () => {
    if (!confirm("¿Borrar todos los costos de la red? Esta acción no se puede deshacer.")) return;
    state.cells = {};
    save();
    renderAll();
    menuDialog.close();
    toast("Red vaciada");
  });

  // ---------- Utilidades ----------
  function today() { return new Date().toISOString().slice(0, 10); }

  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  build();
  renderAll();
})();
