const state = {
  mode: "login",
  token: localStorage.getItem("docflow_token"),
  email: localStorage.getItem("docflow_email"),
  file: null,
  documentId: localStorage.getItem("docflow_document_id"),
  pollTimer: null,
  sessionVersion: 0,
};

const $ = (id) => document.getElementById(id);
const authView = $("authView");
const appView = $("appView");

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 2800);
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const requestToken = state.token;
  if (requestToken) headers.set("Authorization", `Bearer ${requestToken}`);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(`/api${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401 && requestToken && state.token === requestToken) {
    signOut("Your session expired. Please log in again.");
    throw new Error("Your session expired.");
  }
  if (!response.ok) throw new Error(payload.error || "Something went wrong. Please try again.");
  return payload;
}

function setAuthMode(mode) {
  state.mode = mode;
  const isLogin = mode === "login";
  $("loginTab").classList.toggle("active", isLogin);
  $("registerTab").classList.toggle("active", !isLogin);
  $("loginTab").setAttribute("aria-selected", String(isLogin));
  $("registerTab").setAttribute("aria-selected", String(!isLogin));
  $("authKicker").textContent = isLogin ? "WELCOME BACK" : "START HERE";
  $("authTitle").textContent = isLogin ? "Continue your reading." : "Make room for clarity.";
  $("authSubtitle").textContent = isLogin ? "Sign in to upload a document or check its progress." : "Create an account, then upload your first PDF.";
  $("authSubmit").firstElementChild.textContent = isLogin ? "Log in" : "Create account";
  $("password").autocomplete = isLogin ? "current-password" : "new-password";
  $("authSwitch").innerHTML = isLogin
    ? 'New to Docflow? <button type="button">Create an account</button>'
    : 'Already have an account? <button type="button">Log in</button>';
  $("authSwitch").querySelector("button").addEventListener("click", () => setAuthMode(isLogin ? "register" : "login"));
  $("authError").textContent = "";
}

function showApp() {
  authView.classList.add("hidden");
  appView.classList.remove("hidden");
  $("logoutButton").classList.remove("hidden");
  $("userEmail").textContent = state.email || "";
  if (state.documentId) pollStatus(state.documentId, state.sessionVersion);
}

function resetWorkspace() {
  clearTimeout(state.pollTimer);
  state.sessionVersion += 1;
  state.pollTimer = null;
  state.file = null;
  state.documentId = null;

  $("fileInput").value = "";
  $("dropTitle").textContent = "Drop your PDF here";
  $("dropSubtitle").textContent = "or click to browse · PDF files only";
  $("uploadButton").disabled = true;
  $("uploadButton").firstElementChild.textContent = "Summarize document";
  $("uploadError").textContent = "";

  $("progressCard").classList.add("empty");
  $("progressPlaceholder").classList.remove("hidden");
  $("progressContent").classList.add("hidden");
  $("documentName").textContent = "Processing document";
  $("statusPill").textContent = "Pending";
  $("statusPill").className = "status-pill";
  $("stageList").replaceChildren();
  $("statusNote").textContent = "You can leave this page open—we’ll keep checking.";

  $("summaryContent").textContent = "";
  $("summaryCard").classList.add("hidden");
}

function signOut(message, reload = false) {
  resetWorkspace();
  state.token = null;
  state.email = null;
  localStorage.removeItem("docflow_token");
  localStorage.removeItem("docflow_email");
  localStorage.removeItem("docflow_document_id");
  appView.classList.add("hidden");
  authView.classList.remove("hidden");
  $("logoutButton").classList.add("hidden");
  $("userEmail").textContent = "";
  $("authForm").reset();
  setAuthMode("login");
  if (reload) {
    window.location.replace("/");
    return;
  }
  if (message) showToast(message);
}

async function handleAuth(event) {
  event.preventDefault();
  const email = $("email").value.trim();
  const password = $("password").value;
  const submit = $("authSubmit");
  $("authError").textContent = "";
  if (!event.currentTarget.reportValidity()) return;
  submit.disabled = true;
  submit.firstElementChild.textContent = state.mode === "login" ? "Logging in…" : "Creating account…";
  try {
    if (state.mode === "register") {
      await api("/register", { method: "POST", body: JSON.stringify({ email, password }) });
    }
    const { token } = await api("/login", { method: "POST", body: JSON.stringify({ email, password }) });
    resetWorkspace();
    state.token = token;
    state.email = email;
    localStorage.setItem("docflow_token", token);
    localStorage.setItem("docflow_email", email);
    showApp();
    showToast(state.mode === "register" ? "Account created. You’re ready to upload." : "Welcome back.");
  } catch (error) {
    $("authError").textContent = error.message;
  } finally {
    submit.disabled = false;
    submit.firstElementChild.textContent = state.mode === "login" ? "Log in" : "Create account";
  }
}

function selectFile(file) {
  $("uploadError").textContent = "";
  if (!file) return;
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    state.file = null;
    $("uploadError").textContent = "Please choose a PDF file.";
    $("uploadButton").disabled = true;
    return;
  }
  state.file = file;
  $("dropTitle").textContent = file.name;
  $("dropSubtitle").textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB · ready to upload`;
  $("uploadButton").disabled = false;
}

