"use strict";

/* =========================================================
   STORAGE CLEANER
   Browser-based local storage analyzer
========================================================= */


/* =========================================================
   DOM
========================================================= */

const fileInput =
  document.getElementById("fileInput");

const folderInput =
  document.getElementById("folderInput");

const selectFilesBtn =
  document.getElementById("selectFilesBtn");

const selectFolderBtn =
  document.getElementById("selectFolderBtn");

const rescanBtn =
  document.getElementById("rescanBtn");

const largeThreshold =
  document.getElementById("largeThreshold");

const scanStatus =
  document.getElementById("scanStatus");

const scanTitle =
  document.getElementById("scanTitle");

const scanText =
  document.getElementById("scanText");

const scanProgress =
  document.getElementById("scanProgress");

const scanPercent =
  document.getElementById("scanPercent");

const toast =
  document.getElementById("toast");

const toastText =
  document.getElementById("toastText");

const toastIcon =
  document.getElementById("toastIcon");


/* =========================================================
   STATE
========================================================= */

let allFiles = [];

let scanSource = null;

let currentPage = "dashboard";

let scanRunning = false;


/* =========================================================
   CONSTANTS
========================================================= */

const OLD_FILE_DAYS = 180;


/*
  We deliberately do NOT limit large files to 1 GB.

  The user can select:
  100 MB
  500 MB
  1 GB
  5 GB
  10 GB
*/

const SECURITY_EXTENSIONS = new Set([
  "exe",
  "msi",
  "com",
  "scr",
  "bat",
  "cmd",
  "ps1",
  "vbs",
  "vbe",
  "js",
  "jse",
  "wsf",
  "wsh",
  "hta",
  "jar",
  "dll"
]);


const TYPE_MAP = {

  Images: [
    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",
    "bmp",
    "svg",
    "ico",
    "tiff",
    "tif",
    "heic",
    "avif"
  ],

  Videos: [
    "mp4",
    "mkv",
    "avi",
    "mov",
    "wmv",
    "webm",
    "m4v",
    "flv"
  ],

  Audio: [
    "mp3",
    "wav",
    "flac",
    "aac",
    "ogg",
    "m4a",
    "wma"
  ],

  Documents: [
    "pdf",
    "doc",
    "docx",
    "txt",
    "rtf",
    "odt",
    "xls",
    "xlsx",
    "csv",
    "ppt",
    "pptx"
  ],

  Archives: [
    "zip",
    "rar",
    "7z",
    "tar",
    "gz",
    "bz2",
    "xz",
    "iso"
  ],

  Code: [
    "js",
    "jsx",
    "ts",
    "tsx",
    "html",
    "css",
    "scss",
    "json",
    "xml",
    "py",
    "java",
    "c",
    "cpp",
    "h",
    "hpp",
    "cs",
    "php",
    "go",
    "rs",
    "swift"
  ],

  Executables: [
    "exe",
    "msi",
    "dll",
    "app",
    "dmg",
    "deb",
    "rpm"
  ]

};


/* =========================================================
   NAVIGATION
========================================================= */

const navItems =
  document.querySelectorAll(".nav-item");

const pages =
  document.querySelectorAll(".page");


const pageInfo = {

  dashboard: {
    title: "Dashboard",
    subtitle:
      "Understand what is using your storage."
  },

  large: {
    title: "Large Files",
    subtitle:
      "Find files that consume significant storage."
  },

  duplicates: {
    title: "Duplicates",
    subtitle:
      "Find identical files and potential extra storage."
  },

  old: {
    title: "Old Files",
    subtitle:
      "Find files that have not been modified for a long time."
  },

  types: {
    title: "File Types",
    subtitle:
      "Understand which categories consume your storage."
  },

  folders: {
    title: "Folders",
    subtitle:
      "See which folders contain the most data."
  },

  security: {
    title: "Security Check",
    subtitle:
      "Identify executable and script files for review."
  }

};


navItems.forEach(button => {

  button.addEventListener("click", () => {

    const page =
      button.dataset.page;

    switchPage(page);

  });

});


