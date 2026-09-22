"use strict";

/* =========================================================
   STORAGE CLEANER
   Browser-only storage analysis
   ========================================================= */


/* -----------------------------
   CONFIGURATION
----------------------------- */

const LARGE_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const OLD_FILE_DAYS = 180;

const SUSPICIOUS_EXTENSIONS = new Set([
  "scr",
  "pif",
  "vbs",
  "vbe",
  "js",
  "jse",
  "wsf",
  "wsh",
  "hta",
  "cmd",
  "bat",
  "com",
  "msi",
  "reg",
  "lnk"
]);

const HIGH_RISK_EXTENSIONS = new Set([
  "scr",
  "pif",
  "vbe",
  "jse",
  "wsf",
  "wsh"
]);

const EXECUTABLE_EXTENSIONS = new Set([
  "exe",
  "msi",
  "com",
  "scr",
  "pif",
  "dll"
]);

const DOCUMENT_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "txt",
  "rtf",
  "xls",
  "xlsx",
  "ppt",
  "pptx"
]);

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "svg",
  "ico"
]);

const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "mkv",
  "avi",
  "mov",
  "wmv",
  "webm"
]);

const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "wav",
  "flac",
  "aac",
  "ogg",
  "m4a"
]);

const ARCHIVE_EXTENSIONS = new Set([
  "zip",
  "rar",
  "7z",
  "tar",
  "gz",
  "iso"
]);

const CODE_EXTENSIONS = new Set([
  "js",
  "ts",
  "jsx",
  "tsx",
  "html",
  "css",
  "json",
  "py",
  "java",
  "c",
  "cpp",
  "cs",
  "php",
  "go",
  "rs"
]);


/* -----------------------------
   STATE
----------------------------- */

let allFiles = [];
let currentFolderName = "";
let scanMode = "";

let duplicateGroups = [];
let securityResults = [];


/* -----------------------------
   ELEMENTS
----------------------------- */

const folderBtn = document.getElementById("folderBtn");
const fileBtn = document.getElementById("fileBtn");

const folderInput = document.getElementById("folderInput");
const fileInput = document.getElementById("fileInput");

const rescanBtn = document.getElementById("rescanBtn");

const scanOverlay = document.getElementById("scanOverlay");
const scanProgress = document.getElementById("scanProgress");
const progressBar = document.getElementById("progressBar");

const toast = document.getElementById("toast");


/* -----------------------------
   NAVIGATION
----------------------------- */

document.querySelectorAll(".nav-item").forEach(button => {

  button.addEventListener("click", () => {
    navigate(button.dataset.page);
  });

});


document.querySelectorAll("[data-page]").forEach(button => {

  if (!button.classList.contains("nav-item")) {

    button.addEventListener("click", () => {
      navigate(button.dataset.page);
    });

  }

});


function navigate(page) {

  document.querySelectorAll(".page").forEach(section => {
    section.classList.remove("active");
  });

  const target = document.getElementById(`page-${page}`);

  if (target) {
    target.classList.add("active");
  }

  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.page === page
    );
  });

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}


/* -----------------------------
   FILE PICKERS
----------------------------- */

folderBtn.addEventListener("click", () => {
  folderInput.value = "";
  folderInput.click();
});


fileBtn.addEventListener("click", () => {
  fileInput.value = "";
  fileInput.click();
});


folderInput.addEventListener("change", async event => {

  const files = Array.from(event.target.files || []);

  if (!files.length) {
    showToast("No folder selected.");
    return;
  }

  currentFolderName =
    files[0].webkitRelativePath
      ? files[0].webkitRelativePath.split("/")[0]
      : "Selected Folder";

  scanMode = "folder";

  await startScan(files);

});


fileInput.addEventListener("change", async event => {

  const files = Array.from(event.target.files || []);

  if (!files.length) {
    showToast("No files selected.");
    return;
  }

  currentFolderName = "Selected Files";
  scanMode = "files";

  await startScan(files);

});


rescanBtn.addEventListener("click", () => {

  if (allFiles.length) {
    startScan(
      allFiles.map(item => item.file)
    );
  }

});


/* -----------------------------
   SCANNING
----------------------------- */

