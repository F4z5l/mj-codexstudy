(function applySavedTheme() {
  const saved = localStorage.getItem("codex-studys-theme");
  if (!saved || saved === "system") return;
  document.documentElement.setAttribute("data-theme", saved);
})();

const FALLBACK_THUMB = "assets/codex-telegram.png";
let allBatches = [];
let activeFilter = "all";
let searchQuery = "";
let sortMode = "relevance";
let langFilter = "all";
let visibleCount = 24;
const PAGE_SIZE = 24;

const $ = (selector) => document.querySelector(selector);
const THUMB_PLACEHOLDER_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
window.__thumbFallback = (img) => { img.outerHTML = THUMB_PLACEHOLDER_SVG; };
const $$ = (selector) => [...document.querySelectorAll(selector)];

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[character]));
}

function categoryFor(batch) {
  if (batch.category && ["jee", "neet", "school", "exam"].includes(batch.category) && batch.category !== "exam") return batch.category;
  const text = `${batch.name || ""} ${batch.byName || ""}`.toLowerCase();
  if (/\bjee\b|iit/.test(text)) return "jee";
  if (/neet|medical/.test(text)) return "neet";
  if (/class|cbse|icse|school|commerce|humanities/.test(text)) return "school";
  return "exam";
}

function deepSearchText(batch) {
  if (batch.__searchText) return batch.__searchText;
  const parts = [batch.name, batch.byName, batch.language, batch.type, (batch.slug || "").replace(/-/g, " ")];
  (batch.subBatches || []).forEach((sub) => parts.push(sub.name, sub.byName));
  const text = parts.filter(Boolean).join(" ").toLowerCase();
  Object.defineProperty(batch, "__searchText", { value: text, enumerable: false, writable: true });
  return text;
}

function deepSearchScore(batch, queryWords, rawQuery) {
  const name = (batch.name || "").toLowerCase();
  const text = deepSearchText(batch);
  if (!queryWords.every((word) => text.includes(word))) return 0;
  if (name === rawQuery) return 100;
  if (name.startsWith(rawQuery)) return 80;
  if (name.includes(rawQuery)) return 60;
  if (queryWords.every((word) => name.includes(word))) return 40;
  return 20;
}

function deepSearch(batches, query) {
  const rawQuery = query.trim().toLowerCase();
  if (!rawQuery) return batches;
  const queryWords = rawQuery.split(/\s+/).filter(Boolean);
  return batches
    .map((batch) => ({ batch, score: deepSearchScore(batch, queryWords, rawQuery) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.batch);
}

function openBatch(batch) {
  const id = batch && (batch._id || batch.batch_id);
  if (!id) return showToast("This course is not available right now.");
  addRecentlyViewed(batch);
  try { window.CXProfile && window.CXProfile.trackBatch(batch); } catch (e) {}
  renderRecentlyWatched();
  try { sessionStorage.setItem("cx-scroll", String(Math.round(window.scrollY))); } catch (e) {}
  $$(".overlay.visible").forEach((modal) => closeModal(modal.id));
  mjOpenCourse(batch); // direct access -> folders -> lectures / notes
}

function getRecentlyViewed() {
  try { return JSON.parse(localStorage.getItem("codex-studys-recent") || "[]"); }
  catch { return []; }
}

function addRecentlyViewed(batch) {
  const id = batch._id || batch.batch_id;
  if (!id) return;
  const entry = { _id: id, name: batch.name || "Untitled course", byName: batch.byName || "", language: batch.language || "", previewImage: batch.previewImage || "" };
  const recent = getRecentlyViewed().filter((item) => item._id !== id);
  recent.unshift(entry);
  localStorage.setItem("codex-studys-recent", JSON.stringify(recent.slice(0, 8)));
}

function renderRecentlyWatched() {
  const statRecent = document.getElementById("statRecent");
  if (statRecent) statRecent.textContent = String(getRecentlyViewed().length);
  const section = document.getElementById("recentSection");
  const row = document.getElementById("recentRow");
  if (!section || !row) return;
  const items = getRecentlyViewed();
  if (!items.length) { section.style.display = "none"; row.innerHTML = ""; return; }
  section.style.display = "block";
  row.innerHTML = items.map((item) => `
    <button class="recent-item" type="button" data-recent-id="${escapeHtml(item._id)}">
      <img class="recent-thumb" src="${escapeHtml(item.previewImage || FALLBACK_THUMB)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.src='${FALLBACK_THUMB}'">
      <span class="recent-info">
        <span class="recent-name">${escapeHtml(item.name || "Course")}</span>
        <span class="recent-sub">${escapeHtml(item.byName || item.language || "Continue watching")}</span>
      </span>
    </button>`).join("");
  row.querySelectorAll("[data-recent-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.recentId;
      const full = allBatches.find((batch) => (batch._id || batch.batch_id) === id);
      openBatch(full || items.find((item) => item._id === id));
    });
  });
}

function setupRecentlyWatched() {
  renderRecentlyWatched();
  document.getElementById("recentClearBtn")?.addEventListener("click", () => {
    localStorage.removeItem("codex-studys-recent");
    renderRecentlyWatched();
    showToast("Recently watched cleared.");
  });
}

function setupQuickInstall() {
  const button = document.getElementById("installQuickBtn");
  if (!button) return;
  button.addEventListener("click", () => openModal("installModal"));
}

function getFavorites() {
  try { return JSON.parse(localStorage.getItem("codex-studys-favorites") || "[]"); }
  catch { return []; }
}

function isFavorite(id) {
  return getFavorites().includes(id);
}

function toggleFavorite(id) {
  const favorites = getFavorites();
  const index = favorites.indexOf(id);
  if (index === -1) favorites.push(id); else favorites.splice(index, 1);
  localStorage.setItem("codex-studys-favorites", JSON.stringify(favorites));
  return favorites.includes(id);
}

function updateFavoritesCount() {
  const count = getFavorites().length;
  const button = $('.filter-row .filter[data-filter="favorites"]');
  if (button) button.textContent = count ? `❤ Favorite Batches (${count})` : "❤ Favorite Batches";
  const navBadge = $("#favNavBadge");
  if (navBadge) {
    navBadge.textContent = String(count);
    navBadge.style.display = count ? "grid" : "none";
  }
  const statFav = $("#statFav");
  if (statFav) statFav.textContent = count.toLocaleString();
}

function filteredBatches() {
  let batches;
  if (activeFilter === "favorites") {
    const favorites = getFavorites();
    batches = allBatches.filter((batch) => favorites.includes(batch._id || batch.batch_id || ""));
  } else {
    batches = allBatches.filter((batch) => activeFilter === "all" || categoryFor(batch) === activeFilter);
  }
  if (langFilter !== "all") {
    batches = batches.filter((batch) => (batch.language || "").toLowerCase().includes(langFilter));
  }
  if (searchQuery.trim()) {
    batches = deepSearch(batches, searchQuery);
  }
  if (sortMode === "az") {
    batches = [...batches].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  } else if (sortMode === "za") {
    batches = [...batches].sort((a, b) => (b.name || "").localeCompare(a.name || ""));
  } else if (sortMode === "newest") {
    batches = [...batches].sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0));
  }
  return batches;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (isNaN(date)) return "";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function isRecent(value) {
  if (!value) return false;
  const date = new Date(value);
  if (isNaN(date)) return false;
  const days = (Date.now() - date.getTime()) / 86400000;
  return days >= 0 && days <= 21;
}