function switchPage(page) {

  currentPage = page;

  navItems.forEach(item => {

    item.classList.toggle(
      "active",
      item.dataset.page === page
    );

  });


  pages.forEach(section => {

    section.classList.toggle(
      "active",
      section.id === `page-${page}`
    );

  });


  const info =
    pageInfo[page] || pageInfo.dashboard;

  document.getElementById(
    "pageTitle"
  ).textContent = info.title;

  document.getElementById(
    "pageSubtitle"
  ).textContent = info.subtitle;


  /*
    Re-render pages when opened.
    This also means changing the large-file
    threshold immediately works.
  */

  renderCurrentPage();

}


/* =========================================================
   PICKER FIX
========================================================= */

/*
  IMPORTANT:

  These are native <input type="file"> elements.

  This is much more compatible with Vercel
  than relying only on showDirectoryPicker().
*/


selectFilesBtn.addEventListener(
  "click",
  () => {

    if (scanRunning) {
      showToast(
        "Please wait until the current scan finishes.",
        "!"
      );

      return;
    }

    /*
      Reset value first.

      This allows selecting the SAME file again.
    */

    fileInput.value = "";

    fileInput.click();

  }
);


selectFolderBtn.addEventListener(
  "click",
  () => {

    if (scanRunning) {
      showToast(
        "Please wait until the current scan finishes.",
        "!"
      );

      return;
    }

    folderInput.value = "";

    folderInput.click();

  }
);


/* =========================================================
   FILE PICKER EVENTS
========================================================= */

fileInput.addEventListener(
  "change",
  event => {

    const files =
      Array.from(event.target.files || []);

    if (!files.length) {
      return;
    }

    scanSource = "files";

    startAnalysis(files);

  }
);


folderInput.addEventListener(
  "change",
  event => {

    const files =
      Array.from(event.target.files || []);

    if (!files.length) {
      return;
    }

    scanSource = "folder";

    startAnalysis(files);

  }
);


/* =========================================================
   RESCAN / CLEAR
========================================================= */

rescanBtn.addEventListener(
  "click",
  () => {

    if (scanRunning) {
      return;
    }

    allFiles = [];

    scanSource = null;

    resetDashboard();

    showToast(
      "Scan cleared.",
      "✓"
    );

  }
);


/* =========================================================
   START ANALYSIS
========================================================= */

async function startAnalysis(files) {

  if (scanRunning) {
    return;
  }

  scanRunning = true;

  allFiles = [];

  showScanStatus();

  updateProgress(
    0,
    "Preparing files..."
  );


  /*
    Convert FileList to our lightweight internal objects.

    IMPORTANT:
    We do NOT read the entire file into memory here.

    That means a 10 GB file can still be detected
    by size without attempting to load 10 GB
    into browser RAM.
  */

  const total =
    files.length;


  for (
    let index = 0;
    index < files.length;
    index++
  ) {

    const file =
      files[index];


    const relativePath =
      file.webkitRelativePath ||
      file.name;


    const extension =
      getExtension(file.name);


    const modified =
      file.lastModified
        ? new Date(file.lastModified)
        : null;


    allFiles.push({

      file,

      name: file.name,

      size: Number(file.size) || 0,

      type:
        file.type ||
        "application/octet-stream",

      extension,

      path: relativePath,

      modified,

      hash: null

    });


    const percent =
      Math.round(
        ((index + 1) / total) * 75
      );


    updateProgress(
      percent,
      `Reading file ${index + 1} of ${total}`
    );


    /*
      Yield to browser so the UI doesn't freeze.
    */

    if (index % 100 === 0) {
      await sleep(0);
    }

  }


  updateProgress(
    80,
    "Building storage analysis..."
  );


  await sleep(50);


  updateProgress(
    88,
    "Analyzing file categories..."
  );


  renderAll();


  updateProgress(
    100,
    `Analysis complete — ${allFiles.length.toLocaleString()} files`
  );


  await sleep(400);


  hideScanStatus();


  scanRunning = false;


  showToast(
    `${allFiles.length.toLocaleString()} files analyzed.`,
    "✓"
  );


  /*
    If user was already looking at a page,
    refresh it.
  */

  renderCurrentPage();

}


/* =========================================================
   RENDER ALL
========================================================= */

