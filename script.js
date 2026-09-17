const state = {
  files: [],
  largeFiles: [],
  oldFiles: [],
  duplicateGroups: [],
  typeStats: [],
  folderStats: []
};

const LARGE_FILE_SIZE = 500 * 1024 * 1024;
const OLD_FILE_DAYS = 180;

const $ = id => document.getElementById(id);


/* -----------------------------
   BASIC HELPERS
----------------------------- */

function formatBytes(bytes) {

  if (!bytes || bytes <= 0) {
    return "0 B";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB",
    "TB"
  ];

  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );

  return `${(
    bytes / Math.pow(1024, index)
  ).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}


function formatDate(timestamp) {

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


function getExtension(name) {

  const parts = name.split(".");

  if (parts.length <= 1) {
    return "";
  }

  return parts
    .pop()
    .toLowerCase();
}


function getCategory(name) {

  const ext = getExtension(name);

  const categories = {

    Images: [
      "jpg",
      "jpeg",
      "png",
      "gif",
      "webp",
      "bmp",
      "svg",
      "ico",
      "tiff"
    ],

    Videos: [
      "mp4",
      "mkv",
      "mov",
      "avi",
      "webm",
      "wmv",
      "flv",
      "m4v"
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
      "odt"
    ],

    Spreadsheets: [
      "xls",
      "xlsx",
      "csv",
      "ods"
    ],

    Presentations: [
      "ppt",
      "pptx",
      "odp"
    ],

    Archives: [
      "zip",
      "rar",
      "7z",
      "tar",
      "gz",
      "bz2"
    ],

    Code: [
      "js",
      "ts",
      "jsx",
      "tsx",
      "html",
      "css",
      "py",
      "java",
      "cpp",
      "c",
      "cs",
      "php",
      "json",
      "xml",
      "sql"
    ],

    Executables: [
      "exe",
      "msi",
      "app",
      "bat",
      "cmd"
    ]

  };

  for (const [category, extensions] of Object.entries(categories)) {

    if (extensions.includes(ext)) {
      return category;
    }

  }

  return "Other";
}


function fileIcon(file) {

  const category = getCategory(file.name);

  const icons = {
    Images: "▧",
    Videos: "▶",
    Audio: "♫",
    Documents: "▤",
    Spreadsheets: "▦",
    Presentations: "▥",
    Archives: "◆",
    Code: "</>",
    Executables: "⚙",
    Other: "◫"
  };

  return icons[category] || "◫";
}


function showToast(message) {

  const toast = $("toast");

  toast.textContent = message;

  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}


/* -----------------------------
   SCAN STATUS
----------------------------- */

function setScanning(scanning) {

  const dot = $("scanStatusDot");
  const status = $("scanStatus");
  const circle = $("scanCircleText");

  if (scanning) {

    dot.classList.remove("done");
    dot.classList.add("scanning");

    status.textContent = "Scanning files...";

    circle.textContent = "SCANNING";

  } else {

    dot.classList.remove("scanning");
    dot.classList.add("done");

    status.textContent =
      `${state.files.length} files analyzed`;

    circle.textContent = "DONE";

  }

}


/* -----------------------------
   FILE SCANNING
----------------------------- */

function selectFolder() {

  const input =
    document.createElement("input");

  input.type = "file";
  input.multiple = true;
  input.webkitdirectory = true;
  input.directory = true;

  input.addEventListener(
    "change",
    async () => {

      if (!input.files.length) {
        return;
      }

      await scanFiles(input.files);

    }
  );

  input.click();
}


async function scanFiles(fileList) {

  state.files = [];
  state.largeFiles = [];
  state.oldFiles = [];
  state.duplicateGroups = [];
  state.typeStats = [];
  state.folderStats = [];

  setScanning(true);

  showToast("Starting storage scan...");

  const now = Date.now();

  const oldLimit =
    now -
    OLD_FILE_DAYS *
    24 *
    60 *
    60 *
    1000;


  for (const file of Array.from(fileList)) {

    const path =
      file.webkitRelativePath ||
      file.name;

    const data = {

      id: crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,

      name: file.name,

      path,

      size: file.size,

      lastModified: file.lastModified,

      raw: file

    };


    state.files.push(data);


    if (
      file.size >=
      LARGE_FILE_SIZE
    ) {

      state.largeFiles.push(data);

    }


    if (
      file.lastModified <
      oldLimit
    ) {

      state.oldFiles.push(data);

    }

  }


  calculateTypes();
  calculateFolders();

  renderBasicStats();

  renderAll();

  /*
    Duplicate scanning can be expensive.
    Only files with the same size can
    possibly be duplicates.
  */

  await findRealDuplicates();

  renderDuplicateResults();

  setScanning(false);

  showToast(
    `Scan complete — ${state.files.length} files analyzed.`
  );

}


/* -----------------------------
   REAL DUPLICATE DETECTION
----------------------------- */

async function hashFile(file) {

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

  return hashArray
    .map(byte =>
      byte
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
}


async function findRealDuplicates() {

  const bySize =
    new Map();


  /*
    First group by size.
    Different-size files can never
    have identical content.
  */

  for (const file of state.files) {

    if (!bySize.has(file.size)) {
      bySize.set(file.size, []);
    }

    bySize
      .get(file.size)
      .push(file);

  }


  const candidates =
    Array.from(
      bySize.values()
    )
    .filter(group =>
      group.length > 1
    );


  if (!candidates.length) {

    state.duplicateGroups = [];

    return;

  }


  const hashMap =
    new Map();

  let processed = 0;

  const totalCandidates =
    candidates.reduce(
      (sum, group) =>
        sum + group.length,
      0
    );


  for (const group of candidates) {

    for (const file of group) {

      try {

        const hash =
          await hashFile(file.raw);

        if (!hashMap.has(hash)) {
          hashMap.set(hash, []);
        }

        hashMap
          .get(hash)
          .push(file);

      } catch (error) {

        console.warn(
          "Could not hash file:",
          file.name,
          error
        );

      }


      processed++;


      if (
        processed % 5 === 0 ||
        processed === totalCandidates
      ) {

        $("scanStatus").textContent =
          `Checking duplicates ${processed}/${totalCandidates}`;

      }

    }

  }


  state.duplicateGroups =
    Array.from(
      hashMap.values()
    )
    .filter(group =>
      group.length > 1
    );

}


/* -----------------------------
   TYPE ANALYSIS
----------------------------- */

function calculateTypes() {

  const map = new Map();


  for (const file of state.files) {

    const category =
      getCategory(file.name);


    if (!map.has(category)) {

      map.set(
        category,
        {
          name: category,
          size: 0,
          count: 0
        }
      );

    }


    const entry =
      map.get(category);

    entry.size += file.size;
    entry.count++;

  }


  state.typeStats =
    Array.from(
      map.values()
    )
    .sort(
      (a, b) =>
        b.size - a.size
    );

}


/* -----------------------------
   FOLDER ANALYSIS
----------------------------- */

function calculateFolders() {

  const map = new Map();


  for (const file of state.files) {

    const parts =
      file.path.split("/");

    /*
      webkitRelativePath usually:
      SelectedFolder/subfolder/file.ext
    */

    parts.pop();

    let currentPath = "";

    for (
      let i = 0;
      i < parts.length;
      i++
    ) {

      currentPath =
        currentPath
          ? `${currentPath}/${parts[i]}`
          : parts[i];


      if (!map.has(currentPath)) {

        map.set(
          currentPath,
          {
            name: parts[i],
            path: currentPath,
            size: 0,
            count: 0
          }
        );

      }


      const folder =
        map.get(currentPath);

      folder.size += file.size;
      folder.count++;

    }

  }


  state.folderStats =
    Array.from(
      map.values()
    )
    .sort(
      (a, b) =>
        b.size - a.size
    );

}


/* -----------------------------
   DASHBOARD STATS
----------------------------- */

function renderBasicStats() {

  const totalSize =
    state.files.reduce(
      (sum, file) =>
        sum + file.size,
      0
    );


  $("totalFiles").textContent =
    state.files.length;


  $("totalSize").textContent =
    formatBytes(totalSize);


  $("largeCount").textContent =
    state.largeFiles.length;


  $("duplicateCount").textContent =
    state.duplicateGroups.length;


  $("largeAttention").textContent =
    state.largeFiles.length;


  $("duplicateAttention").textContent =
    state.duplicateGroups.length;


  $("oldAttention").textContent =
    state.oldFiles.length;


  $("typeAttention").textContent =
    state.typeStats.length;


  $("folderAttention").textContent =
    state.folderStats.length;

}


/* -----------------------------
   FILE ROW
----------------------------- */

function renderFileRow(file) {

  return `
    <div class="file-row">

      <div class="file-icon">
        ${fileIcon(file)}
      </div>

      <div>

        <div class="file-name">
          ${escapeHTML(file.name)}
        </div>

        <div class="file-path">
          ${escapeHTML(file.path)}
        </div>

      </div>

      <div>

        <div class="file-size">
          ${formatBytes(file.size)}
        </div>

        <button
          class="file-info-btn"
          data-file-id="${file.id}"
        >
          Details
        </button>

      </div>

    </div>
  `;

}


/* -----------------------------
   LARGE FILES
----------------------------- */

function renderLargeFiles() {

  const search =
    $("largeSearch")
      .value
      .toLowerCase()
      .trim();

  const sort =
    $("largeSort").value;


  let files =
    [...state.largeFiles];


  if (search) {

    files =
      files.filter(file =>
        file.name
          .toLowerCase()
          .includes(search) ||

        file.path
          .toLowerCase()
          .includes(search)
      );

  }


  files.sort((a, b) => {

    if (sort === "size-asc") {
      return a.size - b.size;
    }

    if (sort === "name") {
      return a.name.localeCompare(b.name);
    }

    if (sort === "date") {
      return a.lastModified - b.lastModified;
    }

    return b.size - a.size;

  });


  if (!files.length) {

    $("largeFilesList").innerHTML =
      `<div class="empty-state">
        No large files found.
      </div>`;

    return;

  }


  $("largeFilesList").innerHTML =
    files.map(renderFileRow).join("");

}


/* -----------------------------
   OLD FILES
----------------------------- */

function renderOldFiles() {

  const search =
    $("oldSearch")
      .value
      .toLowerCase()
      .trim();

  const sort =
    $("oldSort").value;


  let files =
    [...state.oldFiles];


  if (search) {

    files =
      files.filter(file =>
        file.name
          .toLowerCase()
          .includes(search) ||

        file.path
          .toLowerCase()
          .includes(search)
      );

  }


  files.sort((a, b) => {

    if (sort === "newest") {
      return b.lastModified - a.lastModified;
    }

    if (sort === "size-desc") {
      return b.size - a.size;
    }

    if (sort === "name") {
      return a.name.localeCompare(b.name);
    }

    return a.lastModified - b.lastModified;

  });


  if (!files.length) {

    $("oldFilesList").innerHTML =
      `<div class="empty-state">
        No old files found.
      </div>`;

    return;

  }


  $("oldFilesList").innerHTML =
    files
      .map(file =>
        renderFileRow(file)
      )
      .join("");

}


/* -----------------------------
   DUPLICATE RESULTS
----------------------------- */

function renderDuplicateResults() {

  const groups =
    state.duplicateGroups;


  $("duplicateGroupsTotal").textContent =
    groups.length;


  let waste = 0;


  for (const group of groups) {

    /*
      If a group has 3 identical files,
      keeping one means 2 copies are
      potentially removable.
    */

    waste +=
      group[0].size *
      (group.length - 1);

  }


  $("duplicateWaste").textContent =
    formatBytes(waste);


  if (!groups.length) {

    $("duplicatesList").innerHTML =
      `<div class="empty-state">
        No identical duplicate files found.
      </div>`;

    return;

  }


  $("duplicatesList").innerHTML =
    groups
      .map((group, index) => {

        const total =
          group[0].size *
          group.length;


        return `
          <div class="duplicate-group">

            <div class="duplicate-group-header">

              <div>
                <strong>
                  Duplicate Group ${index + 1}
                </strong>

                <span>
                  ${group.length} identical files
                </span>
              </div>

              <span>
                ${formatBytes(total)}
              </span>

            </div>


            <div class="duplicate-files">

              ${group.map(file => `

                <div class="duplicate-file">

                  <div class="mini-icon">
                    ${fileIcon(file)}
                  </div>

                  <div>

                    <div class="file-name">
                      ${escapeHTML(file.name)}
                    </div>

                    <div class="file-path">
                      ${escapeHTML(file.path)}
                    </div>

                  </div>

                  <div class="mini-size">
                    ${formatBytes(file.size)}
                  </div>

                </div>

              `).join("")}

            </div>

          </div>
        `;

      })
      .join("");

}


/* -----------------------------
   TYPE RESULTS
----------------------------- */

function renderTypeResults() {

  const total =
    state.files.reduce(
      (sum, file) =>
        sum + file.size,
      0
    );


  if (!state.typeStats.length) {

    $("fileTypesList").innerHTML =
      `<div class="empty-state">
        No scan performed yet.
      </div>`;

    return;

  }


  $("fileTypesList").innerHTML =
    state.typeStats
      .map(type => {

        const percent =
          total
            ? (type.size / total) * 100
            : 0;


        return `
          <div class="type-card">

            <div class="type-card-top">

              <strong>
                ${escapeHTML(type.name)}
              </strong>

              <span>
                ${percent.toFixed(1)}%
              </span>

            </div>


            <div class="type-card-size">
              ${formatBytes(type.size)}
            </div>

            <div class="type-card-count">
              ${type.count} file${type.count === 1 ? "" : "s"}
            </div>


            <div class="type-progress">

              <div
                style="width:${Math.max(percent, 1)}%"
              ></div>

            </div>

          </div>
        `;

      })
      .join("");

}


/* -----------------------------
   FOLDER RESULTS
----------------------------- */

function renderFolderResults() {

  const total =
    state.files.reduce(
      (sum, file) =>
        sum + file.size,
      0
    );


  if (!state.folderStats.length) {

    $("foldersList").innerHTML =
      `<div class="empty-state">
        No folder information available.
      </div>`;

    return;

  }


  $("foldersList").innerHTML =
    state.folderStats
      .map(folder => {

        const percent =
          total
            ? (folder.size / total) * 100
            : 0;


        return `
          <div class="folder-card">

            <div class="folder-top">

              <div>

                <div class="folder-name">
                  📁 ${escapeHTML(folder.path)}
                </div>

                <div class="folder-meta">
                  ${folder.count} file${folder.count === 1 ? "" : "s"}
                </div>

              </div>

              <div class="folder-size">
                ${formatBytes(folder.size)}
              </div>

            </div>


            <div class="folder-progress">

              <div
                style="width:${Math.max(percent, 1)}%"
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
    $("storageMix");


  if (!state.typeStats.length) {

    container.innerHTML =
      `<div class="empty-mini">
        Scan a folder to see storage usage.
      </div>`;

    return;

  }


  const total =
    state.files.reduce(
      (sum, file) =>
        sum + file.size,
      0
    );


  const topTypes =
    state.typeStats.slice(0, 6);


  const segments =
    topTypes
      .map(type => {

        const percent =
          total
            ? (type.size / total) * 100
            : 0;

        return `
          <div
            class="storage-segment"
            style="width:${Math.max(percent, 1)}%;"
            title="${escapeHTML(type.name)}"
          ></div>
        `;

      })
      .join("");


  const rows =
    topTypes
      .map(type => {

        const percent =
          total
            ? (type.size / total) * 100
            : 0;


        return `
          <div class="mix-row">

            <span class="mix-name">
              ${escapeHTML(type.name)}
            </span>

            <span class="mix-size">
              ${formatBytes(type.size)}
              · ${percent.toFixed(1)}%
            </span>

          </div>
        `;

      })
      .join("");


  container.innerHTML = `

    <div class="storage-bar">
      ${segments}
    </div>

    <div style="margin-top:12px;">
      ${rows}
    </div>

  `;

}