async function uploadFile() {
  if (!state.file) return;
  const sessionVersion = state.sessionVersion;
  const button = $("uploadButton");
  button.disabled = true;
  button.firstElementChild.textContent = "Uploading…";
  $("uploadError").textContent = "";
  try {
    const form = new FormData();
    form.append("file", state.file);
    const result = await api("/upload", { method: "POST", body: form });
    if (sessionVersion !== state.sessionVersion || !state.token) return;
    state.documentId = result.document.id;
    localStorage.setItem("docflow_document_id", state.documentId);
    showProgress(result.document.original_name || state.file.name);
    renderStages([]);
    pollStatus(state.documentId, sessionVersion);
  } catch (error) {
    if (sessionVersion === state.sessionVersion) $("uploadError").textContent = error.message;
  } finally {
    if (sessionVersion === state.sessionVersion) {
      button.disabled = false;
      button.firstElementChild.textContent = "Summarize document";
    }
  }
}

function showProgress(name) {
  $("progressCard").classList.remove("empty");
  $("progressPlaceholder").classList.add("hidden");
  $("progressContent").classList.remove("hidden");
  $("documentName").textContent = name || "Your document";
}

function renderStages(jobs) {
  const names = ["extract", "chunk", "summarize", "merge", "notify"];
  const labels = { extract: "Extract text", chunk: "Split into sections", summarize: "Summarize sections", merge: "Build final summary", notify: "Email delivery" };
  $("stageList").innerHTML = names.map((name) => {
    const matches = jobs.filter((job) => job.job_type === name);
    const failed = matches.some((job) => job.status === "failed");
    const complete = matches.length > 0 && matches.every((job) => job.status === "completed");
    const active = matches.some((job) => ["active", "processing"].includes(job.status));
    const waiting = !matches.length || matches.every((job) => ["pending", "waiting", "delayed"].includes(job.status));
    const css = failed ? "failed" : complete ? "complete" : active ? "active" : "";
    const icon = failed ? "!" : complete ? "✓" : "";
    const detail = name === "summarize" && matches.length > 1
      ? `${matches.filter((job) => job.status === "completed").length}/${matches.length} complete`
      : failed ? "failed" : complete ? "complete" : active ? "in progress" : waiting ? "waiting" : (matches[0]?.status || "waiting");
    return `<div class="stage ${css}"><span class="stage-dot">${icon}</span><span class="stage-name">${labels[name]}</span><span class="stage-state">${detail}</span></div>`;
  }).join("");
}

async function pollStatus(documentId, sessionVersion = state.sessionVersion) {
  clearTimeout(state.pollTimer);
  try {
    const result = await api(`/status/${encodeURIComponent(documentId)}`);
    if (sessionVersion !== state.sessionVersion || !state.token) return;
    showProgress(result.document.original_name || result.document.filename);
    renderStages(result.jobs || []);
    const status = String(result.document.status || "pending").toLowerCase();
    const pill = $("statusPill");
    pill.textContent = status === "done" ? "Complete" : status;
    pill.className = `status-pill ${status}`;
    if (result.summary) {
      $("summaryContent").textContent = result.summary;
      $("summaryCard").classList.remove("hidden");
    }
    const failed = status === "failed" || (result.jobs || []).some((job) => job.status === "failed");
    if (status === "done") {
      const notifyJob = (result.jobs || []).find((job) => job.job_type === "notify");
      const deliveryFinished = notifyJob && ["completed", "failed"].includes(notifyJob.status);
      $("statusNote").textContent = deliveryFinished
        ? "Finished. Your summary is ready below."
        : "Your summary is ready. Email delivery is finishing now.";
      if (deliveryFinished) localStorage.removeItem("docflow_document_id");
      else state.pollTimer = setTimeout(() => pollStatus(documentId, sessionVersion), 3000);
    } else if (failed) {
      $("statusNote").textContent = "Processing stopped. Please try uploading the document again.";
      pill.textContent = "Needs attention";
      pill.className = "status-pill failed";
    } else {
      $("statusNote").textContent = "You can leave this page open—we’ll keep checking.";
      state.pollTimer = setTimeout(() => pollStatus(documentId, sessionVersion), 3000);
    }
  } catch (error) {
    if (!state.token || sessionVersion !== state.sessionVersion) return;
    $("statusNote").textContent = `${error.message} Retrying shortly…`;
    state.pollTimer = setTimeout(() => pollStatus(documentId, sessionVersion), 5000);
  }
}

$("loginTab").addEventListener("click", () => setAuthMode("login"));
$("registerTab").addEventListener("click", () => setAuthMode("register"));
$("authForm").addEventListener("submit", handleAuth);
$("logoutButton").addEventListener("click", () => signOut(undefined, true));
$("fileInput").addEventListener("change", (event) => selectFile(event.target.files[0]));
$("uploadButton").addEventListener("click", uploadFile);
$("copyButton").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("summaryContent").textContent);
  showToast("Summary copied to your clipboard.");
});

const dropZone = $("dropZone");
for (const eventName of ["dragenter", "dragover"]) {
  dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.classList.add("dragging"); });
}
for (const eventName of ["dragleave", "drop"]) {
  dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.classList.remove("dragging"); });
}
dropZone.addEventListener("drop", (event) => selectFile(event.dataTransfer.files[0]));

setAuthMode("login");
if (state.token) showApp();