function renderAll() {

  updateStats();

  renderAttention();

  renderTypeSummary();

  renderLargeFiles();

  renderDuplicates();

  renderOldFiles();

  renderFileTypes();

  renderFolders();

  renderSecurity();

}


/* =========================================================
   CURRENT PAGE
========================================================= */

function renderCurrentPage() {

  if (!allFiles.length) {
    return;
  }

  switch (currentPage) {

    case "dashboard":
      updateStats();
      renderAttention();
      renderTypeSummary();
      break;

    case "large":
      renderLargeFiles();
      break;

    case "duplicates":
      renderDuplicates();
      break;

    case "old":
      renderOldFiles();
      break;

    case "types":
      renderFileTypes();
      break;

    case "folders":
      renderFolders();
      break;

    case "security":
      renderSecurity();
      break;

  }

}


/* =========================================================
   STATS
========================================================= */

function updateStats() {

  const totalSize =
    allFiles.reduce(
      (sum, item) =>
        sum + item.size,
      0
    );


  const threshold =
    Number(
      largeThreshold.value
    );


  const large =
    allFiles.filter(
      item =>
        item.size >= threshold
    );


  const duplicateGroups =
    getDuplicateCandidates();


  const duplicateExtra =
    duplicateGroups.reduce(
      (sum, group) =>
        sum +
        (
          group.files.length - 1
        ) *
        group.files[0].size,
      0
    );


  document.getElementById(
    "totalFiles"
  ).textContent =
    allFiles.length.toLocaleString();


  document.getElementById(
    "totalSize"
  ).textContent =
    formatBytes(totalSize);


  document.getElementById(
    "largeFilesCount"
  ).textContent =
    large.length.toLocaleString();


  document.getElementById(
    "largeFilesSize"
  ).textContent =
    `${formatBytes(
      large.reduce(
        (sum, item) =>
          sum + item.size,
        0
      )
    )} total`;


  document.getElementById(
    "duplicateCount"
  ).textContent =
    duplicateGroups.length.toLocaleString();


  document.getElementById(
    "duplicateSize"
  ).textContent =
    `${formatBytes(
      duplicateExtra
    )} potential extra space`;

}


/* =========================================================
   LARGE FILES
========================================================= */

largeThreshold.addEventListener(
  "change",
  () => {

    updateStats();

    renderLargeFiles();

  }
);


function renderLargeFiles() {

  const container =
    document.getElementById(
      "largeFilesList"
    );


  const threshold =
    Number(
      largeThreshold.value
    );


  const large =
    allFiles
      .filter(
        item =>
          item.size >= threshold
      )
      .sort(
        (a, b) =>
          b.size - a.size
      );


  if (!large.length) {

    container.innerHTML = `

      <div class="empty-state">

        <div class="empty-icon">◉</div>

        <strong>
          No large files found
        </strong>

        <span>
          No selected file is larger than
          ${formatBytes(threshold)}.
        </span>

      </div>

    `;

    return;
  }


  container.innerHTML =
    large
      .map(fileRow)
      .join("");

}


/* =========================================================
   OLD FILES
========================================================= */

function renderOldFiles() {

  const container =
    document.getElementById(
      "oldFilesList"
    );


  const cutoff =
    Date.now() -
    (
      OLD_FILE_DAYS *
      24 *
      60 *
      60 *
      1000
    );


  const old =
    allFiles
      .filter(
        item =>
          item.modified &&
          item.modified.getTime() < cutoff
      )
      .sort(
        (a, b) =>
          a.modified - b.modified
      );


  if (!old.length) {

    container.innerHTML = `

      <div class="empty-state">

        <div class="empty-icon">◷</div>

        <strong>
          No old files found
        </strong>

        <span>
          No selected file has been untouched
          for more than ${OLD_FILE_DAYS} days.
        </span>

      </div>

    `;

    return;
  }


  container.innerHTML =
    old
      .map(fileRow)
      .join("");

}


/* =========================================================
   DUPLICATES
========================================================= */

/*
  Important performance strategy:

  We first group by size.

  Files with different sizes cannot have identical
  content, so we don't need to read/hash them.

  We only hash files when multiple files share
  the same size.
*/

