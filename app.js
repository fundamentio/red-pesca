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
    const frag = document.createDocumentFragment();
    for (let r = 0; r < ROWS; r++) {
      const row = document.createElement("div");
      row.className = "net-row" + ((r + 1) % 10 === 0 ? " mark" : "");
      row.setAttribute("role", "row");

      const rl = document.createElement("button");
      rl.type = "button";
      rl.className = "rowlabel";
      rl.dataset.row = r;
      rl.textContent = r + 1;
      rl.setAttribute("aria-label", `Total de la fila ${r + 1}`);
      row.appendChild(rl);

      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "cell";
        cell.dataset.r = r;
        cell.dataset.c = c;
        cell.setAttribute("role", "gridcell");
        cell.appendChild(document.createElement("span"));
        row.appendChild(cell);
      }
      frag.appendChild(row);
    }
    net.appendChild(frag);
  }

  function cellEl(r, c) {
    return net.children[r].children[c + 1];
  }

  // ---------- Render ----------
  function render() {
    let total = 0, count = 0, max = 0;
    const rowTotals = new Array(ROWS).fill(0);

    for (const k in state.cells) {
      const v = cost(state.cells[k]);
      const r = Number(k.split("-")[0]);
      rowTotals[r] += v;
      total += v;
      count++;
      if (v > max) max = v;
    }

    for (let r = 0; r < ROWS; r++) {
      const rowEl = net.children[r];
      rowEl.children[0].classList.toggle("has-cost", rowTotals[r] > 0);
      for (let c = 0; c < COLS; c++) {
        const el = rowEl.children[c + 1];
        const item = state.cells[key(r, c)];
        const v = cost(item);
        const span = el.firstChild;
        if (item) {
          span.textContent = compact(v);
          el.dataset.l = max > 0 ? Math.max(1, Math.ceil((v / max) * 4)) : 1;
          el.setAttribute("aria-label", `Paño ${label(r, c)}: ${money.format(v)}${item.concept ? ", " + item.concept : ""}`);
        } else {
          span.textContent = "";
          delete el.dataset.l;
          el.setAttribute("aria-label", `Paño ${label(r, c)}: vacío`);
        }
      }
    }

    $("#grandTotal").textContent = money.format(total);
    $("#filledCount").textContent = count;
    return { total, count, max, rowTotals };
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
    cellDialog.showModal();
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
    save();
    render();
    cellDialog.close();
  });

  $("#btnCancel").addEventListener("click", () => cellDialog.close());
  $("#btnClearCell").addEventListener("click", () => {
    if (!editing) return;
    delete state.cells[key(editing.r, editing.c)];
    save();
    render();
    cellDialog.close();
    toast(`Paño ${label(editing.r, editing.c)} vaciado`);
  });

  net.addEventListener("click", (e) => {
    const cell = e.target.closest(".cell");
    if (cell) return openCell(Number(cell.dataset.r), Number(cell.dataset.c));
    const rl = e.target.closest(".rowlabel");
    if (rl) {
      const r = Number(rl.dataset.row);
      let t = 0;
      for (let c = 0; c < COLS; c++) t += cost(state.cells[key(r, c)]);
      toast(`Fila ${r + 1}: ${money.format(t)}`);
    }
  });

  // ---------- Diálogos genéricos ----------
  document.querySelectorAll("dialog").forEach((d) => {
    // Cerrar tocando fuera de la hoja
    d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
    d.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => d.close()));
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
    const { total, count, rowTotals } = render();
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
    rowTotals.forEach((t, r) => {
      const filled = Array.from({ length: COLS }, (_, c) => state.cells[key(r, c)]).some(Boolean);
      if (!filled) return;
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.innerHTML = `<span></span><strong></strong>`;
      b.firstChild.textContent = `Fila ${r + 1}`;
      b.lastChild.textContent = money.format(t);
      b.addEventListener("click", () => { summaryDialog.close(); goToRow(r); });
      li.appendChild(b);
      list.appendChild(li);
    });
    if (!list.children.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "Aún no hay paños con costo. Toca cualquier paño de la red para agregar uno.";
      list.appendChild(li);
    }
    summaryDialog.showModal();
  });

  // ---------- Menú ----------
  const menuDialog = $("#menuDialog");
  const currencySel = $("#currency");
  $("#btnMenu").addEventListener("click", () => {
    currencySel.value = state.currency;
    menuDialog.showModal();
  });

  currencySel.addEventListener("change", () => {
    state.currency = currencySel.value;
    setFormatter();
    save();
    render();
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
      render();
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
    render();
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
  render();
})();