function courseCard(batch) {
  const title = escapeHtml(batch.name || "Untitled course");
  const description = escapeHtml(batch.byName || "Structured learning for your next milestone");
  const language = escapeHtml(batch.language || "Self-paced");
  const category = categoryFor(batch);
  const image = escapeHtml(batch.previewImage || FALLBACK_THUMB);
  const id = escapeHtml(batch._id || batch.batch_id || "");
  const favActive = isFavorite(id);
  const startDate = formatDate(batch.startDate);
  const fresh = isRecent(batch.startDate);
  return `
    <article class="course-card" data-id="${id}" tabindex="0" role="button" aria-label="Open ${title}">
      <div class="course-thumb">
        <div class="thumb-fallback thumb-shimmer"></div>
        <img src="${image}" alt="" loading="lazy" referrerpolicy="no-referrer" onload="this.classList.add('loaded');this.previousElementSibling.style.display='none'" onerror="this.style.display='none'">
        <span class="course-tag">${escapeHtml(category)}</span>
        ${fresh ? '<span class="course-tag course-tag-new">NEW</span>' : ""}
        <button class="fav-btn${favActive ? " active" : ""}" type="button" data-fav-id="${id}" aria-label="${favActive ? "Remove from favorites" : "Add to favorites"}" aria-pressed="${favActive}">
          <svg viewBox="0 0 24 24" fill="${favActive ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><path d="M12 21s-7.2-4.5-9.6-9C.6 8.1 2.4 4.5 6 4.2c2.1-.15 3.6 1.05 6 3.3 2.4-2.25 3.9-3.45 6-3.3 3.6.3 5.4 3.9 3.6 7.8-2.4 4.5-9.6 9-9.6 9Z"/></svg>
        </button>
        <button class="info-btn" type="button" data-info-id="${id}" aria-label="Quick view details">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.6v.6"/></svg>
        </button>
        ${getNote(id) ? '<span class="note-badge">📝 Note</span>' : ""}
      </div>
      <div class="course-chips"><span class="chip">${language}</span><span class="chip chip-accent">${escapeHtml(category)}</span></div>
      <div class="course-body">
        <h3 class="course-title">${title}</h3>
        <p class="course-description">${description}</p>
        <div class="course-meta"><span>${startDate ? `📅 ${startDate}` : language}</span><button class="course-cta" type="button">Let's Study <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></div>
      </div>
    </article>`;
}

function syncUrlParams() {
  const params = new URLSearchParams();
  if (activeFilter !== "all") params.set("filter", activeFilter);
  if (searchQuery.trim()) params.set("q", searchQuery.trim());
  if (sortMode !== "relevance") params.set("sort", sortMode);
  if (langFilter !== "all") params.set("lang", langFilter);
  const query = params.toString();
  const newUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState(null, "", newUrl);
}

function renderBatches() {
  const grid = $("#batchGrid");
  const loadMoreBtn = $("#loadMoreBtn");
  const batches = filteredBatches();
  const visible = batches.slice(0, visibleCount);
  const filterLabel = activeFilter === "all" ? "courses" : activeFilter === "favorites" ? "favorite courses" : `${activeFilter.toUpperCase()} courses`;
  const noteText = batches.length
    ? `Showing ${visible.length} of ${batches.length.toLocaleString()} ${filterLabel}.`
    : activeFilter === "favorites" ? "No favorites yet. Tap the heart on any course to save it here." : "No courses matched that filter yet.";
  $("#resultsNote").textContent = noteText;
  const announcer = $("#filterAnnouncer");
  if (announcer) announcer.textContent = noteText;
  grid.innerHTML = visible.length ? visible.map(courseCard).join("") : '<div class="empty">Try another category or search the full library.</div>';
  $$(".course-card").forEach((card, index) => {
    card.addEventListener("click", () => openBatch(visible[index]));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openBatch(visible[index]);
      }
    });
  });
  $$(".fav-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const nowActive = toggleFavorite(button.dataset.favId);
      button.classList.toggle("active", nowActive);
      button.setAttribute("aria-pressed", String(nowActive));
      button.querySelector("svg").setAttribute("fill", nowActive ? "currentColor" : "none");
      if (nowActive) {
        button.classList.remove("pop");
        void button.offsetWidth;
        button.classList.add("pop");
      }
      if (activeFilter === "favorites" && !nowActive) renderBatches();
      updateFavoritesCount();
    });
  });
  $$(".info-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const batch = visible.find((item) => (item._id || item.batch_id || "") === button.dataset.infoId);
      if (batch) openDetail(batch);
    });
  });
  if (loadMoreBtn) {
    const remaining = batches.length - visible.length;
    loadMoreBtn.style.display = remaining > 0 ? "inline-flex" : "none";
    loadMoreBtn.textContent = remaining > 0 ? "Loading more courses…" : "";
  }
  const clearBtn = $("#clearFiltersBtn");
  if (clearBtn) clearBtn.style.display = (activeFilter !== "all" || searchQuery.trim()) ? "inline-flex" : "none";
  syncUrlParams();
}

function getSearchHistory() {
  try { return JSON.parse(localStorage.getItem("codex-studys-search-history") || "[]"); }
  catch { return []; }
}

function addSearchHistory(term) {
  const trimmed = term.trim();
  if (!trimmed) return;
  const history = getSearchHistory().filter((item) => item.toLowerCase() !== trimmed.toLowerCase());
  history.unshift(trimmed);
  localStorage.setItem("codex-studys-search-history", JSON.stringify(history.slice(0, 6)));
}

function highlightMatch(text, query) {
  const safe = escapeHtml(text || "");
  if (!query) return safe;
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean).map((w) => escapeHtml(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return safe;
  return safe.replace(new RegExp(`(${words.join("|")})`, "gi"), "<mark>$1</mark>");
}

function renderSearchResults(query = "") {
  const results = $("#searchResults");
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    const history = getSearchHistory();
    const recent = getRecentlyViewed();
    if (!history.length && !recent.length) {
      results.innerHTML = '<div class="search-hint">Start typing to find your next course.</div>';
      return;
    }
    let html = "";
    if (history.length) {
      html += `<div class="search-hint" style="text-align:left;margin-bottom:2px;">Recent searches</div>
        <div class="search-history-row">${history.map((term) => `<button type="button" class="search-history-chip">${escapeHtml(term)}</button>`).join("")}</div>`;
    }
    if (recent.length) {
      html += `<div class="search-hint" style="text-align:left;margin-bottom:2px;">Recently viewed</div>` + recent.map((batch) => `
        <div class="search-result" data-id="${escapeHtml(batch._id)}">
          <div class="search-result-thumb">${batch.previewImage ? `<img src="${escapeHtml(batch.previewImage)}" alt="" referrerpolicy="no-referrer" onerror="window.__thumbFallback(this)">` : THUMB_PLACEHOLDER_SVG}</div>
          <div><strong>${escapeHtml(batch.name)}</strong><small>${escapeHtml(batch.byName || batch.language || "Course")}</small></div>
        </div>`).join("");
    }
    results.innerHTML = html;
    $$(".search-history-chip").forEach((chip, index) => chip.addEventListener("click", () => {
      const input = $("#searchInput");
      if (input) { input.value = history[index]; renderSearchResults(history[index]); }
    }));
    $$(".search-result").forEach((result, index) => result.addEventListener("click", () => {
      openBatch(recent[index]);
      closeModal("searchModal");
    }));
    return;
  }
  const matches = deepSearch(allBatches, normalized).slice(0, 40);
  if (!matches.length) {
    results.innerHTML = '<div class="search-hint">No matches yet. Try a subject, exam or class.</div>';
    return;
  }
  results.innerHTML = `<div class="search-hint" style="text-align:left;margin-bottom:2px;">${matches.length} result${matches.length === 1 ? "" : "s"}</div>` + matches.map((batch) => `
    <div class="search-result" data-id="${escapeHtml(batch._id || batch.batch_id || "")}">
      <div class="search-result-thumb">${batch.previewImage ? `<img src="${escapeHtml(batch.previewImage)}" alt="" referrerpolicy="no-referrer" onerror="window.__thumbFallback(this)">` : THUMB_PLACEHOLDER_SVG}</div>
      <div><strong>${highlightMatch(batch.name || "Untitled course", normalized)}</strong><small>${escapeHtml(batch.byName || batch.language || "Course")}</small></div>
      ${isRecent(batch.startDate) ? '<span class="search-new-badge">new</span>' : ""}
    </div>`).join("");
  $$(".search-result").forEach((result, index) => result.addEventListener("click", () => {
    openBatch(matches[index]);
    closeModal("searchModal");
  }));
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  $$(".overlay.visible").forEach((other) => { if (other.id !== id) other.classList.remove("visible"); });
  modal.classList.add("visible");
  document.body.classList.add("modal-open");
  modal.querySelector("input")?.focus();
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove("visible");
  if (!$$(".overlay.visible").length) document.body.classList.remove("modal-open");
}

function showToast(message) {
  const oldToast = $(".toast");
  oldToast?.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2800);
}

const BATCH_CACHE_KEY = "cx-batches-cache-v1";

function readBatchCache() {
  try {
    const raw = sessionStorage.getItem(BATCH_CACHE_KEY);
    const list = raw ? JSON.parse(raw) : null;
    return Array.isArray(list) && list.length ? list : null;
  } catch (e) { return null; }
}

function restoreScroll() {
  try {
    const y = Number(sessionStorage.getItem("cx-scroll") || 0);
    sessionStorage.removeItem("cx-scroll");
    if (y > 0) window.requestAnimationFrame(() => window.scrollTo(0, y));
  } catch (e) {}
}