function getDuplicateCandidates() {

  const bySize =
    new Map();


  for (const item of allFiles) {

    if (!bySize.has(item.size)) {
      bySize.set(
        item.size,
        []
      );
    }

    bySize
      .get(item.size)
      .push(item);

  }


  return Array.from(
    bySize.values()
  )
  .filter(
    group =>
      group.length > 1
  )
  .map(
    group => ({
      key: `size-${group[0].size}`,
      files: group
    })
  );

}


/*
  Browser-safe duplicate detection.

  We calculate hashes only for candidate files.

  For very large files we use chunks instead of
  file.arrayBuffer(), avoiding huge RAM usage.
*/

async function calculateHash(file) {

  if (file.hash) {
    return file.hash;
  }


  /*
    Use SHA-256.

    For files under 100 MB, normal arrayBuffer
    is acceptable.

    Larger files are hashed in chunks.
  */

  const CHUNK_SIZE =
    4 * 1024 * 1024;


  try {

    /*
      crypto.subtle.digest requires the entire
      input, so for very large files we create
      a sampled fingerprint instead.

      This is intentionally NOT called a cryptographic
      duplicate proof for huge files.
    */

    if (file.size <= 100 * 1024 * 1024) {

      const buffer =
        await file.arrayBuffer();

      const hashBuffer =
        await crypto.subtle.digest(
          "SHA-256",
          buffer
        );

      const hashArray =
        Array.from(
          new Uint8Array(hashBuffer)
        );

      const hashHex =
        hashArray
          .map(
            byte =>
              byte
                .toString(16)
                .padStart(2, "0")
          )
          .join("");


      file.hash =
        `sha256:${hashHex}`;

      return file.hash;

    }


    /*
      Large-file fingerprint:
      first chunk + middle chunk + last chunk.

      Same size + same sampled content means
      "possible duplicate", not guaranteed duplicate.
    */

    const positions = [

      0,

      Math.max(
        0,
        Math.floor(
          file.size / 2
        ) -
        Math.floor(
          CHUNK_SIZE / 2
        )
      ),

      Math.max(
        0,
        file.size - CHUNK_SIZE
      )

    ];


    const buffers = [];


    for (const start of positions) {

      const end =
        Math.min(
          file.size,
          start + CHUNK_SIZE
        );


      const buffer =
        await file.slice(
          start,
          end
        ).arrayBuffer();


      buffers.push(
        new Uint8Array(buffer)
      );

    }


    let combinedLength = 0;

    for (const buffer of buffers) {
      combinedLength +=
        buffer.length;
    }


    const combined =
      new Uint8Array(
        combinedLength
      );


    let offset = 0;


    for (const buffer of buffers) {

      combined.set(
        buffer,
        offset
      );

      offset +=
        buffer.length;

    }


    const hashBuffer =
      await crypto.subtle.digest(
        "SHA-256",
        combined
      );


    const hashArray =
      Array.from(
        new Uint8Array(hashBuffer)
      );


    const hashHex =
      hashArray
        .map(
          byte =>
            byte
              .toString(16)
              .padStart(2, "0")
        )
        .join("");


    file.hash =
      `sampled-sha256:${hashHex}`;

    return file.hash;

  } catch (error) {

    return null;

  }

}


