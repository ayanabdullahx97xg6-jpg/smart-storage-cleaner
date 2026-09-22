"use strict";

/* =========================================================
   STORAGE CLEANER
   Browser-based private storage analysis
   ========================================================= */

const LARGE_DEFAULT = 500 * 1024 * 1024;
const OLD_DAYS = 180;

let rootHandle = null;

let allFiles = [];
let allFolders = [];

let largeFiles = [];
let oldFiles = [];
let duplicateGroups = [];
let typeStats = [];
let folderStats = [];

let currentLargeThreshold = LARGE_DEFAULT;


/* =========================================================
   DOM HELPERS
   ========================================================= */

const $ = (id) => document.getElementById(id);

const selectFolderBtn = $("selectFolderBtn");
const rescanBtn = $("rescanBtn");

const scanStatus = $("scanStatus");
const scanStatusTitle = $("scanStatusTitle");
const scanStatusText = $("scanStatusText");
const scanProgress = $("scanProgress");
const scanPercent = $("scanPercent");

const toast = $("toast");


/* =========================================================
   NAVIGATION
   ========================================================= */

document.querySelectorAll(".nav-item").forEach(button => {
  button.addEventListener("click", () => {
    showSection(button.dataset.section);
  });
});

document.querySelectorAll(".attention-row").forEach(button => {
  button.addEventListener("click", () => {
    showSection(button.dataset.section);
  });
});

function showSection(section) {

  document.querySelectorAll(".page-section").forEach(page => {
    page.classList.remove("active");
  });

  const target = document.getElementById(section);

  if (target) {
    target.classList.add("active");
  }

  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.section === section
    );
  });

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


/* =========================================================
   FOLDER SELECTION
   ========================================================= */

selectFolderBtn.addEventListener("click", selectFolder);

rescanBtn.addEventListener("click", async () => {

  if (!rootHandle) {
    await selectFolder();
    return;
  }

  try {

    const permission = await rootHandle.requestPermission({
      mode: "read"
    });

    if (permission !== "granted") {
      showToast("Folder permission was not granted.");
      return;
    }

    await startScan(rootHandle);

  } catch (error) {
    console.error(error);
    showToast("Could not rescan this folder.");
  }
});


async function selectFolder() {

  if (!("showDirectoryPicker" in window)) {

    showToast(
      "Your browser does not support folder scanning. Try Chrome or Edge."
    );

    return;
  }

  try {

    rootHandle = await window.showDirectoryPicker({
      mode: "read"
    });

    await startScan(rootHandle);

  } catch (error) {

    if (error.name === "AbortError") {
      return;
    }

    console.error(error);

    showToast(
      "Unable to access the selected folder."
    );
  }
}


/* =========================================================
   SCAN
   ========================================================= */

async function startScan(root) {

  allFiles = [];
  allFolders = [];

  largeFiles = [];
  oldFiles = [];
  duplicateGroups = [];
  typeStats = [];
  folderStats = [];

  scanStatus.classList.remove("hidden");
  rescanBtn.classList.add("hidden");

  setProgress(
    5,
    "Preparing scan...",
    "Reading folder structure..."
  );

  try {

    await scanDirectory(root, "");

    setProgress(
      65,
      "Analyzing files...",
      `${allFiles.length.toLocaleString()} files found`
    );

    calculateBasicStats();

    setProgress(
      72,
      "Finding duplicates...",
      "Comparing files with matching sizes..."
    );

    await findDuplicates();

    setProgress(
      92,
      "Finishing analysis...",
      "Preparing storage report..."
    );

    calculateAllAnalyses();

    renderEverything();

    setProgress(
      100,
      "Scan complete",
      `${allFiles.length.toLocaleString()} files analyzed`
    );

    $("readyCircle").textContent = "SCANNED";

    rescanBtn.classList.remove("hidden");

    showToast(
      `Scan complete — ${allFiles.length.toLocaleString()} files analyzed.`
    );

    setTimeout(() => {
      scanStatus.classList.add("hidden");
    }, 1200);

  } catch (error) {

    console.error(error);

    setProgress(
      0,
      "Scan stopped",
      "The folder could not be completely analyzed."
    );

    showToast(
      "Some files could not be accessed."
    );

    setTimeout(() => {
      scanStatus.classList.add("hidden");
    }, 1800);
  }
}