async function loadBatches() {
  const cached = readBatchCache();
  let usedCache = false;
  try {
    const grid = $("#batchGrid");
    if (cached) {
      // coming back from a batch: show the list instantly, refresh quietly in the background
      allBatches = cached;
      usedCache = true;
      updateStats();
      renderBatches();
      $("#globalPreloader").classList.add("hidden");
      restoreScroll();
    } else if (grid && !allBatches.length) {
      grid.innerHTML = Array.from({ length: 8 }, () => '<div class="skeleton-card"><div class="skeleton-thumb"></div><div class="skeleton-body"><div class="skeleton-line" style="width:88%"></div><div class="skeleton-line" style="width:60%"></div><div class="skeleton-line" style="width:40%"></div></div></div>').join("");
    }
    const fresh = await mjFetchBatches();
    const changed = JSON.stringify(fresh) !== JSON.stringify(allBatches);
    allBatches = fresh;
    try { sessionStorage.setItem(BATCH_CACHE_KEY, JSON.stringify(fresh)); sessionStorage.setItem("cx-loaded", "1"); } catch (e) {}
    if (changed || !usedCache) { updateStats(); renderBatches(); }
    const updatedNote = $("#dataUpdatedNote");
    if (updatedNote) updatedNote.textContent = `· library refreshed ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } catch (error) {
    console.error(error);
    if (!usedCache) {
      $("#resultsNote").textContent = "The course library could not be loaded.";
      $("#batchGrid").innerHTML = '<div class="empty">Please refresh to reconnect to the course library.</div>';
      showToast("Course library unavailable");
    }
  } finally {
    $("#globalPreloader").classList.add("hidden");
  }
}

function setupNavigation() {
  const menu = $("#navLinks");
  const menuButton = $("#menuBtn");
  menuButton.addEventListener("click", () => {
    const open = menu.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", String(open));
  });
  $$(".nav-link").forEach((link) => link.addEventListener("click", () => {
    menu.classList.remove("open");
    menuButton.setAttribute("aria-expanded", "false");
  }));
  const sections = $$("main section[id]");
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (entry.isIntersecting) {
      $$(".nav-link").forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${entry.target.id}`));
    }
  }), { rootMargin: "-35% 0px -55% 0px" });
  sections.forEach((section) => observer.observe(section));
}

function setupHeaderActions() {
  const refreshBtn = $("#refreshBtn");
  refreshBtn?.addEventListener("click", async () => {
    if (refreshBtn.classList.contains("spinning")) return;
    refreshBtn.classList.add("spinning");
    await loadBatches();
    showToast("Course library refreshed.");
    refreshBtn.classList.remove("spinning");
  });
  $("#favNavBtn")?.addEventListener("click", () => {
    activeFilter = "favorites";
    localStorage.setItem("codex-studys-last-filter", "favorites");
    visibleCount = PAGE_SIZE;
    $$(".filter-row .filter").forEach((item) => item.classList.toggle("active", item.dataset.filter === "favorites"));
    renderBatches();
    $("#courses")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function setupModals() {
  $("#searchBtn").addEventListener("click", () => {
    openModal("searchModal");
    renderSearchResults($("#searchInput").value);
  });
  let modalSearchDebounce;
  $("#searchInput").addEventListener("input", (event) => {
    const value = event.target.value;
    clearTimeout(modalSearchDebounce);
    modalSearchDebounce = setTimeout(() => renderSearchResults(value), 120);
  });
  $("#searchInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.value.trim()) addSearchHistory(event.target.value);
  });
  $$("[data-close]").forEach((button) => button.addEventListener("click", () => closeModal(button.dataset.close)));
  $$(".overlay").forEach((overlay) => overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeModal(overlay.id);
  }));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") $$(".overlay.visible").forEach((modal) => closeModal(modal.id));
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openModal("searchModal");
      renderSearchResults($("#searchInput").value);
    }
  });
}

function setupFilters() {
  updateFavoritesCount();
  const filterKey = "codex-studys-last-filter";
  const urlParams = new URLSearchParams(window.location.search);
  const urlFilter = urlParams.get("filter");
  const urlQuery = urlParams.get("q");
  const urlSort = urlParams.get("sort");
  const savedFilter = urlFilter || localStorage.getItem(filterKey);
  const savedButton = savedFilter && $(`.filter-row .filter[data-filter="${savedFilter}"]`);
  if (savedButton) {
    activeFilter = savedFilter;
    $$(".filter-row .filter").forEach((item) => item.classList.toggle("active", item === savedButton));
  }
  if (urlQuery) {
    searchQuery = urlQuery;
    const inlineSearchEl = $("#inlineSearchInput");
    if (inlineSearchEl) inlineSearchEl.value = urlQuery;
  }
  if (urlSort && ["relevance", "newest", "az", "za"].includes(urlSort)) {
    sortMode = urlSort;
    const sortSelectEl = $("#sortSelect");
    if (sortSelectEl) sortSelectEl.value = urlSort;
  }
  const urlLang = urlParams.get("lang");
  if (urlLang && ["hindi", "english", "hinglish"].includes(urlLang)) {
    langFilter = urlLang;
    const langSelectEl = $("#langSelect");
    if (langSelectEl) langSelectEl.value = urlLang;
  }
  $$(".filter-row .filter").forEach((button) => button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    localStorage.setItem(filterKey, activeFilter);
    visibleCount = PAGE_SIZE;
    $$(".filter-row .filter").forEach((item) => item.classList.toggle("active", item === button));
    renderBatches();
  }));
  const inlineSearch = $("#inlineSearchInput");
  let searchDebounce;
  inlineSearch?.addEventListener("input", (event) => {
    const value = event.target.value;
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      searchQuery = value;
      visibleCount = PAGE_SIZE;
      renderBatches();
    }, 150);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "/" || event.metaKey || event.ctrlKey) return;
    const active = document.activeElement;
    const typing = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
    if (typing) return;
    event.preventDefault();
    inlineSearch?.focus();
  });
  $("#sortSelect")?.addEventListener("change", (event) => {
    sortMode = event.target.value;
    visibleCount = PAGE_SIZE;
    renderBatches();
  });
  $("#langSelect")?.addEventListener("change", (event) => {
    langFilter = event.target.value;
    visibleCount = PAGE_SIZE;
    renderBatches();
  });
  $("#copyLinkBtn")?.addEventListener("click", () => {
    syncUrlParams();
    const url = window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => showToast("Link copied!")).catch(() => showToast("Could not copy link"));
    } else {
      showToast("Copy not supported on this browser");
    }
  });
  $("#clearFiltersBtn")?.addEventListener("click", () => {
    activeFilter = "all";
    searchQuery = "";
    sortMode = "relevance";
    langFilter = "all";
    const langSelectEl = $("#langSelect");
    if (langSelectEl) langSelectEl.value = "all";
    visibleCount = PAGE_SIZE;
    localStorage.setItem(filterKey, "all");
    if (inlineSearch) inlineSearch.value = "";
    const sortSelectEl = $("#sortSelect");
    if (sortSelectEl) sortSelectEl.value = "relevance";
    $$(".filter-row .filter").forEach((item) => item.classList.toggle("active", item.dataset.filter === "all"));
    renderBatches();
  });
}

function setupLoadMore() {
  const loadMoreBtn = $("#loadMoreBtn");
  if (!loadMoreBtn) return;
  const loadNext = () => {
    visibleCount += PAGE_SIZE;
    renderBatches();
  };
  loadMoreBtn.addEventListener("click", loadNext);
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting && loadMoreBtn.style.display !== "none") loadNext();
    });
  }, { rootMargin: "600px" });
  observer.observe(loadMoreBtn);
}

function setupAnnouncements() {
  const key = "codex-studys-announce-seen";
  const badge = document.querySelector("#announceBtn .icon-badge");
  if (localStorage.getItem(key) === "true") badge?.remove();
  $("#announceBtn")?.addEventListener("click", () => {
    openModal("announceModal");
    localStorage.setItem(key, "true");
    badge?.remove();
  });
  $("#announceCopyLink")?.addEventListener("click", () => {
    const url = window.location.origin + window.location.pathname;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => showToast("Link copied!")).catch(() => showToast("Could not copy link"));
    } else {
      showToast("Copy not supported on this browser");
    }
  });
}