async function renderDuplicates() {

  const container =
    document.getElementById(
      "duplicatesList"
    );

  const summary =
    document.getElementById(
      "duplicateSummary"
    );


  if (!allFiles.length) {

    container.innerHTML = `

      <div class="empty-state">

        <div class="empty-icon">◇</div>

        <strong>
          No duplicates found
        </strong>

        <span>
          Select files or a folder to analyze duplicates.
        </span>

      </div>

    `;

    summary.textContent =
      "No duplicate analysis yet.";

    return;

  }


  const candidates =
    getDuplicateCandidates();


  if (!candidates.length) {

    container.innerHTML = `

      <div class="empty-state">

        <div class="empty-icon">✓</div>

        <strong>
          No duplicate candidates found
        </strong>

        <span>
          No files in the selected set currently share the same size.
        </span>

      </div>

    `;

    summary.textContent =
      "No duplicate candidates found.";

    return;

  }


  /*
    Hash candidate groups.

    Limit concurrency to avoid freezing the browser.
  */

  updateProgress(
    90,
    "Checking duplicate candidates..."
  );


  const duplicateGroups = [];


  for (
    let groupIndex = 0;
    groupIndex < candidates.length;
    groupIndex++
  ) {

    const candidate =
      candidates[groupIndex];


    const hashMap =
      new Map();


    for (const item of candidate.files) {

      const hash =
        await calculateHash(
          item
        );


      if (!hash) {
        continue;
      }


      if (!hashMap.has(hash)) {

        hashMap.set(
          hash,
          []
        );

      }


      hashMap
        .get(hash)
        .push(item);

    }


    for (const [
      hash,
      files
    ] of hashMap.entries()) {

      if (files.length > 1) {

        duplicateGroups.push({
          hash,
          files
        });

      }

    }


    if (
      groupIndex % 3 === 0
    ) {

      await sleep(0);

    }

  }


  if (!duplicateGroups.length) {

    container.innerHTML = `

      <div class="empty-state">

        <div class="empty-icon">✓</div>

        <strong>
          No identical files found
        </strong>

        <span>
          Files with matching sizes were checked,
          but no identical content was confirmed.
        </span>

      </div>

    `;

    summary.textContent =
      "No identical files found.";

    return;

  }


  let extraSpace = 0;


  for (const group of duplicateGroups) {

    extraSpace +=
      (
        group.files.length - 1
      ) *
      group.files[0].size;

  }


  summary.textContent =
    `${duplicateGroups.length} duplicate groups • ` +
    `${formatBytes(extraSpace)} potential extra space`;


  container.innerHTML =
    duplicateGroups
      .map(
        (group, index) => {

          const extra =
            (
              group.files.length - 1
            ) *
            group.files[0].size;


          return `

            <div class="duplicate-group">

              <div class="duplicate-header">

                <strong>
                  Duplicate Group ${index + 1}
                </strong>

                <span>
                  ${formatBytes(extra)}
                  extra
                </span>

              </div>

              ${group.files
                .map(
                  item => `

                    <div class="duplicate-file">

                      <span
                        class="duplicate-file-name"
                        title="${escapeHTML(item.path)}"
                      >
                        ${escapeHTML(item.path)}
                      </span>

                      <span class="duplicate-file-size">
                        ${formatBytes(item.size)}
                      </span>

                    </div>

                  `
                )
                .join("")}

            </div>

          `;

        }
      )
      .join("");

}


/* =========================================================
   FILE TYPES
========================================================= */

function getFileCategory(item) {

  const ext =
    item.extension;


  for (
    const [
      category,
      extensions
    ]
    of Object.entries(TYPE_MAP)
  ) {

    if (
      extensions.includes(ext)
    ) {

      return category;

    }

  }


  return "Other";

}


function buildTypeStats() {

  const map =
    new Map();


  for (const item of allFiles) {

    const category =
      getFileCategory(item);


    if (!map.has(category)) {

      map.set(
        category,
        {
          count: 0,
          size: 0
        }
      );

    }


    const entry =
      map.get(category);


    entry.count++;

    entry.size +=
      item.size;

  }


  return Array.from(
    map.entries()
  )
  .map(
    ([name, value]) => ({
      name,
      ...value
    })
  )
  .sort(
    (a, b) =>
      b.size - a.size
  );

}


function renderTypeSummary() {

  const container =
    document.getElementById(
      "typeSummary"
    );


  if (!allFiles.length) {

    container.innerHTML = `

      <div class="empty-state small">

        <div class="empty-icon">◌</div>

        <strong>
          Nothing to analyze
        </strong>

        <span>
          Your storage breakdown will appear here.
        </span>

      </div>

    `;

    return;

  }


  const stats =
    buildTypeStats();


  const total =
    allFiles.reduce(
      (sum, item) =>
        sum + item.size,
      0
    );


  container.innerHTML = `

    <div class="type-summary">

      ${stats
        .slice(0, 7)
        .map(
          type => {

            const percent =
              total > 0
                ? (
                    type.size /
                    total
                  ) *
                  100
                : 0;


            return `

              <div class="type-summary-row">

                <div class="type-summary-head">

                  <span>
                    ${escapeHTML(type.name)}
                  </span>

                  <span>
                    ${formatBytes(type.size)}
                    •
                    ${percent.toFixed(1)}%
                  </span>

                </div>

                <div class="type-track">

                  <div
                    class="type-fill"
                    style="width:${Math.max(
                      1,
                      percent
                    )}%"
                  ></div>

                </div>

              </div>

            `;

          }
        )
        .join("")}

    </div>

  `;

}