/* =========================================================
   DIRECTORY RECURSION
   ========================================================= */

async function scanDirectory(directoryHandle, parentPath) {

  const folderName = directoryHandle.name;

  const currentPath = parentPath
    ? `${parentPath}/${folderName}`
    : folderName;

  const folderRecord = {
    name: folderName,
    path: currentPath,
    files: 0,
    size: 0
  };

  allFolders.push(folderRecord);

  for await (const entry of directoryHandle.values()) {

    try {

      if (entry.kind === "file") {

        const file = await entry.getFile();

        const record = {
          file,
          name: file.name,
          path: `${currentPath}/${file.name}`,
          size: file.size,
          modified: file.lastModified,
          type: getFileCategory(file.name),
          extension: getExtension(file.name)
        };

        allFiles.push(record);

        folderRecord.files += 1;
        folderRecord.size += file.size;

      } else if (entry.kind === "directory") {

        await scanDirectory(entry, currentPath);

      }

    } catch (error) {

      console.warn(
        "Could not read:",
        entry.name,
        error
      );
    }

    if (allFiles.length % 100 === 0) {

      const estimatedProgress =
        Math.min(
          60,
          5 + Math.floor(allFiles.length / 100)
        );

      setProgress(
        estimatedProgress,
        "Scanning...",
        `${allFiles.length.toLocaleString()} files discovered`
      );

      await yieldToBrowser();
    }
  }
}


/* =========================================================
   BASIC STATS
   ========================================================= */

function calculateBasicStats() {

  const totalSize = allFiles.reduce(
    (sum, item) => sum + item.size,
    0
  );

  $("totalFiles").textContent =
    allFiles.length.toLocaleString();

  $("totalSize").textContent =
    formatBytes(totalSize);
}


/* =========================================================
   ANALYSIS
   ========================================================= */

function calculateAllAnalyses() {

  calculateLargeFiles();
  calculateOldFiles();
  calculateTypeStats();
  calculateFolderStats();
}


/* =========================================================
   LARGE FILES
   ========================================================= */

function calculateLargeFiles() {

  largeFiles = allFiles.filter(
    item => item.size >= currentLargeThreshold
  );

  sortLargeFiles();
}


/* =========================================================
   OLD FILES
   ========================================================= */

function calculateOldFiles() {

  const cutoff =
    Date.now() -
    OLD_DAYS * 24 * 60 * 60 * 1000;

  oldFiles = allFiles.filter(
    item => item.modified < cutoff
  );

  oldFiles.sort(
    (a, b) => a.modified - b.modified
  );
}


/* =========================================================
   FILE TYPES
   ========================================================= */

function calculateTypeStats() {

  const map = new Map();

  for (const item of allFiles) {

    const category = item.type;

    if (!map.has(category)) {

      map.set(category, {
        name: category,
        files: 0,
        size: 0
      });
    }

    const entry = map.get(category);

    entry.files += 1;
    entry.size += item.size;
  }

  typeStats = [...map.values()]
    .sort((a, b) => b.size - a.size);
}


/* =========================================================
   FOLDERS
   ========================================================= */

function calculateFolderStats() {

  folderStats = [...allFolders]
    .sort((a, b) => b.size - a.size);
}


/* =========================================================
   DUPLICATES
   ========================================================= */

