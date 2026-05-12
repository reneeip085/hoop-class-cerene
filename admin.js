import {
  db,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
} from "./firebase.js";

const CLASS_CAPACITY = 6;
const ADMIN_PASSWORD = "61034467";
const LEVELS = ["Lv0", "Lv1", "Lv2"];

const loginSection = document.getElementById("loginSection");
const adminSection = document.getElementById("adminSection");
const loginForm = document.getElementById("loginForm");
const adminPasswordInput = document.getElementById("adminPassword");

const classForm = document.getElementById("classForm");
const editingClassId = document.getElementById("editingClassId");
const formTitle = document.getElementById("formTitle");
const cancelEditBtn = document.getElementById("cancelEdit");

const dateInput = document.getElementById("date");
const startTimeInput = document.getElementById("startTime");
const endTimeInput = document.getElementById("endTime");
const locationInput = document.getElementById("location");
const levelInputs = [...document.querySelectorAll('input[name="levels"]')];
const songFields = document.getElementById("songFields");
const adminClassList = document.getElementById("adminClassList");

let classCache = [];

function selectedLevels() {
  return levelInputs.filter((x) => x.checked).map((x) => x.value);
}

function validateLevels(levels) {
  if (levels.length < 1 || levels.length > 2) {
    throw new Error("每個班期必須選 1-2 個 Level");
  }
  for (const lv of levels) {
    if (!LEVELS.includes(lv)) {
      throw new Error("Level 不正確");
    }
  }
}

function buildSongFields() {
  const current = selectedLevels();
  songFields.innerHTML = "";

  current.forEach((lv) => {
    const wrap = document.createElement("div");
    wrap.className = "stack";

    const label = document.createElement("label");
    label.setAttribute("for", `song_${lv}`);
    label.textContent = `${lv} 歌曲`;

    const input = document.createElement("input");
    input.id = `song_${lv}`;
    input.maxLength = 100;
    input.required = true;
    input.dataset.level = lv;

    wrap.appendChild(label);
    wrap.appendChild(input);
    songFields.appendChild(wrap);
  });

  if (current.length === 0) {
    const notice = document.createElement("p");
    notice.className = "notice";
    notice.textContent = "請先選擇 Level，系統會顯示對應歌曲欄位。";
    songFields.appendChild(notice);
  }
}

function classDate(item) {
  return new Date(`${item.date}T${item.startTime}:00`);
}

function sortClasses(items) {
  return [...items].sort((a, b) => classDate(a) - classDate(b));
}

function formatHeader(item) {
  return `${item.date} ${item.startTime}-${item.endTime}`;
}

function resetForm() {
  classForm.reset();
  editingClassId.value = "";
  formTitle.textContent = "新增班期";
  cancelEditBtn.classList.add("hidden");
  buildSongFields();
}

function collectSongs(levels) {
  const songs = {};
  for (const lv of levels) {
    const input = document.getElementById(`song_${lv}`);
    const song = input?.value.trim();
    if (!song) {
      throw new Error(`${lv} 歌曲不可留空`);
    }
    songs[lv] = song;
  }
  return songs;
}