function renderFileTypes() {

  const container =
    document.getElementById(
      "fileTypesGrid"
    );


  if (!allFiles.length) {

    container.innerHTML = `

      <div class="empty-state">

        <div class="empty-icon">▦</div>

        <strong>
          No file types yet
        </strong>

        <span>
          Scan some files to see the breakdown.
        </span>

      </div>

    `;

    return;

  }


  const stats =
    buildTypeStats();


  container.innerHTML =
    stats
      .map(
        item => `

          <div class="type-card">

            <div class="type-card-top">

              <div class="type-card-icon">
                ${getTypeIcon(item.name)}
              </div>

              <div>
                <h4>
                  ${escapeHTML(item.name)}
                </h4>

                <p>
                  ${item.count.toLocaleString()} files
                </p>
              </div>

            </div>

            <div class="type-card-size">
              ${formatBytes(item.size)}
            </div>

            <div class="type-card-count">
              Storage used by this category
            </div>

          </div>

        `
      )
      .join("");

}


/* =========================================================
   FOLDERS
========================================================= */

function buildFolderStats() {

  const map =
    new Map();


  for (const item of allFiles) {

    const path =
      item.path || item.name;


    const parts =
      path.split(
        /[\\/]/
      );


    let folder = "";


    if (parts.length > 1) {

      folder =
        parts[0];

    } else {

      folder =
        "Selected Files";

    }


    if (!map.has(folder)) {

      map.set(
        folder,
        {
          name: folder,
          size: 0,
          count: 0
        }
      );

    }


    const entry =
      map.get(folder);


    entry.size +=
      item.size;

    entry.count++;

  }


  return Array.from(
    map.values()
  )
  .sort(
    (a, b) =>
      b.size - a.size
  );

}


function renderFolders() {

  const container =
    document.getElementById(
      "foldersList"
    );


  if (!allFiles.length) {

    container.innerHTML = `

      <div class="empty-state">

        <div class="empty-icon">▱</div>

        <strong>
          No folders analyzed
        </strong>

        <span>
          Select a folder to map its storage usage.
        </span>

      </div>

    `;

    return;

  }


  const folders =
    buildFolderStats();


  const total =
    allFiles.reduce(
      (sum, item) =>
        sum + item.size,
      0
    );


  container.innerHTML =
    folders
      .map(
        folder => {

          const percent =
            total > 0
              ? (
                  folder.size /
                  total
                ) *
                100
              : 0;


          return `

            <div class="folder-row">

              <div class="folder-head">

                <span
                  class="folder-name"
                  title="${escapeHTML(folder.name)}"
                >
                  ▱
                  ${escapeHTML(folder.name)}
                </span>

                <span class="folder-size">
                  ${formatBytes(folder.size)}
                </span>

              </div>

              <div class="folder-meta">

                <span>
                  ${folder.count.toLocaleString()} files
                </span>

                <span>
                  ${percent.toFixed(1)}%
                </span>

              </div>

              <div class="folder-track">

                <div
                  class="folder-fill"
                  style="width:${Math.max(
                    1,
                    percent
                  )}%"
                ></div>

              </div>

            </div>

          `;

        }
      )
      .join("");

}


/* =========================================================
   SECURITY ANALYSIS
========================================================= */