async function findDuplicates() {

  duplicateGroups = [];

  const sizeMap = new Map();

  for (const item of allFiles) {

    if (!sizeMap.has(item.size)) {
      sizeMap.set(item.size, []);
    }

    sizeMap.get(item.size).push(item);
  }

  const candidates = [...sizeMap.values()]
    .filter(group => group.length > 1);

  let processed = 0;

  for (const group of candidates) {

    const hashMap = new Map();

    for (const item of group) {

      try {

        const buffer = await item.file.arrayBuffer();

        const hashBuffer =
          await crypto.subtle.digest(
            "SHA-256",
            buffer
          );

        const hash = bufferToHex(hashBuffer);

        if (!hashMap.has(hash)) {
          hashMap.set(hash, []);
        }

        hashMap.get(hash).push(item);

      } catch (error) {

        console.warn(
          "Could not hash:",
          item.path,
          error
        );
      }

      processed++;

      if (processed % 10 === 0) {

        setProgress(
          Math.min(
            90,
            72 + Math.floor(
              processed /
              Math.max(
                candidates.reduce(
                  (sum, g) => sum + g.length,
                  0
                ),
                1
              ) * 18
            )
          ),
          "Finding duplicates...",
          `${processed.toLocaleString()} candidate files checked`
        );

        await yieldToBrowser();
      }
    }

    for (const [hash, files] of hashMap.entries()) {

      if (files.length > 1) {

        duplicateGroups.push({
          hash,
          files,
          size: files[0].size
        });
      }
    }
  }

  duplicateGroups.sort(
    (a, b) => b.size - a.size
  );
}


/* =========================================================
   RENDER EVERYTHING
   ========================================================= */

function renderEverything() {

  renderDashboard();
  renderLargeFiles();
  renderDuplicates();
  renderOldFiles();
  renderTypes();
  renderFolders();
}


/* =========================================================
   DASHBOARD
   ========================================================= */

function renderDashboard() {

  const duplicateFileCount =
    duplicateGroups.reduce(
      (sum, group) => sum + group.files.length,
      0
    );

  $("largeCount").textContent =
    largeFiles.length.toLocaleString();

  $("duplicateCount").textContent =
    duplicateFileCount.toLocaleString();

  $("attentionLarge").textContent =
    `${largeFiles.length.toLocaleString()} ›`;

  $("attentionDuplicates").textContent =
    `${duplicateFileCount.toLocaleString()} ›`;

  $("attentionOld").textContent =
    `${oldFiles.length.toLocaleString()} ›`;

  $("attentionTypes").textContent =
    `${typeStats.length.toLocaleString()} ›`;

  $("attentionFolders").textContent =
    `${folderStats.length.toLocaleString()} ›`;

  renderStorageMix();
}


/* =========================================================
   STORAGE MIX
   ========================================================= */

function renderStorageMix() {

  const container = $("storageMix");

  if (!typeStats.length) {

    container.innerHTML = `
      <div class="empty-message">
        Scan a folder to see storage distribution.
      </div>
    `;

    return;
  }

  const totalSize = typeStats.reduce(
    (sum, item) => sum + item.size,
    0
  );

  const topTypes = typeStats.slice(0, 8);

  container.innerHTML = topTypes.map(item => {

    const percent =
      totalSize
        ? (item.size / totalSize) * 100
        : 0;

    return `
      <div>
        <div class="mix-bar">
          <div
            class="mix-fill"
            style="width:${Math.max(percent, 0.5)}%"
          ></div>
        </div>

        <div class="mix-row">
          <span>${escapeHTML(item.name)}</span>
          <span>
            ${formatBytes(item.size)}
            · ${percent.toFixed(1)}%
          </span>
        </div>
      </div>
    `;

  }).join("");
}


/* =========================================================
   LARGE FILE RENDER
   ========================================================= */