const THEME_COLORS = {
  light: "#f4f5f9", dark: "#090b10", sandalwood: "#1c130c", "forest-emerald": "#06140f",
  "ocean-deep": "#050e17", "sakura-blossom": "#fff3f6", "dracula-midnight": "#14121f",
  "lavender-mist": "#f5f2fc", "cyberpunk-neon": "#05020a"
};

function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const current = document.documentElement.getAttribute("data-theme");
  meta.setAttribute("content", THEME_COLORS[current] || THEME_COLORS.dark);
}

function setupThemePicker() {
  syncThemeColor();
  const key = "codex-studys-theme";
  const markActive = () => {
    const current = localStorage.getItem(key) || "system";
    $$(".theme-option").forEach((option) => option.classList.toggle("active", option.dataset.theme === current));
  };
  $("#themeBtn")?.addEventListener("click", () => {
    markActive();
    openModal("themeModal");
  });
  $$(".theme-option").forEach((option) => option.addEventListener("click", () => {
    const theme = option.dataset.theme;
    localStorage.setItem(key, theme);
    if (theme === "system") {
      document.documentElement.removeAttribute("data-theme");
      const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
      if (prefersLight) document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }
    syncThemeColor();
    markActive();
  }));
}

/* ================= Animation Effects ================= */
function setupFxEngine() {
  const ENABLED_KEY = "codex-studys-fx-enabled";
  const EFFECT_KEY = "codex-studys-fx-effect";
  const INTENSITY_KEY = "codex-studys-fx-intensity";
  const SCALE = [0.55, 1, 1.85];

  const enableToggle = $("#fxEnableToggle");
  const grid = $("#effectsGrid");
  const intensityInput = $("#fxIntensity");
  const fxBtn = $("#fxBtn");
  if (!grid) return;

  let canvas = null, ctx = null, rafId = null, dpr = 1, running = false, last = 0;
  let particles = [], bolts = [], flash = 0, burstTimer = 0, boltTimer = 0;
  let effect = localStorage.getItem(EFFECT_KEY) || "rain";
  let intensity = Number(localStorage.getItem(INTENSITY_KEY));
  if (!Number.isInteger(intensity) || intensity < 0 || intensity > 2) intensity = 1;
  let enabled = localStorage.getItem(ENABLED_KEY) === "true";

  const reducedMotion = () =>
    document.documentElement.getAttribute("data-reduced-motion") === "true" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement("canvas");
    canvas.id = "fxCanvas";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
    ctx = canvas.getContext("2d");
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
  }

  function resizeCanvas() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function density(base) {
    const w = window.innerWidth;
    const dscale = w < 480 ? 0.5 : w < 900 ? 0.75 : 1;
    return Math.max(6, Math.round(base * dscale * SCALE[intensity]));
  }

  function seed() {
    const w = window.innerWidth, h = window.innerHeight;
    particles = []; bolts = []; flash = 0; burstTimer = 0; boltTimer = 0;
    if (effect === "rain" || effect === "storm") {
      const n = density(effect === "storm" ? 100 : 75);
      for (let i = 0; i < n; i++) particles.push({
        x: Math.random() * w, y: Math.random() * h - h,
        len: 14 + Math.random() * 16, speed: 7 + Math.random() * 7,
        drift: effect === "storm" ? 2.6 : 0.7
      });
    } else if (effect === "snow") {
      const n = density(70);
      for (let i = 0; i < n; i++) particles.push({
        x: Math.random() * w, y: Math.random() * h,
        r: 1.5 + Math.random() * 2.6, speed: 0.6 + Math.random() * 1.3,
        phase: Math.random() * Math.PI * 2, amp: 10 + Math.random() * 20
      });
    } else if (effect === "hail") {
      const n = density(55);
      for (let i = 0; i < n; i++) particles.push({
        x: Math.random() * w, y: Math.random() * h - h,
        r: 2 + Math.random() * 2, speed: 10 + Math.random() * 6, drift: 1.4
      });
    } else if (effect === "fireball") {
      const n = density(40);
      for (let i = 0; i < n; i++) particles.push({
        x: Math.random() * w, y: h + Math.random() * 100,
        r: 2 + Math.random() * 3.2, speed: 0.7 + Math.random() * 1.3,
        drift: Math.random() * 1.2 - 0.6, flick: Math.random() * Math.PI * 2
      });
    }
  }

  function spawnBurst(w, h) {
    const cx = 40 + Math.random() * (w - 80);
    const cy = 60 + Math.random() * (h * 0.45);
    const hue = Math.floor(Math.random() * 360);
    const count = density(26);
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const sp = 1.6 + Math.random() * 2.2;
      particles.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, hue });
    }
  }

  function spawnBolt(w, h) {
    const points = [];
    let x = 60 + Math.random() * Math.max(w - 120, 20), y = 0;
    points.push({ x, y });
    while (y < h * 0.7) {
      y += 18 + Math.random() * 22;
      x += (Math.random() - 0.5) * 40;
      points.push({ x, y });
    }
    bolts.push({ points, life: 1 });
    flash = 0.35;
  }

  function step(dt, w, h) {
    ctx.clearRect(0, 0, w, h);
    if (effect === "rain" || effect === "storm") {
      ctx.strokeStyle = "rgba(160,200,255,.55)";
      ctx.lineWidth = 1.3;
      particles.forEach((p) => {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.drift * 3, p.y + p.len);
        ctx.stroke();
        p.y += p.speed * dt * 60; p.x += p.drift * dt * 60;
        if (p.y > h) { p.y = -p.len; p.x = Math.random() * w; }
      });
      if (effect === "storm") {
        boltTimer -= dt;
        if (boltTimer <= 0) { spawnBolt(w, h); boltTimer = 2.5 + Math.random() * 4; }
      }
    } else if (effect === "snow") {
      ctx.fillStyle = "rgba(255,255,255,.85)";
      particles.forEach((p) => {
        p.phase += dt;
        const x = p.x + Math.sin(p.phase) * p.amp * 0.02;
        ctx.beginPath(); ctx.arc(x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        p.y += p.speed * dt * 60;
        if (p.y > h) { p.y = -4; p.x = Math.random() * w; }
      });
    } else if (effect === "hail") {
      ctx.fillStyle = "rgba(220,235,255,.9)";
      particles.forEach((p) => {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        p.y += p.speed * dt * 60; p.x += p.drift * dt * 60;
        if (p.y > h) { p.y = -6; p.x = Math.random() * w; }
      });
    } else if (effect === "fireball") {
      particles.forEach((p) => {
        p.flick += dt * 6;
        const alpha = 0.5 + Math.sin(p.flick) * 0.3;
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3);
        grad.addColorStop(0, `rgba(255,180,80,${alpha})`);
        grad.addColorStop(1, "rgba(255,80,20,0)");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2); ctx.fill();
        p.y -= p.speed * dt * 60; p.x += p.drift * dt * 30;
        if (p.y < -10) { p.y = h + Math.random() * 40; p.x = Math.random() * w; }
      });
    } else if (effect === "firecracker") {
      burstTimer -= dt;
      if (burstTimer <= 0) { spawnBurst(w, h); burstTimer = 1.1 + Math.random() * (2.6 - intensity * 0.7); }
      particles = particles.filter((p) => p.life > 0);
      particles.forEach((p) => {
        p.vy += dt * 1.6; p.x += p.vx * dt * 60; p.y += p.vy * dt * 60; p.life -= dt * 0.9;
        ctx.fillStyle = `hsla(${p.hue},95%,65%,${Math.max(p.life, 0)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); ctx.fill();
      });
    } else if (effect === "lightning") {
      boltTimer -= dt;
      if (boltTimer <= 0) { spawnBolt(w, h); boltTimer = 2.6 + Math.random() * (5 - intensity); }
    }

    if (effect === "storm" || effect === "lightning") {
      bolts = bolts.filter((b) => b.life > 0);
      bolts.forEach((b) => {
        ctx.strokeStyle = `rgba(220,235,255,${b.life})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        b.points.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
        ctx.stroke();
        b.life -= dt * 1.8;
      });
      if (flash > 0) {
        ctx.fillStyle = `rgba(210,225,255,${flash})`;
        ctx.fillRect(0, 0, w, h);
        flash -= dt * 0.9;
      }
    }
  }

  function loop(ts) {
    if (!running) return;
    const dt = Math.min((ts - last) / 1000 || 0, 0.05);
    last = ts;
    step(dt, window.innerWidth, window.innerHeight);
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    if (running) return;
    ensureCanvas();
    seed();
    running = true;
    last = 0;
    rafId = requestAnimationFrame(loop);
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  function apply() {
    if (enabled && !reducedMotion() && !document.hidden) start(); else stop();
  }

  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else apply(); });
  window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener?.("change", apply);
  window.__codexFxApply = apply;

  function markActive() {
    $$(".effect-option").forEach((btn) => btn.classList.toggle("active", btn.dataset.effect === effect));
  }
  enableToggle?.setAttribute("aria-checked", String(enabled));
  if (intensityInput) intensityInput.value = String(intensity);
  markActive();

  enableToggle?.addEventListener("click", () => {
    enabled = enableToggle.getAttribute("aria-checked") !== "true";
    enableToggle.setAttribute("aria-checked", String(enabled));
    localStorage.setItem(ENABLED_KEY, String(enabled));
    apply();
  });

  grid.addEventListener("click", (event) => {
    const btn = event.target.closest(".effect-option");
    if (!btn) return;
    effect = btn.dataset.effect;
    localStorage.setItem(EFFECT_KEY, effect);
    markActive();
    if (running) { stop(); apply(); }
  });

  intensityInput?.addEventListener("input", () => {
    intensity = Number(intensityInput.value);
    localStorage.setItem(INTENSITY_KEY, String(intensity));
    if (running) seed();
  });

  fxBtn?.addEventListener("click", () => openModal("effectsModal"));

  if (enabled) apply();
}

