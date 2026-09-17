const state = {
  files: [],
  folders: [],
  largeFiles: [],
  oldFiles: [],
  emptyFolders: [],
  duplicateGroups: []
};

const LARGE_FILE_SIZE = 500 * 1024 * 1024;
const OLD_FILE_DAYS = 180;

const $ = (id) => document.getElementById(id);

function formatBytes(bytes) {
  if (!bytes) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));

  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString();
}

function showToast(message) {
  const toast = $("toast");

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fileIcon(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (["jpg", "jpeg", "png", "gif", "webp"].includes(extension)) {
    return "▧";
  }

  if (["mp4", "mkv", "mov", "avi"].includes(extension)) {
    return "▶";
  }

  if (["zip", "rar", "7z", "tar"].includes(extension)) {
    return "◆";
  }

  if (["exe", "msi"].includes(extension)) {
    return "⚙";
  }

  if (["pdf", "doc", "docx", "txt"].includes(extension)) {
    return "▤";
  }

  return "◫";
}

function renderFile(file, extra = "") {
  return `
    <div class="file-row">
      <div class="file-icon">${fileIcon(file)}</div>

      <div>
        <div class="file-name">${escapeHTML(file.name)}</div>
        <div class="file-path">
          ${escapeHTML(file.path || "")}
          ${extra ? ` • ${escapeHTML(extra)}` : ""}
        </div>
      </div>

      <div class="file-size">
        ${formatBytes(file.size)}
      </div>
    </div>
  `;
}

function renderEmpty(element, text) {
  element.innerHTML = `<div class="empty-state">${text}</div>`;
}

function renderResults() {
  $("totalFiles").textContent = state.files.length;

  const totalSize = state.files.reduce(
    (sum, file) => sum + file.size,
    0
  );

  $("totalSize").textContent = formatBytes(totalSize);

  $("largeCount").textContent = state.largeFiles.length;
  $("duplicateCount").textContent = state.duplicateGroups.length;

  $("largeAttention").textContent = state.largeFiles.length;
  $("duplicateAttention").textContent = state.duplicateGroups.length;
  $("oldAttention").textContent = state.oldFiles.length;
  $("emptyAttention").textContent = state.emptyFolders.length;

  if (state.largeFiles.length) {
    $("largeFilesList").innerHTML =
      state.largeFiles
        .sort((a, b) => b.size - a.size)
        .map(file => renderFile(file, "Large file"))
        .join("");
  } else {
    renderEmpty($("largeFilesList"), "No large files found.");
  }

  if (state.oldFiles.length) {
    $("oldFilesList").innerHTML =
      state.oldFiles
        .sort((a, b) => a.lastModified - b.lastModified)
        .map(file => renderFile(file, `Modified ${formatDate(file.lastModified)}`))
        .join("");
  } else {
    renderEmpty($("oldFilesList"), "No old files found.");
  }

  if (state.emptyFolders.length) {
    $("emptyFoldersList").innerHTML =
      state.emptyFolders
        .map(folder => `
          <div class="file-row">
            <div class="file-icon">□</div>
            <div>
              <div class="file-name">${escapeHTML(folder.name)}</div>
              <div class="file-path">${escapeHTML(folder.path)}</div>
            </div>
            <div class="file-size">Empty</div>
          </div>
        `)
        .join("");
  } else {
    renderEmpty($("emptyFoldersList"), "No empty folders found.");
  }

  if (state.duplicateGroups.length) {
    $("duplicatesList").innerHTML =
      state.duplicateGroups
        .map((group, index) => `
          <div class="panel" style="margin-bottom:10px;">
            <span class="panel-kicker">DUPLICATE GROUP ${index + 1}</span>
            <div style="margin-top:12px;">
              ${group
                .map(file => renderFile(file, "Identical content"))
                .join("")}
            </div>
          </div>
        `)
        .join("");
  } else {
    renderEmpty($("duplicatesList"), "No duplicate files found.");
  }
}

async function scanFiles(fileList) {
  state.files = [];
  state.folders = [];
  state.largeFiles = [];
  state.oldFiles = [];
  state.emptyFolders = [];
  state.duplicateGroups = [];

  const now = Date.now();
  const oldLimit = now - OLD_FILE_DAYS * 24 * 60 * 60 * 1000;

  for (const file of Array.from(fileList)) {
    const relativePath = file.webkitRelativePath || file.name;

    const data = {
      name: file.name,
      path: relativePath,
      size: file.size,
      lastModified: file.lastModified,
      raw: file
    };

    state.files.push(data);

    if (file.size >= LARGE_FILE_SIZE) {
      state.largeFiles.push(data);
    }

    if (file.lastModified < oldLimit) {
      state.oldFiles.push(data);
    }
  }

  findDuplicateGroups();

  renderResults();

  showToast(`Scan complete — ${state.files.length} files analyzed.`);
}

function findDuplicateGroups() {
  const bySize = new Map();

  for (const file of state.files) {
    if (!bySize.has(file.size)) {
      bySize.set(file.size, []);
    }

    bySize.get(file.size).push(file);
  }

  state.duplicateGroups = [];

  for (const files of bySize.values()) {
    if (files.length > 1) {
      state.duplicateGroups.push(files);
    }
  }
}

function selectFolder() {
  const input = document.createElement("input");

  input.type = "file";
  input.multiple = true;
  input.webkitdirectory = true;

  input.addEventListener("change", () => {
    if (input.files.length) {
      scanFiles(input.files);
    }
  });

  input.click();
}

$("selectFolderBtn").addEventListener("click", selectFolder);

document.querySelectorAll(".nav-item, .attention-item").forEach(button => {
  button.addEventListener("click", () => {
    const section = button.dataset.section;

    document.querySelectorAll(".section").forEach(item => {
      item.classList.remove("active");
    });

    document.querySelectorAll(".nav-item").forEach(item => {
      item.classList.remove("active");
    });

    const target = document.getElementById(section);

    if (target) {
      target.classList.add("active");
    }

    const nav = document.querySelector(
      `.nav-item[data-section="${section}"]`
    );

    if (nav) {
      nav.classList.add("active");
    }
  });
});