function renderSecurity() {

  const container =
    document.getElementById(
      "securityList"
    );


  if (!allFiles.length) {

    container.innerHTML = `

      <div class="empty-state">

        <div class="empty-icon">◇</div>

        <strong>
          No security signals
        </strong>

        <span>
          Scan files to analyze executable and script extensions.
        </span>

      </div>

    `;

    return;

  }


  const suspicious =
    allFiles.filter(
      item =>
        SECURITY_EXTENSIONS.has(
          item.extension
        )
    );


  if (!suspicious.length) {

    container.innerHTML = `

      <div class="empty-state">

        <div class="empty-icon">✓</div>

        <strong>
          No executable or script signals found
        </strong>

        <span>
          This does not mean the files are malware-free.
          It only means no monitored extension was found.
        </span>

      </div>

    `;

    return;

  }


  container.innerHTML =
    suspicious
      .sort(
        (a, b) =>
          b.size - a.size
      )
      .map(
        item => `

          <div class="security-card">

            <div class="security-icon">
              !
            </div>

            <div class="security-info">

              <strong>
                ${escapeHTML(item.name)}
              </strong>

              <span
                title="${escapeHTML(item.path)}"
              >
                ${escapeHTML(item.path)}
              </span>

              <span>
                .${escapeHTML(item.extension)}
                •
                ${formatBytes(item.size)}
              </span>

            </div>

          </div>

        `
      )
      .join("");

}


/* =========================================================
   ATTENTION
========================================================= */

function renderAttention() {

  const container =
    document.getElementById(
      "attentionList"
    );


  if (!allFiles.length) {

    container.innerHTML = `

      <div class="empty-state small">

        <div class="empty-icon">⌕</div>

        <strong>
          No scan yet
        </strong>

        <span>
          Select files or a folder to begin.
        </span>

      </div>

    `;

    return;

  }


  const threshold =
    Number(
      largeThreshold.value
    );


  const largeCount =
    allFiles.filter(
      item =>
        item.size >= threshold
    ).length;


  const oldCount =
    getOldFilesCount();


  const duplicateCandidates =
    getDuplicateCandidates().length;


  const securityCount =
    allFiles.filter(
      item =>
        SECURITY_EXTENSIONS.has(
          item.extension
        )
    ).length;


  const items = [];


  if (largeCount > 0) {

    items.push({

      icon: "◉",

      title:
        `${largeCount.toLocaleString()} large file${
          largeCount === 1
            ? ""
            : "s"
        }`,

      text:
        `Files larger than ${formatBytes(threshold)}.`

    });

  }


  if (duplicateCandidates > 0) {

    items.push({

      icon: "◇",

      title:
        `${duplicateCandidates.toLocaleString()} duplicate candidate group${
          duplicateCandidates === 1
            ? ""
            : "s"
        }`,

      text:
        "Files sharing the same size need duplicate verification."

    });

  }


  if (oldCount > 0) {

    items.push({

      icon: "◷",

      title:
        `${oldCount.toLocaleString()} old file${
          oldCount === 1
            ? ""
            : "s"
        }`,

      text:
        `Not modified for more than ${OLD_FILE_DAYS} days.`

    });

  }


  if (securityCount > 0) {

    items.push({

      icon: "!",

      title:
        `${securityCount.toLocaleString()} executable/script file${
          securityCount === 1
            ? ""
            : "s"
        }`,

      text:
        "These are security review signals, not virus detections."

    });

  }


  if (!items.length) {

    container.innerHTML = `

      <div class="empty-state small">

        <div class="empty-icon">✓</div>

        <strong>
          Nothing unusual detected
        </strong>

        <span>
          No current attention signals were found.
        </span>

      </div>

    `;

    return;

  }


  container.innerHTML =
    items
      .slice(0, 5)
      .map(
        item => `

          <div class="attention-item">

            <div class="attention-icon">
              ${item.icon}
            </div>

            <div class="attention-content">

              <strong>
                ${escapeHTML(item.title)}
              </strong>

              <span>
                ${escapeHTML(item.text)}
              </span>

            </div>

          </div>

        `
      )
      .join("");

}


/* =========================================================
   HELPERS
========================================================= */

function getOldFilesCount() {

  const cutoff =
    Date.now() -
    (
      OLD_FILE_DAYS *
      24 *
      60 *
      60 *
      1000
    );


  return allFiles.filter(
    item =>
      item.modified &&
      item.modified.getTime() < cutoff
  ).length;

}


function getExtension(name) {

  const dot =
    name.lastIndexOf(".");


  if (
    dot <= 0 ||
    dot === name.length - 1
  ) {

    return "";

  }


  return name
    .slice(dot + 1)
    .toLowerCase();

}