/* ================= Network Status ================= */
function setupNetworkStatus() {
  const netBtn = $("#netBtn");
  const typeEl = $("#netType");
  const pingEl = $("#netPing");
  const latencyEl = $("#netLatency");
  const bwEl = $("#netBandwidth");
  const statusEl = $("#netStatus");
  const refreshBtn = $("#netRefreshBtn");
  if (!netBtn || !typeEl) return;

  let pollTimer = null;
  const PING_ASSET = "assets/icon-192.png";

  function connInfo() {
    return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
  }
  function typeLabel() {
    const c = connInfo();
    if (c) {
      const t = c.type && c.type !== "unknown" ? c.type : c.effectiveType;
      if (t) return t === "wifi" ? "Wi-Fi" : t.toUpperCase();
    }
    return "Unknown";
  }
  function bandwidthLabel() {
    const c = connInfo();
    return c && typeof c.downlink === "number" ? `${c.downlink} Mbps` : "—";
  }
  function setStatus(online) {
    statusEl.innerHTML = `<span class="net-status-dot${online ? "" : " offline"}"></span>${online ? "Online" : "Offline"}`;
  }

  async function measure() {
    if (!navigator.onLine) {
      typeEl.textContent = "Offline"; pingEl.textContent = "—"; latencyEl.textContent = "—";
      bwEl.textContent = "—"; setStatus(false);
      return;
    }
    typeEl.textContent = typeLabel();
    bwEl.textContent = bandwidthLabel();
    setStatus(true);
    const samples = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      try {
        await fetch(`${PING_ASSET}?_=${Date.now()}_${i}`, { method: "HEAD", cache: "no-store" });
        samples.push(performance.now() - t0);
      } catch (error) { /* ignore a single dropped sample */ }
    }
    if (samples.length) {
      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      pingEl.textContent = `${Math.round(avg)} ms`;
      const entries = performance.getEntriesByType("resource").filter((r) => r.name.includes(PING_ASSET));
      const lastEntry = entries[entries.length - 1];
      const ttfb = lastEntry ? Math.max(0, lastEntry.responseStart - lastEntry.requestStart) : avg * 0.4;
      latencyEl.textContent = `${Math.round(ttfb || avg * 0.4)} ms`;
    } else {
      pingEl.textContent = "Timeout"; latencyEl.textContent = "—"; setStatus(false);
    }
  }

  function startPolling() {
    measure();
    if (pollTimer) window.clearInterval(pollTimer);
    pollTimer = window.setInterval(() => {
      const modal = document.getElementById("networkModal");
      if (!modal || !modal.classList.contains("visible")) {
        window.clearInterval(pollTimer); pollTimer = null; return;
      }
      measure();
    }, 8000);
  }

  netBtn.addEventListener("click", () => { openModal("networkModal"); startPolling(); });
  refreshBtn?.addEventListener("click", measure);
}

const POPUP_SNOOZE_KEY = "codex-studys-popups-snooze";
const POPUP_SNOOZE_MS = 24 * 60 * 60 * 1000;

function popupsSnoozed() {
  try {
    const until = Number(localStorage.getItem(POPUP_SNOOZE_KEY) || 0);
    return until > Date.now();
  } catch (e) { return false; }
}

function setupTelegramPopup() {
  document.querySelectorAll("[data-snooze-popups]").forEach((btn) => {
    btn.addEventListener("click", () => {
      try { localStorage.setItem(POPUP_SNOOZE_KEY, String(Date.now() + POPUP_SNOOZE_MS)); } catch (e) {}
      closeModal("telegramModal");
      closeModal("installModal");
      showToast("Popups 24 ghante ke liye band");
    });
  });
  if (popupsSnoozed()) return;
  let seen = false;
  try { seen = sessionStorage.getItem("cx-popups-shown") === "1"; } catch (e) {}
  if (seen) return; // already shown this session (e.g. coming back from a batch)
  window.setTimeout(() => {
    try { sessionStorage.setItem("cx-popups-shown", "1"); } catch (e) {}
    if (mjBusy()) return; // never pop over the batch view
    openModal("telegramModal");
    const modal = document.getElementById("telegramModal");
    if (!modal) return;
    const watcher = window.setInterval(() => {
      if (!modal.classList.contains("visible")) {
        window.clearInterval(watcher);
        window.setTimeout(() => { if (!isStandaloneApp() && !popupsSnoozed() && !mjBusy()) openModal("installModal"); }, 200);
      }
    }, 150);
  }, 700);
}

let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
});

function isStandaloneApp() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIOSDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function setupInstallPrompt() {
  if (isStandaloneApp()) return;
  const installBtn = $("#installActionBtn");
  const iosSteps = $("#iosInstallSteps");
  const body = $("#installBody");

  const showForIOS = () => {
    if (installBtn) installBtn.style.display = "none";
    if (iosSteps) iosSteps.style.display = "grid";
    if (body) body.textContent = "Add CODEX STUDYS to your home screen for a faster, app-like experience.";
  };

  installBtn?.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    closeModal("installModal");
    if (outcome === "accepted") showToast("Installing CODEX STUDYS…");
  });

  window.addEventListener("appinstalled", () => {
    closeModal("installModal");
    showToast("CODEX STUDYS installed!");
  });

  if (isIOSDevice()) showForIOS();
}