function renderLargeFiles() {

  const query =
    $("largeSearch").value
      .trim()
      .toLowerCase();

  let list = largeFiles.filter(item =>
    item.name.toLowerCase().includes(query) ||
    item.path.toLowerCase().includes(query)
  );

  sortList(list, $("largeSort").value);

  $("largeSummary").textContent =
    `${list.length.toLocaleString()} files`;

  $("largeSpace").textContent =
    formatBytes(
      list.reduce(
        (sum, item) => sum + item.size,
        0
      )
    );

  const container = $("largeList");

  if (!list.length) {

    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">◇</div>
        <strong>No large files found.</strong>
        <span>
          No individual file matches the current threshold.
        </span>
      </div>
    `;

    return;
  }

  container.innerHTML =
    list.map(fileRow).join("");
}


/* =========================================================
   OLD FILE RENDER
   ========================================================= */

function renderOldFiles() {

  const query =
    $("oldSearch").value
      .trim()
      .toLowerCase();

  let list = oldFiles.filter(item =>
    item.name.toLowerCase().includes(query) ||
    item.path.toLowerCase().includes(query)
  );

  const sort = $("oldSort").value;

  if (sort === "oldest") {
    list.sort((a, b) => a.modified - b.modified);
  }

  if (sort === "newest") {
    list.sort((a, b) => b.modified - a.modified);
  }

  if (sort === "largest") {
    list.sort((a, b) => b.size - a.size);
  }

  if (sort === "name") {
    list.sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }

  $("oldSummary").textContent =
    `${list.length.toLocaleString()} files`;

  $("oldSpace").textContent =
    formatBytes(
      list.reduce(
        (sum, item) => sum + item.size,
        0
      )
    );

  const container = $("oldList");

  if (!list.length) {

    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">◷</div>
        <strong>No old files found.</strong>
        <span>
          No files are older than ${OLD_DAYS} days.
        </span>
      </div>
    `;

    return;
  }

  container.innerHTML =
    list.map(fileRow).join("");
}


/* =========================================================
   DUPLICATE RENDER
   ========================================================= */

function renderDuplicates() {

  const groupCount =
    duplicateGroups.length;

  const potentialSpace =
    duplicateGroups.reduce(
      (sum, group) =>
        sum + group.size * (group.files.length - 1),
      0
    );

  $("duplicateGroups").textContent =
    groupCount.toLocaleString();

  $("duplicateSpace").textContent =
    formatBytes(potentialSpace);

  const container = $("duplicateList");

  if (!groupCount) {

    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">▣</div>
        <strong>No duplicate files found.</strong>
        <span>
          No identical file contents were detected.
        </span>
      </div>
    `;

    return;
  }

  container.innerHTML =
    duplicateGroups.map((group, index) => {

      const total =
        group.size * group.files.length;

      return `
        <div class="duplicate-group">

          <div class="duplicate-group-header">

            <strong>
              Duplicate Group ${index + 1}
              · ${group.files.length} identical files
            </strong>

            <span>
              ${formatBytes(total)}
            </span>

          </div>

          <div class="duplicate-files">

            ${group.files.map(item => `
              <div class="duplicate-file">

                <div class="file-icon">
                  ${getFileIcon(item.name)}
                </div>

                <div>
                  <div class="file-name">
                    ${escapeHTML(item.name)}
                  </div>

                  <div class="file-path">
                    ${escapeHTML(item.path)}
                  </div>
                </div>

                <div class="file-size">
                  ${formatBytes(item.size)}
                </div>

              </div>
            `).join("")}

          </div>

        </div>
      `;

    }).join("");
}


/* =========================================================
   TYPE RENDER
   ========================================================= */

function renderTypes() {

  const container = $("typeList");

  if (!typeStats.length) {

    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">◉</div>
        <strong>No file type data yet.</strong>
        <span>Scan a folder to analyze file types.</span>
      </div>
    `;

    return;
  }

  const totalSize =
    typeStats.reduce(
      (sum, item) => sum + item.size,
      0
    );

  container.innerHTML =
    typeStats.map(item => {

      const percent =
        totalSize
          ? (item.size / totalSize) * 100
          : 0;

      return `
        <div class="type-row">

          <div class="type-top">
            <strong>${escapeHTML(item.name)}</strong>

            <span>
              ${formatBytes(item.size)}
              · ${percent.toFixed(1)}%
            </span>
          </div>

          <div class="type-bar">
            <div
              class="type-fill"
              style="width:${Math.max(percent, 0.5)}%"
            ></div>
          </div>

          <div class="type-sub">
            ${item.files.toLocaleString()} files
          </div>

        </div>
      `;

    }).join("");
}


/* =========================================================
   FOLDER RENDER
   ========================================================= */