async function startScan(files) {

  showOverlay();

  allFiles = [];

  duplicateGroups = [];
  securityResults = [];

  updateProgress(5, "Preparing files...");

  await wait(100);

  const total = files.length;

  for (let i = 0; i < total; i++) {

    const file = files[i];

    const relativePath =
      file.webkitRelativePath ||
      file.name;

    allFiles.push({
      file,
      name: file.name,
      path: relativePath,
      size: file.size,
      modified: file.lastModified,
      extension: getExtension(file.name)
    });

    if (i % 100 === 0 || i === total - 1) {

      const percent =
        5 + Math.round(((i + 1) / total) * 45);

      updateProgress(
        percent,
        `Reading files... ${i + 1.toLocaleString()} / ${total.toLocaleString()}`
      );

      await wait(0);
    }

  }


  updateProgress(55, "Finding large files...");
  await wait(50);

  const largeFiles =
    allFiles.filter(file =>
      file.size >= LARGE_FILE_SIZE
    );


  updateProgress(62, "Finding old files...");
  await wait(50);

  const oldFiles =
    getOldFiles();


  updateProgress(70, "Checking duplicates...");
  await wait(50);

  duplicateGroups =
    findDuplicatesBySize();


  updateProgress(82, "Running security checks...");
  await wait(50);

  securityResults =
    runSecurityAnalysis();


  updateProgress(91, "Building storage analysis...");
  await wait(50);

  renderEverything(
    largeFiles,
    oldFiles
  );


  updateProgress(100, "Scan complete.");

  await wait(300);

  hideOverlay();

  rescanBtn.classList.remove("hidden");

  document.getElementById("scanStatus").textContent =
    "SCANNED";

  document.getElementById("heroTitle").textContent =
    "Your storage has been analyzed.";

  document.getElementById("heroText").textContent =
    `${formatNumber(allFiles.length)} files analyzed. Review the findings below.`;

  updateSmartInsight();

  showToast(
    `Scan complete — ${formatNumber(allFiles.length)} files analyzed.`
  );

}


/* -----------------------------
   OLD FILES
----------------------------- */

function getOldFiles() {

  const cutoff =
    Date.now() -
    OLD_FILE_DAYS *
    24 *
    60 *
    60 *
    1000;

  return allFiles.filter(file =>
    file.modified < cutoff
  );

}


/* -----------------------------
   LARGE FILES
----------------------------- */

function getLargeFiles() {

  return allFiles.filter(file =>
    file.size >= LARGE_FILE_SIZE
  );

}


/* -----------------------------
   DUPLICATES
----------------------------- */

/*
   We first group files by size.

   This avoids hashing every file.
   Files with unique sizes cannot be identical.

   For safety/performance, this version does not
   upload anything and does not delete anything.
*/

function findDuplicatesBySize() {

  const groups = new Map();

  for (const item of allFiles) {

    const key = item.size;

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(item);

  }

  return Array.from(groups.values())
    .filter(group => group.length > 1)
    .map(group => ({
      size: group[0].size,
      files: group
    }));

}


/* -----------------------------
   SECURITY ANALYSIS
----------------------------- */

function runSecurityAnalysis() {

  const results = [];

  for (const item of allFiles) {

    const name = item.name.toLowerCase();
    const ext = item.extension;

    let level = "safe";
    let reasons = [];

    /* Dangerous/suspicious extension */

    if (HIGH_RISK_EXTENSIONS.has(ext)) {

      level = "high";

      reasons.push(
        `Executable/script-like extension .${ext}`
      );

    } else if (SUSPICIOUS_EXTENSIONS.has(ext)) {

      level = "review";

      reasons.push(
        `Script or executable-related extension .${ext}`
      );

    }


    /* Double extension */

    const parts =
      name.split(".").filter(Boolean);

    if (parts.length >= 3) {

      const secondLast =
        parts[parts.length - 2];

      const last =
        parts[parts.length - 1];

      const looksLikeDocument =
        DOCUMENT_EXTENSIONS.has(secondLast);

      const finalExecutable =
        EXECUTABLE_EXTENSIONS.has(last) ||
        SUSPICIOUS_EXTENSIONS.has(last);

      if (looksLikeDocument && finalExecutable) {

        level = "high";

        reasons.push(
          "Double-extension pattern deserves review"
        );

      }

    }


    /* Executable in a folder selected by user */

    if (
      EXECUTABLE_EXTENSIONS.has(ext) &&
      (
        name.includes("download") ||
        item.path.toLowerCase().includes("downloads")
      )
    ) {

      if (level === "safe") {
        level = "review";
      }

      reasons.push(
        "Executable located in a Downloads path"
      );

    }


    /* Suspicious filename patterns */

    const suspiciousWords = [
      "crack",
      "keygen",
      "patcher",
      "activator",
      "injector",
      "stealer",
      "payload"
    ];

    for (const word of suspiciousWords) {

      if (name.includes(word)) {

        if (level === "safe") {
          level = "review";
        }

        reasons.push(
          `Filename contains "${word}"`
        );

        break;
      }

    }


    results.push({
      ...item,
      level,
      reasons
    });

  }

  return results.filter(
    item => item.level !== "safe"
  );

}