function setupOfflineBanner() {
  const banner = $("#offlineBanner");
  if (!banner) return;
  const update = () => banner.classList.toggle("visible", !navigator.onLine);
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

function setupViewToggle() {
  const key = "codex-studys-view";
  const grid = $("#batchGrid");
  const gridBtn = $("#gridViewBtn");
  const listBtn = $("#listViewBtn");
  if (!grid || !gridBtn || !listBtn) return;
  const apply = (mode) => {
    grid.classList.toggle("list-view", mode === "list");
    gridBtn.classList.toggle("active", mode !== "list");
    gridBtn.setAttribute("aria-pressed", String(mode !== "list"));
    listBtn.classList.toggle("active", mode === "list");
    listBtn.setAttribute("aria-pressed", String(mode === "list"));
  };
  apply(localStorage.getItem(key) || "grid");
  gridBtn.addEventListener("click", () => { localStorage.setItem(key, "grid"); apply("grid"); });
  listBtn.addEventListener("click", () => { localStorage.setItem(key, "list"); apply("list"); });
}

function setupPreferences() {
  const contrastToggle = $("#contrastToggle");
  const motionToggle = $("#motionToggle");

  const applyContrast = (on) => {
    document.documentElement.setAttribute("data-contrast", on ? "high" : "normal");
    contrastToggle?.setAttribute("aria-checked", String(on));
  };
  const applyMotion = (on) => {
    document.documentElement.setAttribute("data-reduced-motion", String(on));
    motionToggle?.setAttribute("aria-checked", String(on));
  };
  applyContrast(localStorage.getItem("codex-studys-contrast") === "true");
  applyMotion(localStorage.getItem("codex-studys-reduced-motion") === "true");

  contrastToggle?.addEventListener("click", () => {
    const on = contrastToggle.getAttribute("aria-checked") !== "true";
    localStorage.setItem("codex-studys-contrast", String(on));
    applyContrast(on);
  });
  motionToggle?.addEventListener("click", () => {
    const on = motionToggle.getAttribute("aria-checked") !== "true";
    localStorage.setItem("codex-studys-reduced-motion", String(on));
    applyMotion(on);
    window.__codexFxApply?.();
  });

  $("#exportFavBtn")?.addEventListener("click", () => {
    const favorites = getFavorites();
    if (!favorites.length) return showToast("No favorites to export yet.");
    const details = allBatches.filter((batch) => favorites.includes(batch._id || batch.batch_id || ""));
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), favorites: details }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "codex-studys-favorites.json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Favorites exported.");
  });

  const importInput = $("#importFavFile");
  $("#importFavBtn")?.addEventListener("click", () => importInput?.click());
  importInput?.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const ids = (data.favorites || []).map((batch) => batch._id || batch.batch_id).filter(Boolean);
        const current = getFavorites();
        const merged = [...new Set([...current, ...ids])];
        localStorage.setItem("codex-studys-favorites", JSON.stringify(merged));
        updateFavoritesCount();
        renderBatches();
        showToast(`Imported ${ids.length} favorite${ids.length === 1 ? "" : "s"}.`);
      } catch {
        showToast("That file could not be read.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  });

  $("#clearDataBtn")?.addEventListener("click", () => {
    if (!confirm("This clears favorites, theme, search history and all saved preferences on this device. Continue?")) return;
    Object.keys(localStorage).filter((key) => key.startsWith("codex-studys")).forEach((key) => localStorage.removeItem(key));
    showToast("App data cleared. Reloading…");
    setTimeout(() => window.location.reload(), 900);
  });
}

function animateCount(element, target) {
  if (!element) return;
  if (target <= 0) { element.textContent = "0"; return; }
  const duration = 700;
  const start = performance.now();
  const step = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = Math.round(target * eased).toLocaleString();
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function updateStats() {
  const strip = $("#statsStrip");
  if (!strip) return;
  strip.style.display = "grid";
  const freshCount = allBatches.filter((batch) => isRecent(batch.startDate)).length;
  animateCount($("#statTotal"), allBatches.length);
  animateCount($("#statNew"), freshCount);
  const statFav = $("#statFav");
  if (statFav) statFav.textContent = getFavorites().length.toLocaleString();
  const statRecent = $("#statRecent");
  if (statRecent) statRecent.textContent = String(getRecentlyViewed().length);
}

function setupBackToTop() {
  const button = $("#backToTopBtn");
  if (!button) return;
  const onScroll = () => button.classList.toggle("visible", window.scrollY > 480);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  button.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
}


/* ---------- Personal notes ---------- */
function getNotes() {
  try { return JSON.parse(localStorage.getItem("codex-studys-notes") || "{}"); }
  catch { return {}; }
}

function getNote(id) {
  return getNotes()[id] || "";
}

function setNote(id, text) {
  const notes = getNotes();
  if (text.trim()) notes[id] = text.trim(); else delete notes[id];
  localStorage.setItem("codex-studys-notes", JSON.stringify(notes));
}

/* ---------- Quick view ---------- */
let detailBatch = null;

function openDetail(batch) {
  detailBatch = batch;
  const id = batch._id || batch.batch_id || "";
  const hero = document.getElementById("detailHero");
  if (hero) {
    hero.src = batch.previewImage || FALLBACK_THUMB;
    hero.onerror = () => { hero.onerror = null; hero.src = FALLBACK_THUMB; };
  }
  const titleEl = document.getElementById("detailTitle");
  if (titleEl) titleEl.textContent = batch.name || "Untitled course";
  const subEl = document.getElementById("detailSub");
  if (subEl) subEl.textContent = batch.byName || "Structured learning for your next milestone";
  const facts = [
    ["Category", categoryFor(batch).toUpperCase()],
    ["Language", batch.language || "Self-paced"],
    ["Starts", formatDate(batch.startDate) || "Anytime"],
    ["Subjects", String((batch.subBatches || []).length || "—")]
  ];
  const factsEl = document.getElementById("detailFacts");
  if (factsEl) factsEl.innerHTML = facts.map(([k, v]) => `<div class="detail-fact"><span>${escapeHtml(k)}</span><span>${escapeHtml(String(v))}</span></div>`).join("");
  const noteEl = document.getElementById("detailNote");
  if (noteEl) noteEl.value = getNote(id);
  syncDetailFavButton(id);
  openModal("detailModal");
}

function syncDetailFavButton(id) {
  const favBtn = document.getElementById("detailFavBtn");
  if (favBtn) favBtn.textContent = isFavorite(id) ? "❤ Saved" : "❤ Save";
}

function setupDetailModal() {
  document.getElementById("detailFavBtn")?.addEventListener("click", () => {
    if (!detailBatch) return;
    const id = detailBatch._id || detailBatch.batch_id || "";
    const active = toggleFavorite(id);
    syncDetailFavButton(id);
    updateFavoritesCount();
    renderBatches();
    showToast(active ? "Added to favorites." : "Removed from favorites.");
  });
  document.getElementById("detailOpenBtn")?.addEventListener("click", () => {
    if (detailBatch) openBatch(detailBatch);
  });
  const noteEl = document.getElementById("detailNote");
  let noteTimer;
  noteEl?.addEventListener("input", () => {
    if (!detailBatch) return;
    const id = detailBatch._id || detailBatch.batch_id || "";
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      setNote(id, noteEl.value);
      renderBatches();
    }, 400);
  });
}

/* ---------- Reading progress ---------- */
function setupScrollProgress() {
  const bar = document.getElementById("scrollProgress");
  if (!bar) return;
  const update = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = `${max > 0 ? Math.min((window.scrollY / max) * 100, 100) : 0}%`;
  };
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
}

/* ---------- Shortcuts ---------- */
function setupShortcuts() {
  document.getElementById("shortcutsBtn")?.addEventListener("click", () => openModal("shortcutsModal"));
  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const active = document.activeElement;
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")) return;
    const key = event.key.toLowerCase();
    if (event.key === "?") { event.preventDefault(); openModal("shortcutsModal"); }
    else if (key === "f") { event.preventDefault(); document.getElementById("favNavBtn")?.click(); }
    else if (key === "t") { event.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupDetailModal();
  setupMissionJeet();
  setupScrollProgress();
  setupShortcuts();
  setupNavigation();
  setupModals();
  setupFilters();
  setupLoadMore();
  setupViewToggle();
  setupThemePicker();
  setupPreferences();
  setupFxEngine();
  setupNetworkStatus();
  setupAnnouncements();
  setupHeaderActions();
  setupTelegramPopup();
  setupInstallPrompt();
  setupQuickInstall();
  setupRecentlyWatched();
  setupBackToTop();
  setupOfflineBanner();
  registerServiceWorker();
  loadBatches();
});


/* Disable page zoom (pinch, double-tap, ctrl+wheel, ctrl +/-) */
(() => {
  ["gesturestart", "gesturechange", "gestureend"].forEach((t) =>
    document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
  document.addEventListener("touchmove", (e) => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
  let lastTouch = 0;
  document.addEventListener("touchend", (e) => {
    const now = Date.now();
    if (now - lastTouch < 300) e.preventDefault();
    lastTouch = now;
  }, { passive: false });
  document.addEventListener("wheel", (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && ["+", "=", "-", "_", "0"].includes(e.key)) e.preventDefault();
  });
})();


/* =====================================================================
   Mission Jeet integration
   - Direct course access
   - Folder / breadcrumb navigation
   - In-app HLS video player + notes/PDF opening
   ===================================================================== */
const MJ = {
  api: "https://apismaxx-mj.vercel.app",
  root: "0", // Mission Jeet uses folder id "0" for the top level
};

const mjState = {
  open: false, batch: null, courseId: "", stack: [], items: [], roots: [], info: {}, tab: "lectures",
  title: "", req: 0, view: null, playerItem: null, hls: null, hlsRetries: 0, streamUrl: ""
};

const mjEl = (id) => document.getElementById(id);
const mjBusy = () => mjState.open;

/* ---------- Live batch list (all-course API) ---------- */
async function mjFetchBatches() {
  const res = await fetch(`${MJ.api}/course/all-course?page=1`);
  const json = await res.json();
  if (!json.success || !Array.isArray(json.data)) throw new Error("Course library unavailable");
  const out = [];
  json.data.forEach((group) => (group.list || []).forEach((c) => out.push({
    _id: String(c.id), courseId: String(c.id), name: c.title || "Untitled course",
    byName: group.title || "Mission Jeet", language: c.language || "Hinglish",
    previewImage: c.thumbnail || "", category: "exam", type: "MJ_BATCH", source: "mission-jeet",
    slug: `mission-jeet-${c.id}`, subBatches: []
  })));
  return out;
}

/* ---------- Stream URL helpers (same logic as Mission Jeet) ---------- */
function mjParseDownloads(raw) {
  if (!raw) return [];
  try {
    const list = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(list)) return list.map((t) => ({ title: t.title || "Quality", url: t.url || "" })).filter((t) => t.url);
  } catch (e) {}
  return [];
}

