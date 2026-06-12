(function () {
  const DATA_URL = "resources.json";
  const RESOURCE_FIELDS = [
    "id",
    "sourceCategory",
    "supportType",
    "organization",
    "cancerType",
    "availability",
    "title",
    "description",
    "url",
    "ctaLabel",
  ];

  const state = {
    data: null,
    categories: [],
    activeCategory: "",
    filters: {
      supportType: new Set(),
      cancerType: new Set(),
      availability: new Set(),
    },
    query: "",
    sort: "title",
    selectedKey: "",
    sha: "",
    dirty: false,
  };

  const page = document.querySelector("[data-page]")?.dataset.page;

  if (page === "public") {
    bootPublic();
  }

  if (page === "admin") {
    bootAdmin();
  }

  async function loadLocalData() {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Unable to load ${DATA_URL}`);
    }
    return response.json();
  }

  function setData(data) {
    state.data = data;
    state.categories = Object.keys(data).filter((key) => key !== "metadata" && Array.isArray(data[key]));
    state.activeCategory = state.activeCategory || state.categories[0] || "";
  }

  async function bootPublic() {
    try {
      setData(await loadLocalData());
      renderPublic();
      bindPublicEvents();
    } catch (error) {
      document.getElementById("resource-grid").innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
  }

  function bindPublicEvents() {
    document.getElementById("search").addEventListener("input", (event) => {
      state.query = event.target.value.trim().toLowerCase();
      renderPublicResults();
    });

    document.getElementById("sort-order").addEventListener("change", (event) => {
      state.sort = event.target.value;
      renderPublicResults();
    });

    document.getElementById("clear-filters").addEventListener("click", () => {
      Object.values(state.filters).forEach((filter) => filter.clear());
      state.query = "";
      document.getElementById("search").value = "";
      renderPublic();
    });
  }

  function renderPublic() {
    const total = state.categories.reduce((sum, category) => sum + state.data[category].length, 0);
    const generated = state.data.metadata?.generatedOn ? ` Updated ${state.data.metadata.generatedOn}.` : "";
    document.getElementById("resource-summary").textContent = `${total} resources across ${state.categories.length} support areas.${generated}`;

    renderCategoryTabs();
    renderFilters();
    renderPublicResults();
  }

  function renderCategoryTabs() {
    const tabs = document.getElementById("category-tabs");
    tabs.innerHTML = "";
    state.categories.forEach((category) => {
      const button = document.createElement("button");
      button.className = "category-tab";
      button.type = "button";
      button.textContent = category;
      button.setAttribute("aria-pressed", String(category === state.activeCategory));
      button.addEventListener("click", () => {
        state.activeCategory = category;
        Object.values(state.filters).forEach((filter) => filter.clear());
        renderPublic();
      });
      tabs.append(button);
    });
  }

  function renderFilters() {
    renderFilter("supportType", "support-type-filters");
    renderFilter("cancerType", "cancer-type-filters");
    renderFilter("availability", "availability-filters");
  }

  function renderFilter(field, targetId) {
    const target = document.getElementById(targetId);
    const values = uniqueValues(getActiveResources().map((item) => item[field]));
    target.innerHTML = "";
    values.forEach((value) => {
      const id = `${field}-${slug(value)}`;
      const label = document.createElement("label");
      label.className = "check-row";
      label.innerHTML = `<input id="${id}" type="checkbox" value="${escapeHtml(value)}" /> <span>${escapeHtml(value)}</span>`;
      const input = label.querySelector("input");
      input.checked = state.filters[field].has(value);
      input.addEventListener("change", () => {
        if (input.checked) {
          state.filters[field].add(value);
        } else {
          state.filters[field].delete(value);
        }
        renderPublicResults();
      });
      target.append(label);
    });
  }

  function renderPublicResults() {
    const grid = document.getElementById("resource-grid");
    const template = document.getElementById("resource-card-template");
    const resources = getFilteredResources();
    document.getElementById("result-count").textContent = `${resources.length} result${resources.length === 1 ? "" : "s"}`;
    grid.innerHTML = "";

    if (!resources.length) {
      grid.innerHTML = `<div class="empty-state">No resources match the current filters.</div>`;
      return;
    }

    resources.forEach((resource) => {
      const card = template.content.firstElementChild.cloneNode(true);
      card.querySelector(".resource-card__eyebrow").textContent = resource.supportType || resource.sourceCategory || "Resource";
      card.querySelector("h3").textContent = resource.title || "Untitled resource";
      card.querySelector(".resource-card__org").textContent = resource.organization || "";
      card.querySelector(".resource-card__description").textContent = resource.description || "";
      card.querySelector('[data-field="cancerType"]').textContent = resource.cancerType || "Not specified";
      card.querySelector('[data-field="availability"]').textContent = resource.availability || "Not specified";
      const link = card.querySelector(".resource-card__link");
      link.href = resource.url || "#";
      link.textContent = resource.ctaLabel || "View resource";
      grid.append(card);
    });
  }

  function getActiveResources() {
    return state.data?.[state.activeCategory] || [];
  }

  function getFilteredResources() {
    return getActiveResources()
      .filter((resource) => {
        const haystack = RESOURCE_FIELDS.map((field) => resource[field] || "").join(" ").toLowerCase();
        const matchesQuery = !state.query || haystack.includes(state.query);
        const matchesFilters = Object.entries(state.filters).every(([field, selected]) => {
          return !selected.size || selected.has(resource[field] || "");
        });
        return matchesQuery && matchesFilters;
      })
      .sort((a, b) => String(a[state.sort] || "").localeCompare(String(b[state.sort] || "")));
  }

  async function bootAdmin() {
    restoreSettings();
    bindAdminEvents();
    try {
      setData(await loadLocalData());
      renderAdmin();
      setStatus("Loaded local JSON", "saved");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  function bindAdminEvents() {
    document.getElementById("save-settings").addEventListener("click", saveSettings);
    document.getElementById("load-local").addEventListener("click", async () => {
      setData(await loadLocalData());
      state.sha = "";
      state.selectedKey = "";
      state.dirty = false;
      renderAdmin();
      setStatus("Loaded local JSON", "saved");
    });
    document.getElementById("load-github").addEventListener("click", loadFromGithub);
    document.getElementById("publish-github").addEventListener("click", publishToGithub);
    document.getElementById("download-json").addEventListener("click", downloadJson);
    document.getElementById("editor-search").addEventListener("input", renderEditorList);
    document.getElementById("editor-category").addEventListener("change", (event) => {
      state.activeCategory = event.target.value;
      state.selectedKey = "";
      renderAdmin();
    });
    document.getElementById("add-resource").addEventListener("click", addResource);
    document.getElementById("delete-resource").addEventListener("click", deleteResource);
    document.getElementById("duplicate-resource").addEventListener("click", duplicateResource);
    document.getElementById("resource-form").addEventListener("submit", applyFormChanges);
  }

  function renderAdmin() {
    if (!state.data) return;
    renderEditorCategorySelects();
    renderEditorList();
    renderSelectedResource();
  }

  function renderEditorCategorySelects() {
    ["editor-category", "field-category"].forEach((id) => {
      const select = document.getElementById(id);
      select.innerHTML = "";
      state.categories.forEach((category) => {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category;
        option.selected = category === state.activeCategory;
        select.append(option);
      });
    });
  }

  function renderEditorList() {
    const list = document.getElementById("editor-list");
    const query = document.getElementById("editor-search").value.trim().toLowerCase();
    const resources = getActiveResources().filter((resource) => {
      const haystack = `${resource.title || ""} ${resource.organization || ""} ${resource.id || ""}`.toLowerCase();
      return !query || haystack.includes(query);
    });
    list.innerHTML = "";

    if (!resources.length) {
      list.innerHTML = `<div class="empty-state">No resources found.</div>`;
      return;
    }

    resources.forEach((resource) => {
      const key = resourceKey(state.activeCategory, resource);
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-current", String(key === state.selectedKey));
      button.innerHTML = `<strong>${escapeHtml(resource.title || "Untitled resource")}</strong><span>${escapeHtml(resource.organization || resource.id || "")}</span>`;
      button.addEventListener("click", () => {
        state.selectedKey = key;
        renderAdmin();
      });
      list.append(button);
    });
  }

  function renderSelectedResource() {
    const selection = findSelectedResource();
    const form = document.getElementById("resource-form");
    const deleteButton = document.getElementById("delete-resource");
    const duplicateButton = document.getElementById("duplicate-resource");
    deleteButton.disabled = !selection;
    duplicateButton.disabled = !selection;
    form.querySelectorAll("input, select, textarea, button[type='submit']").forEach((field) => {
      field.disabled = !selection;
    });

    if (!selection) {
      document.getElementById("selected-resource-note").textContent = "Select a resource to edit.";
      form.reset();
      document.getElementById("field-category").disabled = true;
      return;
    }

    document.getElementById("selected-resource-note").textContent = `${selection.category} resource`;
    document.getElementById("field-category").value = selection.category;
    RESOURCE_FIELDS.forEach((field) => {
      document.getElementById(`field-${field}`).value = selection.resource[field] || "";
    });
  }

  function addResource() {
    const category = state.activeCategory || state.categories[0];
    const id = nextId(category);
    const resource = {
      id,
      sourceCategory: "",
      supportType: "",
      organization: "",
      cancerType: "",
      availability: "",
      title: "New resource",
      description: "",
      url: "https://",
      ctaLabel: "View resource",
    };
    state.data[category].unshift(resource);
    state.selectedKey = resourceKey(category, resource);
    markDirty("Added resource");
    renderAdmin();
  }

  function duplicateResource() {
    const selection = findSelectedResource();
    if (!selection) return;
    const copy = { ...selection.resource, id: nextId(selection.category), title: `${selection.resource.title || "Resource"} copy` };
    state.data[selection.category].splice(selection.index + 1, 0, copy);
    state.selectedKey = resourceKey(selection.category, copy);
    markDirty("Duplicated resource");
    renderAdmin();
  }

  function deleteResource() {
    const selection = findSelectedResource();
    if (!selection) return;
    const confirmed = window.confirm(`Delete "${selection.resource.title || selection.resource.id}"?`);
    if (!confirmed) return;
    state.data[selection.category].splice(selection.index, 1);
    state.selectedKey = "";
    markDirty("Deleted resource");
    renderAdmin();
  }

  function applyFormChanges(event) {
    event.preventDefault();
    const selection = findSelectedResource();
    if (!selection) return;

    const formData = new FormData(event.currentTarget);
    const nextCategory = formData.get("category");
    const updated = {};
    RESOURCE_FIELDS.forEach((field) => {
      updated[field] = String(formData.get(field) || "").trim();
    });

    if (nextCategory !== selection.category) {
      state.data[selection.category].splice(selection.index, 1);
      state.data[nextCategory].unshift(updated);
    } else {
      state.data[selection.category][selection.index] = updated;
    }

    state.selectedKey = resourceKey(nextCategory, updated);
    markDirty("Applied changes");
    renderAdmin();
  }

  async function loadFromGithub() {
    try {
      const config = getGithubConfig();
      const response = await githubRequest(config, "GET");
      const payload = await response.json();
      state.sha = payload.sha;
      setData(JSON.parse(decodeBase64(payload.content)));
      state.selectedKey = "";
      state.dirty = false;
      saveSettings();
      renderAdmin();
      setStatus("Loaded from GitHub", "saved");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  async function publishToGithub() {
    try {
      const config = getGithubConfig();
      if (!state.sha) {
        const response = await githubRequest(config, "GET");
        state.sha = (await response.json()).sha;
      }

      state.data.metadata = {
        ...(state.data.metadata || {}),
        generatedOn: new Date().toISOString().slice(0, 10),
        resourceCount: state.categories.reduce((sum, category) => sum + state.data[category].length, 0),
        editingNote: "Updated through the Patient Compass GitHub editor.",
      };

      const message = document.getElementById("commit-message").value.trim() || "Update Patient Compass resources";
      const response = await githubRequest(config, "PUT", {
        message,
        content: encodeBase64(JSON.stringify(state.data, null, 2) + "\n"),
        sha: state.sha,
        branch: config.branch,
      });
      const payload = await response.json();
      state.sha = payload.content?.sha || "";
      state.dirty = false;
      setStatus("Committed to GitHub", "saved");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  function getGithubConfig() {
    const config = {
      owner: valueOf("repo-owner"),
      repo: valueOf("repo-name"),
      branch: valueOf("repo-branch") || "main",
      path: valueOf("repo-path") || "resources.json",
      token: valueOf("repo-token"),
    };
    const missing = Object.entries(config)
      .filter(([, value]) => !value)
      .map(([key]) => key);
    if (missing.length) {
      throw new Error(`Missing GitHub setting: ${missing.join(", ")}`);
    }
    return config;
  }

  async function githubRequest(config, method, body) {
    const endpoint = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${config.path.replace(/^\/+/, "")}`;
    const url = method === "GET" ? `${endpoint}?ref=${encodeURIComponent(config.branch)}` : endpoint;
    const response = await fetch(url, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${config.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      throw new Error(details.message || `GitHub request failed with ${response.status}`);
    }
    return response;
  }

  function saveSettings() {
    const settings = {
      owner: valueOf("repo-owner"),
      repo: valueOf("repo-name"),
      branch: valueOf("repo-branch"),
      path: valueOf("repo-path"),
    };
    localStorage.setItem("patientCompassGithubSettings", JSON.stringify(settings));
    setStatus("Settings saved", state.dirty ? "dirty" : "saved");
  }

  function restoreSettings() {
    const saved = JSON.parse(localStorage.getItem("patientCompassGithubSettings") || "{}");
    document.getElementById("repo-owner").value = saved.owner || "";
    document.getElementById("repo-name").value = saved.repo || "";
    document.getElementById("repo-branch").value = saved.branch || "main";
    document.getElementById("repo-path").value = saved.path || "resources.json";
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify(state.data, null, 2) + "\n"], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "resources.json";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function findSelectedResource() {
    if (!state.selectedKey) return null;
    for (const category of state.categories) {
      const index = state.data[category].findIndex((resource) => resourceKey(category, resource) === state.selectedKey);
      if (index >= 0) {
        return { category, index, resource: state.data[category][index] };
      }
    }
    return null;
  }

  function nextId(category) {
    const prefix = category
      .split(/\s+/)
      .map((word) => word[0])
      .join("")
      .replace(/[^A-Z]/gi, "")
      .toUpperCase()
      .slice(0, 3) || "RES";
    const used = new Set(state.categories.flatMap((cat) => state.data[cat].map((item) => item.id)));
    let number = state.data[category].length + 1;
    let id = "";
    do {
      id = `${prefix}-${String(number).padStart(3, "0")}`;
      number += 1;
    } while (used.has(id));
    return id;
  }

  function markDirty(message) {
    state.dirty = true;
    setStatus(message, "dirty");
  }

  function setStatus(message, stateName) {
    const status = document.getElementById("save-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.state = stateName;
  }

  function valueOf(id) {
    return document.getElementById(id).value.trim();
  }

  function uniqueValues(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  function resourceKey(category, resource) {
    return `${category}::${resource.id || resource.title || Math.random()}`;
  }

  function slug(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
    });
  }

  function encodeBase64(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }

  function decodeBase64(value) {
    const binary = atob(String(value || "").replace(/\s/g, ""));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
})();