/* -----------------------------
   RENDER EVERYTHING
----------------------------- */

function renderEverything(
  largeFiles,
  oldFiles
) {

  updateStats(
    largeFiles,
    oldFiles
  );

  renderLargeFiles(largeFiles);
  renderOldFiles(oldFiles);
  renderDuplicates();
  renderSecurity();
  renderTypes();
  renderFolders();

  renderStorageMix();

}


/* -----------------------------
   STATS
----------------------------- */

function updateStats(
  largeFiles,
  oldFiles
) {

  const totalSize =
    allFiles.reduce(
      (sum, item) =>
        sum + item.size,
      0
    );

  document.getElementById(
    "totalFiles"
  ).textContent =
    formatNumber(allFiles.length);

  document.getElementById(
    "totalSize"
  ).textContent =
    formatBytes(totalSize);

  document.getElementById(
    "largeCount"
  ).textContent =
    formatNumber(largeFiles.length);

  document.getElementById(
    "duplicateCount"
  ).textContent =
    formatNumber(
      duplicateGroups.length
    );

  document.getElementById(
    "attentionLarge"
  ).textContent =
    `${formatNumber(largeFiles.length)} ›`;

  document.getElementById(
    "attentionDuplicates"
  ).textContent =
    `${formatNumber(duplicateGroups.length)} ›`;

  document.getElementById(
    "attentionOld"
  ).textContent =
    `${formatNumber(oldFiles.length)} ›`;

  document.getElementById(
    "attentionSecurity"
  ).textContent =
    `${formatNumber(securityResults.length)} ›`;

}


/* -----------------------------
   LARGE FILES RENDER
----------------------------- */

function renderLargeFiles(
  files = getLargeFiles()
) {

  const container =
    document.getElementById("largeList");

  const search =
    document.getElementById("largeSearch")
      .value
      .toLowerCase();

  const sort =
    document.getElementById("largeSort")
      .value;

  let filtered =
    files.filter(item =>
      item.name.toLowerCase()
        .includes(search) ||
      item.path.toLowerCase()
        .includes(search)
    );

  if (sort === "size-desc") {
    filtered.sort((a, b) =>
      b.size - a.size
    );
  }

  if (sort === "size-asc") {
    filtered.sort((a, b) =>
      a.size - b.size
    );
  }

  if (sort === "name") {
    filtered.sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }

  if (!filtered.length) {

    container.innerHTML = `
      <div class="empty-state">
        No large files found.
        <br>
        Files larger than 100 MB will appear here.
      </div>
    `;

    return;
  }

  container.innerHTML =
    filtered
      .map(fileRow)
      .join("");

}


/* -----------------------------
   OLD FILES
----------------------------- */

function renderOldFiles(
  files = getOldFiles()
) {

  const container =
    document.getElementById("oldList");

  const search =
    document.getElementById("oldSearch")
      .value
      .toLowerCase();

  const sort =
    document.getElementById("oldSort")
      .value;

  let filtered =
    files.filter(item =>
      item.name.toLowerCase()
        .includes(search) ||
      item.path.toLowerCase()
        .includes(search)
    );

  if (sort === "oldest") {

    filtered.sort(
      (a, b) =>
        a.modified - b.modified
    );

  }

  if (sort === "newest") {

    filtered.sort(
      (a, b) =>
        b.modified - a.modified
    );

  }

  if (sort === "size") {

    filtered.sort(
      (a, b) =>
        b.size - a.size
    );

  }

  if (!filtered.length) {

    container.innerHTML = `
      <div class="empty-state">
        No old files found.
      </div>
    `;

    return;
  }

  container.innerHTML =
    filtered
      .map(fileRow)
      .join("");

}


/* -----------------------------
   FILE ROW
----------------------------- */