function mjChannelHls(downloads) {
  try {
    if (!downloads.length) return null;
    const parts = new URL(downloads[0].url).pathname.split("/").filter(Boolean);
    const at = parts.indexOf("download");
    if (at === -1 || at + 1 >= parts.length) return null;
    const channel = parts[at + 1];
    const last = parts[parts.length - 1];
    let base = last;
    const us = last.lastIndexOf("_");
    if (us !== -1) base = last.substring(0, us);
    else {
      const t = downloads[0].title;
      if (t && base.endsWith(t)) base = base.substring(0, base.length - t.length);
    }
    const root = "https://d1ji5qpleqhfrc.cloudfront.net/file_library/videos/channel_vod_non_drm_hls";
    if (/^\d+$/.test(base)) return `${root}/${channel}/${base}/${base}_${base.slice(-7)}.m3u8`;
    const seg = base.replace(/_video_VOD.*$/, "").split("_");
    const suffix = (seg[seg.length - 1] || base).slice(-7);
    return `${root}/${channel}/${base}/${base}_${suffix}.m3u8`;
  } catch (e) { return null; }
}

const mjIsHls = (u) => /\.m3u8(\?|#|$)/i.test(u || "");

function mjStreamUrl(data) {
  const dl = mjParseDownloads(data.download_urls);
  const direct = [data.hls_url, data.file_url, ...dl.map((d) => d.url)].find(mjIsHls);
  return direct || mjChannelHls(dl) || data.file_url || (dl[0] && dl[0].url) || "";
}

/* ---------- Content classification ---------- */
function mjKind(item) {
  if (item.type === "folder") return "folder";
  const d = item.data || {};
  const video = d.file_type === 2 || (d.video_type !== undefined && d.video_type > 0) || Number(d.duration) > 0;
  return video ? "video" : "doc";
}

function mjDuration(seconds) {
  const n = Number(seconds);
  if (!n || n <= 0) return "Video";
  const s = Math.floor(n), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const pad = (v) => String(v).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`;
}

function mjDate(unix) {
  if (!unix) return "Recent";
  const d = new Date(Number(unix) * 1000);
  return isNaN(d) ? "Recent" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/* ---------- Batch detail: banner + Lectures / Notes / About ---------- */
const MJ_ICO = {
  v: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="m22 8-6 4 6 4z"/></svg>',
  d: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>'
};
const mjCnt = (f, k) => Number(f.content_counts && f.content_counts[k]) || 0;

function mjOpenCourse(batch) {
  Object.assign(mjState, {
    batch, courseId: String(batch._id || batch.courseId || batch.batch_id),
    stack: [{ id: MJ.root, title: "Subjects" }], items: [], roots: [], info: {}, tab: "lectures",
    title: batch.name || "Course", open: true
  });
  mjEl("mjView").classList.add("visible");
  mjEl("mjView").scrollTop = 0;
  history.pushState({ cxmj: 1, d: 1 }, "");
  mjLoadDetails();
  mjLoadContent();
}

function mjCloseView() {
  mjClosePlayerUi();
  mjClosePdfUi();
  mjState.open = false;
  mjState.items = [];
  mjEl("mjView")?.classList.remove("visible");
}

async function mjLoadDetails() {
  const courseId = mjState.courseId;
  try {
    const res = await fetch(`${MJ.api}/course/course-details/${encodeURIComponent(courseId)}`);
    const json = await res.json();
    if (!json.success || !Array.isArray(json.data) || courseId !== mjState.courseId) return;
    const overview = json.data.find((x) => x.type === "overview");
    const details = ((overview && overview.data) || []).find((x) => x.layout_type === "details");
    const info = (details && details.layout_data && details.layout_data[0]) || {};
    mjState.info = info;
    if (info.title) mjState.title = info.title;
    mjRender();
  } catch (error) { console.warn("Course details unavailable", error); }
}

async function mjLoadContent() {
  const req = ++mjState.req;
  const folder = mjState.stack[mjState.stack.length - 1];
  mjState.items = null;
  mjState.error = false;
  mjRender();
  try {
    const url = `${MJ.api}/course/all-content?course_id=${encodeURIComponent(mjState.courseId)}&folder_id=${encodeURIComponent(folder.id)}`;
    const json = await (await fetch(url)).json();
    if (req !== mjState.req) return;
    mjState.items = json.success && Array.isArray(json.data) ? json.data : [];
    if (mjState.stack.length === 1) mjState.roots = mjState.items;
  } catch (error) {
    if (req !== mjState.req) return;
    mjState.items = [];
    mjState.error = true;
  }
  mjRender();
}

function mjBanner() {
  const { batch, info } = mjState;
  const tags = ["Recorded", info.validity || info.validity_text || batch.validity, batch.language || "Hinglish"].filter(Boolean);
  const img = batch.previewImage || info.thumbnail || FALLBACK_THUMB;
  const desc = info.description || info.sub_title || batch.byName || "";
  const tab = (id, label) => `<button type="button" class="mj-tab${mjState.tab === id ? " active" : ""}" data-tab="${id}">${label}</button>`;
  return `<div class="mj-banner"><img src="${escapeHtml(img)}" alt="" referrerpolicy="no-referrer" onerror="this.src='${FALLBACK_THUMB}'">
    <div class="mj-banner-body"><h2>${escapeHtml(mjState.title)}</h2>${desc ? `<p>${escapeHtml(desc)}</p>` : ""}
    <div class="mj-tags">${tags.map((t, i) => `<span class="mj-tag${i ? "" : " main"}">${escapeHtml(t)}</span>`).join("")}</div></div></div>
    <div class="mj-tabs">${tab("lectures", "Lectures")}${tab("notes", "Notes")}${tab("about", "About")}</div>`;
}

function mjAbout() {
  const { info, batch, roots } = mjState;
  const subjects = (roots || []).filter((i) => mjKind(i) === "folder");
  return `<div class="mj-about"><h3>Description</h3><p>${escapeHtml(info.description || batch.byName || "No description available.")}</p>
    <h3>Syllabus</h3>${subjects.length ? `<ul>${subjects.map((s) => `<li><strong>${escapeHtml(s.title || "Subject")}</strong><small>${mjCnt(s, "video")} lectures · ${mjCnt(s, "pdf")} PDFs</small></li>`).join("")}</ul>` : "<p>Syllabus is loading or not available.</p>"}
    <h3>Validity</h3><p>${escapeHtml(String(info.validity || info.validity_text || batch.validity || "Not specified"))}</p></div>`;
}

function mjList() {
  const S = mjState, notes = S.tab === "notes", key = notes ? "pdf" : "video", root = S.stack.length === 1;
  const folders = S.items.filter((i) => mjKind(i) === "folder" && (i.content_counts ? mjCnt(i, key) > 0 : (!root || !notes)));
  const videos = notes ? [] : S.items.filter((i) => mjKind(i) === "video");
  const docs = notes ? S.items.filter((i) => mjKind(i) === "doc" && i.data && (i.data.file_url || mjParseDownloads(i.data.download_urls).length)) : [];
  S.view = { folders, videos, docs };
  if (!folders.length && !videos.length && !docs.length) return `<div class="mj-empty"><p>${notes ? "No notes or PDFs here yet." : "No lectures here yet."}</p></div>`;
  let html = "";
  if (folders.length) html += `<div class="mj-list">${folders.map((f, i) => {
    const n = mjCnt(f, key), sub = f.content_counts ? `${n} ${notes ? (n === 1 ? "PDF" : "PDFs") : (n === 1 ? "lecture" : "lectures")}` : "Open";
    return `<button type="button" class="mj-row${root ? " subj" : ""}" data-folder="${i}"><span class="mj-ico${notes ? " doc" : ""}">${notes ? MJ_ICO.d : MJ_ICO.v}</span><span class="mj-row-text"><strong>${escapeHtml(f.title || "Folder")}</strong><small>${sub}</small></span><span class="mj-chev">›</span></button>`;
  }).join("")}</div>`;
  if (videos.length) html += `<div class="mj-section">Lectures</div><div class="mj-grid">${videos.map((v, i) => {
    const d = v.data || {};
    return `<button type="button" class="mj-lecture" data-video="${i}"><span class="mj-thumb">${d.thumbnail ? `<img src="${escapeHtml(d.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}<span class="mj-play">▶</span><span class="mj-dur">${mjDuration(d.duration)}</span></span><span class="mj-lec-body"><strong>${escapeHtml(v.title || "Lecture")}</strong><small>${escapeHtml(mjDate(d.created_at))} · Lecture ${i + 1}</small></span></button>`;
  }).join("")}</div>`;
  if (docs.length) html += `<div class="mj-section">Documents</div><div class="mj-list">${docs.map((n, i) => `<button type="button" class="mj-row" data-doc="${i}"><span class="mj-ico doc">${MJ_ICO.d}</span><span class="mj-row-text"><strong>${escapeHtml(n.title || "Notes")}</strong><small>PDF · tap to view</small></span><span class="mj-chev">›</span></button>`).join("")}</div>`;
  return html;
}

function mjRender() {
  const S = mjState;
  if (!mjEl("mjView") || !S.open) return;
  const st = S.stack, root = st.length === 1;
  mjEl("mjTitle").textContent = root ? S.title : st[st.length - 1].title;
  mjEl("mjCrumbs").innerHTML = root ? "" : st.map((s, i) => `<button type="button" class="mj-crumb${i === st.length - 1 ? " current" : ""}" data-crumb="${i}">${escapeHtml(i === 0 ? S.title : s.title)}</button>`).join('<span class="mj-sep">›</span>');
  let main;
  if (root && S.tab === "about") main = mjAbout();
  else if (S.items === null) main = '<div class="mj-empty"><div class="mj-spinner"></div><p>Loading content…</p></div>';
  else if (S.error) main = '<div class="mj-empty"><p>Content could not be loaded.</p><button class="btn btn-primary" type="button" data-retry="1">Retry</button></div>';
  else main = mjList();
  mjEl("mjBody").innerHTML = (root ? mjBanner() : "") + main;
}

function mjEnterFolder(folder) {
  mjState.stack.push({ id: String(folder.entity_id ?? folder.id), title: folder.title || "Folder" });
  history.pushState({ cxmj: 1, d: mjState.stack.length }, "");
  mjEl("mjView").scrollTop = 0;
  mjLoadContent();
}

/* ---------- PDF viewer ---------- */
function mjOpenDoc(item) {
  const d = item.data || {};
  const url = d.file_url || (mjParseDownloads(d.download_urls)[0] || {}).url;
  if (!url) return showToast("This file is not available right now.");
  mjEl("mjPdfTitle").textContent = item.title || "Document";
  mjEl("mjPdfDownload").href = url;
  mjEl("mjPdfFrame").src = "https://docs.google.com/gview?embedded=1&url=" + encodeURIComponent(url);
  mjEl("mjPdf").classList.add("visible");
  history.pushState({ cxmj: 1, d: mjState.stack.length, f: 1 }, "");
}

function mjClosePdfUi() {
  const f = mjEl("mjPdfFrame");
  if (f) f.src = "about:blank";
  mjEl("mjPdf")?.classList.remove("visible");
}

/* ---------- Player (Hls.js with quality + speed) ---------- */
function mjPlay(item) {
  const data = item.data || {};
  const url = mjStreamUrl(data);
  if (!url) return showToast("This lecture's stream is not available right now.");
  mjState.playerItem = item;
  mjEl("mjPlayerTitle").textContent = item.title || "Lecture";
  mjEl("mjPlayer").classList.add("visible");
  history.pushState({ cxmj: 1, d: mjState.stack.length, p: 1 }, "");
  mjEl("mjVideo").poster = data.thumbnail || "";
  mjAttach(url);
}

function mjAttach(url) {
  const video = mjEl("mjVideo");
  mjDestroyHls();
  mjEl("mjPlayerError").classList.remove("show");
  mjEl("mjQuality").innerHTML = '<option value="-1">Auto</option>';
  mjEl("mjQualityWrap").hidden = true;
  mjState.streamUrl = url;
  if (mjIsHls(url) && window.Hls && Hls.isSupported()) {
    const hls = new Hls({ enableWorker: true, backBufferLength: 90, maxBufferLength: 30, fragLoadingTimeOut: 20000, manifestLoadingTimeOut: 20000 });
    mjState.hls = hls;
    mjState.hlsRetries = 0;
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, (e, m) => {
      const levels = (m.levels || []).map((l, i) => ({ i, h: l.height, b: l.bitrate })).sort((a, b) => (b.h || 0) - (a.h || 0));
      if (levels.length > 1) {
        mjEl("mjQuality").innerHTML = '<option value="-1">Auto</option>' + levels.map((l) => `<option value="${l.i}">${l.h ? l.h + "p" : Math.round(l.b / 1000) + " kbps"}</option>`).join("");
        mjEl("mjQualityWrap").hidden = false;
      }
      video.playbackRate = Number(mjEl("mjSpeed").value) || 1;
      video.play().catch(() => {});
    });
    hls.on(Hls.Events.ERROR, (e, err) => {
      if (!err.fatal) return;
      if (err.type === Hls.ErrorTypes.NETWORK_ERROR && mjState.hlsRetries < 3) { mjState.hlsRetries++; hls.startLoad(); }
      else if (err.type === Hls.ErrorTypes.MEDIA_ERROR && mjState.hlsRetries < 3) { mjState.hlsRetries++; hls.recoverMediaError(); }
      else { mjDestroyHls(); mjEl("mjPlayerError").classList.add("show"); }
    });
  } else {
    video.src = url;
    video.load();
    video.play().catch(() => {});
  }
}

function mjDestroyHls() {
  if (mjState.hls) { try { mjState.hls.destroy(); } catch (e) {} mjState.hls = null; }
}

function mjClosePlayerUi() {
  const video = mjEl("mjVideo");
  mjDestroyHls();
  if (video) { video.pause(); video.removeAttribute("src"); video.load(); }
  mjEl("mjPlayer")?.classList.remove("visible");
  mjState.playerItem = null;
}

/* ---------- Wiring ---------- */
function setupMissionJeet() {
  mjEl("mjBack")?.addEventListener("click", () => history.back());
  mjEl("mjPlayerClose")?.addEventListener("click", () => history.back());
  mjEl("mjPdfClose")?.addEventListener("click", () => history.back());

  mjEl("mjBody")?.addEventListener("click", (event) => {
    const t = event.target.closest("[data-tab],[data-folder],[data-video],[data-doc],[data-retry]");
    if (!t) return;
    const v = mjState.view || {};
    if (t.dataset.tab) { mjState.tab = t.dataset.tab; mjRender(); }
    else if (t.dataset.retry) mjLoadContent();
    else if (t.dataset.folder !== undefined) mjEnterFolder(v.folders[Number(t.dataset.folder)]);
    else if (t.dataset.video !== undefined) mjPlay(v.videos[Number(t.dataset.video)]);
    else if (t.dataset.doc !== undefined) mjOpenDoc(v.docs[Number(t.dataset.doc)]);
  });

  mjEl("mjCrumbs")?.addEventListener("click", (event) => {
    const b = event.target.closest("[data-crumb]");
    const steps = b ? mjState.stack.length - 1 - Number(b.dataset.crumb) : 0;
    if (steps > 0) history.go(-steps);
  });

  mjEl("mjQuality")?.addEventListener("change", (event) => { if (mjState.hls) mjState.hls.currentLevel = Number(event.target.value); });
  mjEl("mjSpeed")?.addEventListener("change", (event) => { mjEl("mjVideo").playbackRate = Number(event.target.value); });
  mjEl("mjRetryPlay")?.addEventListener("click", () => { if (mjState.streamUrl) mjAttach(mjState.streamUrl); });

  // Phone/browser back walks back: player / PDF -> folders -> batch page -> home
  window.addEventListener("popstate", (event) => {
    if (!mjState.open) return;
    const s = event.state;
    if (!s || !s.cxmj) { mjCloseView(); return; }
    if (!s.p && mjState.playerItem) mjClosePlayerUi();
    if (!s.f) mjClosePdfUi();
    if (s.d < mjState.stack.length) { mjState.stack = mjState.stack.slice(0, s.d); mjLoadContent(); }
  });

  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && mjState.open) history.back(); });
}