/* -----------------------------
   DASHBOARD LARGE FILES
----------------------------- */

function renderDashboardLargeFiles() {

  const files =
    [...state.largeFiles]
      .sort(
        (a, b) =>
          b.size - a.size
      )
      .slice(0, 5);


  if (!files.length) {

    $("dashboardLargeFiles").innerHTML =
      `<div class="empty-state">
        No large files found.
      </div>`;

    return;

  }


  $("dashboardLargeFiles").innerHTML =
    files
      .map(file => `

        <div class="mini-file">

          <div class="mini-icon">
            ${fileIcon(file)}
          </div>

          <div>

            <div class="mini-name">
              ${escapeHTML(file.name)}
            </div>

            <div class="mini-path">
              ${escapeHTML(file.path)}
            </div>

          </div>

          <div class="mini-size">
            ${formatBytes(file.size)}
          </div>

        </div>

      `)
      .join("");

}


/* -----------------------------
   FILE DETAILS MODAL
----------------------------- */

function openFileDetails(file) {

  $("modalFileName").textContent =
    file.name;


  $("modalContent").innerHTML = `

    <div class="detail-row">

      <small>File Name</small>

      <strong>
        ${escapeHTML(file.name)}
      </strong>

    </div>


    <div class="detail-row">

      <small>Location</small>

      <strong>
        ${escapeHTML(file.path)}
      </strong>

    </div>


    <div class="detail-row">

      <small>Size</small>

      <strong>
        ${formatBytes(file.size)}
      </strong>

    </div>


    <div class="detail-row">

      <small>File Type</small>

      <strong>
        ${escapeHTML(getCategory(file.name))}
      </strong>

    </div>


    <div class="detail-row">

      <small>Extension</small>

      <strong>
        ${escapeHTML(
          getExtension(file.name) || "None"
        )}
      </strong>

    </div>


    <div class="detail-row">

      <small>Last Modified</small>

      <strong>
        ${formatDate(file.lastModified)}
      </strong>

    </div>

  `;


  $("fileModal")
    .classList
    .add("open");

}