function renderFolders() {

  const query =
    $("folderSearch").value
      .trim()
      .toLowerCase();

  let list =
    folderStats.filter(item =>
      item.name.toLowerCase().includes(query) ||
      item.path.toLowerCase().includes(query)
    );

  const sort = $("folderSort").value;

  if (sort === "largest") {
    list.sort((a, b) => b.size - a.size);
  }

  if (sort === "smallest") {
    list.sort((a, b) => a.size - b.size);
  }

  if (sort === "files") {
    list.sort((a, b) => b.files - a.files);
  }

  if (sort === "name") {
    list.sort((a, b) =>
      a.path.localeCompare(b.path)
    );
  }

  const maxSize =
    list.length
      ? Math.max(...list.map(item => item.size))
      : 1;

  const container = $("folderList");

  if (!list.length) {

    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">▤</div>
        <strong>No folder data yet.</strong>
        <span>Scan a folder to analyze storage usage.</span>
      </div>
    `;

    return;
  }

  container.innerHTML =
    list.map(folder => {

      const percent =
        folder.size / maxSize * 100;

      return `
        <div class="folder-row">

          <div class="folder-top">

            <div class="folder-name">
              📁 ${escapeHTML(folder.path)}
            </div>

            <div class="folder-size">
              ${formatBytes(folder.size)}
            </div>

          </div>

          <div class="folder-meta">
            ${folder.files.toLocaleString()} files
          </div>

          <div class="folder-bar">
            <div
              class="folder-fill"
              style="width:${Math.max(percent, 1)}%"
            ></div>
          </div>

        </div>
      `;

    }).join("");
}


/* =========================================================
   FILE ROW
   ========================================================= */

function fileRow(item) {

  return `
    <div class="file-row">

      <div class="file-icon">
        ${getFileIcon(item.name)}
      </div>

      <div>

        <div class="file-name">
          ${escapeHTML(item.name)}
        </div>

        <div class="file-path">
          ${escapeHTML(item.path)}
        </div>

      </div>

      <div class="file-meta">

        <div class="file-size">
          ${formatBytes(item.size)}
        </div>

        <div class="file-date">
          ${formatDate(item.modified)}
        </div>

      </div>

    </div>
  `;
}


/* =========================================================
   LARGE SORT
   ========================================================= */

function sortLargeFiles() {

  const sort =
    $("largeSort")
      ? $("largeSort").value
      : "desc";

  sortList(largeFiles, sort);
}

function sortList(list, sort) {

  if (sort === "desc") {
    list.sort((a, b) => b.size - a.size);
  }

  if (sort === "asc") {
    list.sort((a, b) => a.size - b.size);
  }

  if (sort === "name") {
    list.sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }
}


/* =========================================================
   LARGE FILTER EVENTS
   ========================================================= */

$("largeThreshold").addEventListener(
  "change",
  () => {

    currentLargeThreshold =
      Number($("largeThreshold").value);

    calculateLargeFiles();
    renderLargeFiles();
    renderDashboard();
  }
);

$("largeSort").addEventListener(
  "change",
  () => renderLargeFiles()
);

$("largeSearch").addEventListener(
  "input",
  () => renderLargeFiles()
);


/* =========================================================
   OLD FILTER EVENTS
   ========================================================= */

$("oldSearch").addEventListener(
  "input",
  () => renderOldFiles()
);

$("oldSort").addEventListener(
  "change",
  () => renderOldFiles()
);


/* =========================================================
   FOLDER FILTER EVENTS
   ========================================================= */

$("folderSearch").addEventListener(
  "input",
  () => renderFolders()
);

$("folderSort").addEventListener(
  "change",
  () => renderFolders()
);


/* =========================================================
   FILE CATEGORY
   ========================================================= */

function getFileCategory(name) {

  const ext = getExtension(name);

  if (
    [
      "exe", "msi", "dll", "sys", "bat",
      "cmd", "com", "scr"
    ].includes(ext)
  ) {
    return "Executables";
  }

  if (
    [
      "zip", "rar", "7z", "tar", "gz",
      "bz2", "iso"
    ].includes(ext)
  ) {
    return "Archives";
  }

  if (
    [
      "jpg", "jpeg", "png", "gif", "webp",
      "bmp", "svg", "ico", "tiff"
    ].includes(ext)
  ) {
    return "Images";
  }

  if (
    [
      "mp4", "mkv", "avi", "mov", "wmv",
      "webm", "m4v"
    ].includes(ext)
  ) {
    return "Videos";
  }

  if (
    [
      "mp3", "wav", "flac", "aac",
      "ogg", "m4a"
    ].includes(ext)
  ) {
    return "Audio";
  }

  if (
    [
      "doc", "docx", "pdf", "txt", "rtf",
      "odt", "xls", "xlsx", "csv",
      "ppt", "pptx"
    ].includes(ext)
  ) {
    return "Documents";
  }

  if (
    [
      "js", "ts", "jsx", "tsx", "html",
      "css", "scss", "json", "xml",
      "py", "java", "cpp", "c",
      "cs", "php", "sql", "sh"
    ].includes(ext)
  ) {
    return "Code";
  }

  return "Other";
}


function getExtension(name) {

  const index =
    name.lastIndexOf(".");

  if (
    index <= 0 ||
    index === name.length - 1
  ) {
    return "";
  }

  return name
    .slice(index + 1)
    .toLowerCase();
}


/* =========================================================
   FILE ICON
   ========================================================= */

function getFileIcon(name) {

  const category =
    getFileCategory(name);

  const icons = {
    Images: "▧",
    Videos: "▶",
    Audio: "♫",
    Documents: "▤",
    Archives: "▦",
    Executables: "⚙",
    Code: "</>",
    Other: "•"
  };

  return icons[category] || "•";
}


/* =========================================================
   FORMATTERS
   ========================================================= */

function formatBytes(bytes) {

  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB",
    "TB"
  ];

  const index =
    Math.floor(
      Math.log(bytes) /
      Math.log(1024)
    );

  const safeIndex =
    Math.min(index, units.length - 1);

  const value =
    bytes /
    Math.pow(1024, safeIndex);

  const decimals =
    safeIndex === 0
      ? 0
      : value >= 100
        ? 0
        : value >= 10
          ? 1
          : 2;

  return `${value.toFixed(decimals)} ${units[safeIndex]}`;
}


function formatDate(timestamp) {

  if (!timestamp) {
    return "Unknown date";
  }

  return new Date(timestamp)
    .toLocaleDateString(
      undefined,
      {
        year: "numeric",
        month: "short",
        day: "numeric"
      }
    );
}


/* =========================================================
   HASH HELPER
   ========================================================= */

function bufferToHex(buffer) {

  const bytes =
    new Uint8Array(buffer);

  return [...bytes]
    .map(byte =>
      byte
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
}


/* =========================================================
   HTML SAFETY
   ========================================================= */

function escapeHTML(value) {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* =========================================================
   PROGRESS
   ========================================================= */

function setProgress(
  percent,
  title,
  message
) {

  const safePercent =
    Math.max(
      0,
      Math.min(100, percent)
    );

  scanProgress.style.width =
    `${safePercent}%`;

  scanPercent.textContent =
    `${Math.round(safePercent)}%`;

  scanStatusTitle.textContent =
    title;

  scanStatusText.textContent =
    message;
}


/* =========================================================
   BROWSER YIELD
   ========================================================= */

function yieldToBrowser() {

  return new Promise(resolve => {

    setTimeout(resolve, 0);

  });
}


/* =========================================================
   TOAST
   ========================================================= */

let toastTimer;

function showToast(message) {

  clearTimeout(toastTimer);

  toast.textContent = message;

  toast.classList.add("show");

  toastTimer =
    setTimeout(() => {

      toast.classList.remove("show");

    }, 3000);
}


/* =========================================================
   INITIAL STATE
   ========================================================= */

function initialize() {

  $("totalFiles").textContent = "0";
  $("totalSize").textContent = "0 B";

  $("largeCount").textContent = "0";
  $("duplicateCount").textContent = "0";

  $("attentionLarge").textContent = "0 ›";
  $("attentionDuplicates").textContent = "0 ›";
  $("attentionOld").textContent = "0 ›";
  $("attentionTypes").textContent = "0 ›";
  $("attentionFolders").textContent = "0 ›";
}

initialize();