function getFileIcon(item) {

  const category =
    getFileCategory(item);


  switch (category) {

    case "Images":
      return "▧";

    case "Videos":
      return "▶";

    case "Audio":
      return "♪";

    case "Documents":
      return "▤";

    case "Archives":
      return "◫";

    case "Code":
      return "</>";

    case "Executables":
      return "⚙";

    default:
      return "•";

  }

}


function getTypeIcon(type) {

  switch (type) {

    case "Images":
      return "▧";

    case "Videos":
      return "▶";

    case "Audio":
      return "♪";

    case "Documents":
      return "▤";

    case "Archives":
      return "◫";

    case "Code":
      return "</>";

    case "Executables":
      return "⚙";

    default:
      return "•";

  }

}


function fileRow(item) {

  const date =
    item.modified
      ? item.modified.toLocaleDateString()
      : "Unknown";


  return `

    <div class="file-row">

      <div class="file-icon">
        ${getFileIcon(item)}
      </div>

      <div class="file-info">

        <div
          class="file-name"
          title="${escapeHTML(item.name)}"
        >
          ${escapeHTML(item.name)}
        </div>

        <div
          class="file-path"
          title="${escapeHTML(item.path)}"
        >
          ${escapeHTML(item.path)}
        </div>

      </div>

      <div class="file-size">
        ${formatBytes(item.size)}
      </div>

      <div class="file-date">
        ${date}
      </div>

    </div>

  `;

}


function formatBytes(bytes) {

  if (
    !Number.isFinite(bytes) ||
    bytes <= 0
  ) {

    return "0 B";

  }


  const units = [
    "B",
    "KB",
    "MB",
    "GB",
    "TB",
    "PB"
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


  if (safeIndex === 0) {

    return `${Math.round(value)} ${units[safeIndex]}`;

  }


  if (value >= 100) {

    return `${value.toFixed(0)} ${units[safeIndex]}`;

  }


  if (value >= 10) {

    return `${value.toFixed(1)} ${units[safeIndex]}`;

  }


  return `${value.toFixed(2)} ${units[safeIndex]}`;

}


function escapeHTML(value) {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


function sleep(ms) {

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );

}


/* =========================================================
   SCAN UI
========================================================= */

function showScanStatus() {

  scanStatus.classList.remove(
    "hidden"
  );

}


function hideScanStatus() {

  scanStatus.classList.add(
    "hidden"
  );

}


function updateProgress(
  percent,
  message
) {

  const safePercent =
    Math.max(
      0,
      Math.min(
        100,
        percent
      )
    );


  scanProgress.style.width =
    `${safePercent}%`;


  scanPercent.textContent =
    `${Math.round(
      safePercent
    )}%`;


  scanText.textContent =
    message;


  if (
    safePercent >= 100
  ) {

    scanTitle.textContent =
      "Analysis complete";

  } else {

    scanTitle.textContent =
      "Analyzing files...";

  }

}


/* =========================================================
   TOAST
========================================================= */

let toastTimer = null;


function showToast(
  message,
  icon = "✓"
) {

  toastText.textContent =
    message;

  toastIcon.textContent =
    icon;


  toast.classList.add(
    "show"
  );


  clearTimeout(
    toastTimer
  );


  toastTimer =
    setTimeout(
      () => {

        toast.classList.remove(
          "show"
        );

      },
      3000
    );

}


/* =========================================================
   RESET
========================================================= */

function resetDashboard() {

  document.getElementById(
    "totalFiles"
  ).textContent = "0";


  document.getElementById(
    "totalSize"
  ).textContent = "0 B";


  document.getElementById(
    "largeFilesCount"
  ).textContent = "0";


  document.getElementById(
    "largeFilesSize"
  ).textContent = "0 B";


  document.getElementById(
    "duplicateCount"
  ).textContent = "0";


  document.getElementById(
    "duplicateSize"
  ).textContent =
    "0 B potential extra space";


  renderAttention();

  renderTypeSummary();

  renderLargeFiles();

  renderDuplicates();

  renderOldFiles();

  renderFileTypes();

  renderFolders();

  renderSecurity();

}


/* =========================================================
   INITIALIZE
========================================================= */

resetDashboard();

switchPage(
  "dashboard"
);