function closeModal() {

  $("fileModal")
    .classList
    .remove("open");

}


/* -----------------------------
   NAVIGATION
----------------------------- */

function showSection(section) {

  document
    .querySelectorAll(".section")
    .forEach(item => {
      item.classList.remove("active");
    });


  document
    .querySelectorAll(".nav-item")
    .forEach(item => {
      item.classList.remove("active");
    });


  const target =
    document.getElementById(section);


  if (target) {
    target.classList.add("active");
  }


  const nav =
    document.querySelector(
      `.nav-item[data-section="${section}"]`
    );


  if (nav) {
    nav.classList.add("active");
  }


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}


/* -----------------------------
   RENDER EVERYTHING
----------------------------- */

function renderAll() {

  renderBasicStats();

  renderLargeFiles();

  renderOldFiles();

  renderTypeResults();

  renderFolderResults();

  renderStorageMix();

  renderDashboardLargeFiles();

}


/* -----------------------------
   EVENT LISTENERS
----------------------------- */

$("selectFolderBtn")
  .addEventListener(
    "click",
    selectFolder
  );


document
  .querySelectorAll(
    ".nav-item, .attention-item, .text-btn"
  )
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        const section =
          button.dataset.section;

        if (section) {
          showSection(section);
        }

      }
    );

  });


$("largeSearch")
  .addEventListener(
    "input",
    renderLargeFiles
  );


$("largeSort")
  .addEventListener(
    "change",
    renderLargeFiles
  );


$("oldSearch")
  .addEventListener(
    "input",
    renderOldFiles
  );


$("oldSort")
  .addEventListener(
    "change",
    renderOldFiles
  );


document.addEventListener(
  "click",
  event => {

    const button =
      event.target.closest(
        ".file-info-btn"
      );


    if (!button) {
      return;
    }


    const file =
      state.files.find(
        item =>
          item.id ===
          button.dataset.fileId
      );


    if (file) {
      openFileDetails(file);
    }

  }
);


$("closeModal")
  .addEventListener(
    "click",
    closeModal
  );


$("fileModal")
  .addEventListener(
    "click",
    event => {

      if (
        event.target ===
        $("fileModal")
      ) {

        closeModal();

      }

    }
  );


/* Initial UI */

renderAll();