function fileRow(item) {

  return `
    <div class="file-row">

      <div class="file-icon">
        ${getFileIcon(item.extension)}
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


/* -----------------------------
   DUPLICATES RENDER
----------------------------- */

function renderDuplicates() {

  const container =
    document.getElementById(
      "duplicateList"
    );

  document.getElementById(
    "duplicateGroups"
  ).textContent =
    formatNumber(
      duplicateGroups.length
    );


  let extraSpace = 0;

  duplicateGroups.forEach(group => {

    extraSpace +=
      group.size *
      (group.files.length - 1);

  });


  document.getElementById(
    "duplicateSpace"
  ).textContent =
    formatBytes(extraSpace);


  if (!duplicateGroups.length) {

    container.innerHTML = `
      <div class="empty-state">
        No duplicate groups found.
      </div>
    `;

    return;
  }


  container.innerHTML =
    duplicateGroups
      .slice(0, 300)
      .map((group, index) => {

        return `
          <div class="duplicate-group">

            <div class="duplicate-header">

              <strong>
                Duplicate Group ${index + 1}
              </strong>

              <span>
                ${group.files.length} identical-size files ·
                ${formatBytes(group.size)}
              </span>

            </div>

            <div class="duplicate-files">

              ${group.files
                .map(file => `
                  <div class="duplicate-file">

                    <div>
                      <strong>
                        ${escapeHTML(file.name)}
                      </strong>

                      <small>
                        ${escapeHTML(file.path)}
                      </small>
                    </div>

                    <span>
                      ${formatBytes(file.size)}
                    </span>

                  </div>
                `)
                .join("")}

            </div>

          </div>
        `;

      })
      .join("");

}


/* -----------------------------
   SECURITY RENDER
----------------------------- */

function renderSecurity() {

  const container =
    document.getElementById(
      "securityList"
    );

  document.getElementById(
    "securityChecked"
  ).textContent =
    formatNumber(allFiles.length);


  const warnings =
    securityResults.filter(
      item =>
        item.level === "review"
    ).length;


  const high =
    securityResults.filter(
      item =>
        item.level === "high"
    ).length;


  document.getElementById(
    "securityWarnings"
  ).textContent =
    formatNumber(warnings);


  document.getElementById(
    "securityHigh"
  ).textContent =
    formatNumber(high);


  if (!securityResults.length) {

    container.innerHTML = `
      <div class="empty-state">

        <div>

          <strong style="color:#35d39a;">
            ✓ No obvious security red flags found
          </strong>

          <br><br>

          Your selected files did not match
          the suspicious patterns checked by this tool.

          <br><br>

          <small>
            This does not guarantee that a file is malware-free.
            Use Windows Security or another trusted antivirus
            for a full malware scan.
          </small>

        </div>

      </div>
    `;

    return;
  }


  container.innerHTML =
    securityResults
      .sort((a, b) => {

        const weight = {
          high: 3,
          review: 2,
          safe: 1
        };

        return weight[b.level] -
               weight[a.level];

      })
      .map(item => {

        const isHigh =
          item.level === "high";

        return `
          <div class="
            security-result
            ${isHigh ? "high" : "warning"}
          ">

            <div class="file-icon">
              🛡
            </div>

            <div>

              <strong>
                ${escapeHTML(item.name)}
              </strong>

              <div class="file-path">
                ${escapeHTML(item.path)}
              </div>

              <div
                class="file-path"
                style="margin-top:7px;color:#d0ccda;"
              >
                ${escapeHTML(
                  item.reasons.join(" · ")
                )}
              </div>

            </div>

            <span class="
              security-badge
              ${isHigh
                ? "badge-high"
                : "badge-review"}
            ">
              ${isHigh
                ? "HIGH REVIEW"
                : "REVIEW"}
            </span>

          </div>
        `;

      })
      .join("");

}


/* -----------------------------
   FILE TYPES
----------------------------- */

function renderTypes() {

  const container =
    document.getElementById(
      "typesList"
    );

  if (!allFiles.length) {

    container.innerHTML = `
      <div class="empty-state">
        Scan files to see file types.
      </div>
    `;

    return;
  }


  const map = new Map();


  for (const file of allFiles) {

    const category =
      getCategory(file.extension);

    if (!map.has(category)) {

      map.set(category, {
        size: 0,
        count: 0
      });

    }

    map.get(category).size += file.size;
    map.get(category).count++;

  }


  const total =
    allFiles.reduce(
      (sum, file) =>
        sum + file.size,
      0
    );


  const rows =
    Array.from(map.entries())
      .sort(
        (a, b) =>
          b[1].size -
          a[1].size
      );


  container.innerHTML =
    rows
      .map(([name, data]) => {

        const percent =
          total > 0
            ? (data.size / total) * 100
            : 0;

        return `
          <div class="type-card">

            <div class="type-head">

              <strong>
                ${escapeHTML(name)}
              </strong>

              <span>
                ${formatBytes(data.size)}
                · ${formatNumber(data.count)} files
              </span>

            </div>

            <div class="type-progress">

              <div
                style="width:${Math.max(
                  percent,
                  1
                )}%"
              ></div>

            </div>

          </div>
        `;

      })
      .join("");

}


/* -----------------------------
   FOLDERS
----------------------------- */

function renderFolders() {

  const container =
    document.getElementById(
      "foldersList"
    );

  if (!allFiles.length) {

    container.innerHTML = `
      <div class="empty-state">
        Scan a folder to analyze storage by folder.
      </div>
    `;

    return;
  }


  const folders = new Map();


  for (const item of allFiles) {

    const parts =
      item.path.split("/");

    let current = "";

    for (
      let i = 0;
      i < parts.length - 1;
      i++
    ) {

      current =
        current
          ? `${current}/${parts[i]}`
          : parts[i];

      if (!folders.has(current)) {

        folders.set(current, {
          size: 0,
          files: 0
        });

      }

      folders.get(current).size +=
        item.size;

      folders.get(current).files++;

    }

  }


  const rows =
    Array.from(folders.entries())
      .sort(
        (a, b) =>
          b[1].size -
          a[1].size
      )
      .slice(0, 100);


  const maxSize =
    rows.length
      ? rows[0][1].size
      : 1;


  container.innerHTML =
    rows
      .map(([folder, data]) => {

        const percent =
          (data.size / maxSize) * 100;

        return `
          <div class="folder-card">

            <div class="folder-top">

              <div class="folder-name">
                📁 ${escapeHTML(folder)}
              </div>

              <div class="folder-size">
                ${formatBytes(data.size)}
              </div>

            </div>

            <div class="folder-count">
              ${formatNumber(data.files)} files
            </div>

            <div class="folder-track">

              <div
                class="folder-bar"
                style="width:${Math.max(
                  percent,
                  1
                )}%"
              ></div>

            </div>

          </div>
        `;

      })
      .join("");

}


/* -----------------------------
   STORAGE MIX
----------------------------- */

function renderStorageMix() {

  const container =
    document.getElementById(
      "storageMix"
    );

  if (!allFiles.length) {

    container.innerHTML = `
      <div class="empty-small">
        Scan files to see storage distribution.
      </div>
    `;

    return;
  }


  const map = new Map();


  for (const item of allFiles) {

    const category =
      getCategory(item.extension);

    map.set(
      category,
      (map.get(category) || 0) +
      item.size
    );

  }


  const total =
    allFiles.reduce(
      (sum, item) =>
        sum + item.size,
      0
    );


  const rows =
    Array.from(map.entries())
      .sort(
        (a, b) =>
          b[1] - a[1]
      )
      .slice(0, 7);


  container.innerHTML =
    rows
      .map(([name, size]) => {

        const percent =
          total
            ? (size / total) * 100
            : 0;

        return `
          <div class="mix-row">

            <div class="mix-head">

              <span>
                ${escapeHTML(name)}
              </span>

              <span>
                ${formatBytes(size)}
                · ${percent.toFixed(1)}%
              </span>

            </div>

            <div class="mix-track">

              <div
                class="mix-bar"
                style="width:${Math.max(
                  percent,
                  1
                )}%"
              ></div>

            </div>

          </div>
        `;

      })
      .join("");

}


/* -----------------------------
   SMART INSIGHT
----------------------------- */

function updateSmartInsight() {

  if (!allFiles.length) {
    return;
  }


  const total =
    allFiles.reduce(
      (sum, item) =>
        sum + item.size,
      0
    );


  const large =
    getLargeFiles();


  const old =
    getOldFiles();


  if (large.length) {

    const largeSpace =
      large.reduce(
        (sum, item) =>
          sum + item.size,
        0
      );

    document.getElementById(
      "smartTitle"
    ).textContent =
      `${large.length} large files deserve a look.`;

    document.getElementById(
      "smartText"
    ).textContent =
      `Together they use ${formatBytes(
        largeSpace
      )}. Review these before considering cleanup.`;

    return;
  }


  if (securityResults.length) {

    document.getElementById(
      "smartTitle"
    ).textContent =
      `${securityResults.length} files need a security review.`;

    document.getElementById(
      "smartText"
    ).textContent =
      "Storage Cleaner found file patterns that deserve a closer look. This is a signal, not an antivirus verdict.";

    return;
  }


  if (old.length) {

    document.getElementById(
      "smartTitle"
    ).textContent =
      `${old.length} files have been untouched for 180+ days.`;

    document.getElementById(
      "smartText"
    ).textContent =
      "These files may be worth reviewing if you no longer need them.";

    return;
  }


  document.getElementById(
    "smartTitle"
  ).textContent =
    "Nothing obvious needs attention.";

  document.getElementById(
    "smartText"
  ).textContent =
    `${formatNumber(allFiles.length)} files use ${formatBytes(total)}.`;

}


/* -----------------------------
   SEARCH / SORT EVENTS
----------------------------- */

document.getElementById(
  "largeSearch"
).addEventListener(
  "input",
  () => renderLargeFiles()
);

document.getElementById(
  "largeSort"
).addEventListener(
  "change",
  () => renderLargeFiles()
);

document.getElementById(
  "oldSearch"
).addEventListener(
  "input",
  () => renderOldFiles()
);

document.getElementById(
  "oldSort"
).addEventListener(
  "change",
  () => renderOldFiles()
);


/* -----------------------------
   HELPERS
----------------------------- */

function getExtension(name) {

  const parts =
    name.toLowerCase()
      .split(".");

  if (parts.length < 2) {
    return "";
  }

  return parts.pop();

}


function getCategory(ext) {

  if (IMAGE_EXTENSIONS.has(ext))
    return "Images";

  if (VIDEO_EXTENSIONS.has(ext))
    return "Videos";

  if (AUDIO_EXTENSIONS.has(ext))
    return "Audio";

  if (ARCHIVE_EXTENSIONS.has(ext))
    return "Archives";

  if (DOCUMENT_EXTENSIONS.has(ext))
    return "Documents";

  if (CODE_EXTENSIONS.has(ext))
    return "Code";

  if (EXECUTABLE_EXTENSIONS.has(ext))
    return "Executables";

  return "Other";

}


function getFileIcon(ext) {

  if (IMAGE_EXTENSIONS.has(ext))
    return "▧";

  if (VIDEO_EXTENSIONS.has(ext))
    return "▶";

  if (AUDIO_EXTENSIONS.has(ext))
    return "♫";

  if (ARCHIVE_EXTENSIONS.has(ext))
    return "▱";

  if (DOCUMENT_EXTENSIONS.has(ext))
    return "▤";

  if (EXECUTABLE_EXTENSIONS.has(ext))
    return "⚙";

  return "□";

}


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
    Math.min(
      index,
      units.length - 1
    );

  const value =
    bytes /
    Math.pow(
      1024,
      safeIndex
    );

  return `${value.toFixed(
    value >= 100 ? 0 :
    value >= 10 ? 1 :
    2
  )} ${units[safeIndex]}`;

}


function formatNumber(number) {

  return Number(number || 0)
    .toLocaleString();

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


function escapeHTML(value) {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


function showOverlay() {

  scanOverlay.classList.remove(
    "hidden"
  );

  updateProgress(
    0,
    "Preparing scan..."
  );

}


function hideOverlay() {

  scanOverlay.classList.add(
    "hidden"
  );

}


function updateProgress(
  percent,
  message
) {

  progressBar.style.width =
    `${percent}%`;

  scanProgress.textContent =
    message;

}


function showToast(message) {

  toast.textContent =
    message;

  toast.classList.add("show");

  clearTimeout(
    showToast.timer
  );

  showToast.timer =
    setTimeout(() => {

      toast.classList.remove(
        "show"
      );

    }, 3000);

}


function wait(ms) {

  return new Promise(
    resolve =>
      setTimeout(resolve, ms)
  );

}


/* -----------------------------
   INITIAL STATE
----------------------------- */

document.getElementById(
  "totalFiles"
).textContent = "0";

document.getElementById(
  "totalSize"
).textContent = "0 B";

document.getElementById(
  "largeCount"
).textContent = "0";

document.getElementById(
  "duplicateCount"
).textContent = "0";