function fillForm(item) {
  editingClassId.value = item.id;
  dateInput.value = item.date;
  startTimeInput.value = item.startTime;
  endTimeInput.value = item.endTime;
  locationInput.value = item.location;

  levelInputs.forEach((input) => {
    input.checked = (item.levels || []).includes(input.value);
  });

  buildSongFields();

  (item.levels || []).forEach((lv) => {
    const input = document.getElementById(`song_${lv}`);
    if (input) {
      input.value = item.songs?.[lv] || "";
    }
  });

  formTitle.textContent = "編輯班期";
  cancelEditBtn.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function saveClass(event) {
  event.preventDefault();

  try {
    const levels = selectedLevels();
    validateLevels(levels);

    const payload = {
      date: dateInput.value,
      startTime: startTimeInput.value,
      endTime: endTimeInput.value,
      location: locationInput.value.trim(),
      levels,
      songs: collectSongs(levels),
      capacity: CLASS_CAPACITY,
      updatedAt: Date.now(),
    };

    if (!payload.date || !payload.startTime || !payload.endTime || !payload.location) {
      throw new Error("請填妥日期、時間及地點");
    }

    if (payload.startTime >= payload.endTime) {
      throw new Error("結束時間必須晚於開始時間");
    }

    const id = editingClassId.value;
    if (id) {
      await updateDoc(doc(db, "classes", id), payload);
      resetForm();
      return;
    }

    await addDoc(collection(db, "classes"), {
      ...payload,
      seats: Array(CLASS_CAPACITY).fill(null),
      createdAt: Date.now(),
    });
    resetForm();
  } catch (error) {
    alert(error.message || "儲存失敗");
  }
}

async function removeClass(id) {
  if (!confirm("確定刪除此班期？")) {
    return;
  }
  await deleteDoc(doc(db, "classes", id));
  if (editingClassId.value === id) {
    resetForm();
  }
}

async function clearSeat(classId, index) {
  const target = classCache.find((x) => x.id === classId);
  if (!target) {
    return;
  }
  const seats = Array.isArray(target.seats) ? [...target.seats] : Array(CLASS_CAPACITY).fill(null);
  seats[index] = null;
  await updateDoc(doc(db, "classes", classId), {
    seats,
    updatedAt: Date.now(),
  });
}

function renderClassCard(item) {
  const card = document.createElement("article");
  card.className = "card";

  const title = document.createElement("div");
  title.className = "class-title";

  const left = document.createElement("div");
  const h3 = document.createElement("h3");
  h3.textContent = formatHeader(item);
  left.appendChild(h3);

  const p = document.createElement("p");
  p.className = "meta";
  p.textContent = `地點：${item.location}`;
  left.appendChild(p);

  const badges = document.createElement("div");
  badges.className = "badges";
  (item.levels || []).forEach((lv) => {
    const b = document.createElement("span");
    b.className = "badge";
    b.textContent = lv;
    badges.appendChild(b);
  });

  title.appendChild(left);
  title.appendChild(badges);
  card.appendChild(title);

  const songs = document.createElement("ul");
  songs.className = "song-list";
  (item.levels || []).forEach((lv) => {
    const li = document.createElement("li");
    li.textContent = `${lv} ${item.songs?.[lv] || ""}`;
    songs.appendChild(li);
  });
  card.appendChild(songs);

  const seats = Array.isArray(item.seats) ? item.seats : Array(CLASS_CAPACITY).fill(null);
  const used = seats.filter(Boolean).length;
  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = `名額：${used}/${CLASS_CAPACITY}`;
  card.appendChild(meta);

  const seatGrid = document.createElement("div");
  seatGrid.className = "seat-grid";
  for (let i = 0; i < CLASS_CAPACITY; i += 1) {
    const seat = document.createElement("div");
    seat.className = "seat";
    const value = seats[i];

    if (value) {
      const n = document.createElement("div");
      n.className = "name";
      n.textContent = `${i + 1}. ${value.name}`;
      seat.appendChild(n);

      const st = document.createElement("div");
      st.className = "status";
      st.textContent = value.status || "未付留位費";
      seat.appendChild(st);

      const clearBtn = document.createElement("button");
      clearBtn.className = "button secondary";
      clearBtn.textContent = "移除";
      clearBtn.addEventListener("click", () => clearSeat(item.id, i));
      seat.appendChild(clearBtn);
    } else {
      seat.classList.add("empty");
      seat.textContent = `${i + 1}. 空位`;
    }

    seatGrid.appendChild(seat);
  }
  card.appendChild(seatGrid);

  const actions = document.createElement("div");
  actions.className = "inline-buttons";

  const editBtn = document.createElement("button");
  editBtn.className = "button";
  editBtn.textContent = "編輯";
  editBtn.addEventListener("click", () => fillForm(item));

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "button danger";
  deleteBtn.textContent = "刪除";
  deleteBtn.addEventListener("click", () => removeClass(item.id));

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);
  card.appendChild(actions);

  return card;
}

function renderClasses() {
  adminClassList.innerHTML = "";
  sortClasses(classCache).forEach((item) => {
    adminClassList.appendChild(renderClassCard(item));
  });
}

levelInputs.forEach((x) => x.addEventListener("change", () => {
  const levels = selectedLevels();
  if (levels.length > 2) {
    x.checked = false;
    alert("最多只可選 2 個 Level");
  }
  buildSongFields();
}));

cancelEditBtn.addEventListener("click", resetForm);
classForm.addEventListener("submit", saveClass);

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (adminPasswordInput.value !== ADMIN_PASSWORD) {
    alert("密碼錯誤");
    return;
  }

  loginSection.classList.add("hidden");
  adminSection.classList.remove("hidden");
});

onSnapshot(collection(db, "classes"), (snapshot) => {
  classCache = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderClasses();
});

buildSongFields();
