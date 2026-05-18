import {
  auth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  db,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  setDoc,
  onSnapshot,
} from "./firebase.js";

const CLASS_CAPACITY = 6;
const LEVELS = ["Lv0", "Lv1", "Lv2"];

const loginSection = document.getElementById("loginSection");
const adminSection = document.getElementById("adminSection");
const loginForm = document.getElementById("loginForm");
const adminEmailInput = document.getElementById("adminEmail");
const adminPasswordInput = document.getElementById("adminPassword");
const logoutBtn = document.getElementById("logoutBtn");

const classForm = document.getElementById("classForm");
const editingClassId = document.getElementById("editingClassId");
const formTitle = document.getElementById("formTitle");
const cancelEditBtn = document.getElementById("cancelEdit");

const classRulesForm = document.getElementById("classRulesForm");
const classRulesText = document.getElementById("classRulesText");
const rulesStatus = document.getElementById("rulesStatus");

const dateInput = document.getElementById("date");
const startHourInput = document.getElementById("startHour");
const startMinuteInput = document.getElementById("startMinute");
const endHourInput = document.getElementById("endHour");
const endMinuteInput = document.getElementById("endMinute");
const locationInput = document.getElementById("location");
const levelInputs = [...document.querySelectorAll('input[name="levels"]')];
const songFields = document.getElementById("songFields");

let isAdminReady = false;


function selectedLevels() {
  return levelInputs.filter((x) => x.checked).map((x) => x.value);
}

function validateLevels(levels) {
  if (levels.length < 1) {
    throw new Error("每個班期必須選至少 1 個 Level");
  }
  for (const lv of levels) {
    if (!LEVELS.includes(lv)) {
      throw new Error("Level 不正確");
    }
  }
}

function logOperation(action, details) {
  return addDoc(collection(db, "operations"), {
    action,
    details,
    source: "admin",
    createdAt: Date.now(),
  });
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

function formatClassHeader(dateStr, startTime, endTime) {
  const dateObj = new Date(`${dateStr}T00:00:00`);
  const dayText = dateObj.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const weekday = dateObj.toLocaleDateString("en-GB", { weekday: "short" });
  return `${dayText} (${weekday}) ${startTime}-${endTime}`;
}

function toTimeString(hour, minute) {
  return `${hour}:${minute}`;
}

function populateTimeOptions(hourSelectEl, minuteSelectEl) {
  hourSelectEl.innerHTML = "";
  minuteSelectEl.innerHTML = "";

  for (let hour = 0; hour < 24; hour += 1) {
    const hh = String(hour).padStart(2, "0");
    const option = document.createElement("option");
    option.value = hh;
    option.textContent = hh;
    hourSelectEl.appendChild(option);
  }

  for (let minute = 0; minute < 60; minute += 1) {
    const mm = String(minute).padStart(2, "0");
    const option = document.createElement("option");
    option.value = mm;
    option.textContent = mm;
    minuteSelectEl.appendChild(option);
  }
}

function formatHeader(item) {
  return formatClassHeader(item.date, item.startTime, item.endTime);
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
  const [startHour, startMinute] = (item.startTime || "00:00").split(":");
  const [endHour, endMinute] = (item.endTime || "00:00").split(":");
  startHourInput.value = startHour;
  startMinuteInput.value = startMinute;
  endHourInput.value = endHour;
  endMinuteInput.value = endMinute;
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

  if (!isAdminReady) {
    alert("請先登入 admin 帳號");
    return;
  }

  try {
    const startTime = toTimeString(startHourInput.value, startMinuteInput.value);
    const endTime = toTimeString(endHourInput.value, endMinuteInput.value);
    const levels = selectedLevels();
    validateLevels(levels);

    const payload = {
      date: dateInput.value,
      startTime,
      endTime,
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
      await logOperation("admin_update_class", { classId: id, header: formatHeader(payload) });
      resetForm();
      return;
    }

    const created = await addDoc(collection(db, "classes"), {
      ...payload,
      seats: Array(CLASS_CAPACITY).fill(null),
      createdAt: Date.now(),
    });
    await logOperation("admin_create_class", { classId: created.id, header: formatHeader(payload) });
    resetForm();
  } catch (error) {
    alert(error.message || "儲存失敗");
  }
}


levelInputs.forEach((x) => x.addEventListener("change", () => {
  buildSongFields();
}));

cancelEditBtn.addEventListener("click", resetForm);
classForm.addEventListener("submit", saveClass);

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = adminEmailInput.value.trim();
  const password = adminPasswordInput.value;
  if (!email || !password) {
    alert("請輸入 Email 和 Password");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    alert(error.message || "登入失敗");
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    alert(error.message || "登出失敗");
  }
});

async function loadClassRulesForEdit() {
  try {
    const snap = await getDoc(doc(db, "siteInfo", "classRules"));
    if (snap.exists()) {
      classRulesText.value = snap.data().content || "";
    } else {
      classRulesText.value = "";
    }
  } catch (error) {
    console.error("讀取課堂資訊失敗", error);
  }
}

classRulesForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isAdminReady) {
    alert("請先登入 admin 帳號");
    return;
  }

  try {
    rulesStatus.classList.add("hidden");
    const content = classRulesText.value.trim();
    await setDoc(doc(db, "siteInfo", "classRules"), {
      content,
      updatedAt: Date.now(),
    }, { merge: true });
    rulesStatus.textContent = "課堂資訊已保存！";
    rulesStatus.classList.remove("hidden");
    setTimeout(() => {
      rulesStatus.classList.add("hidden");
    }, 2500);
  } catch (error) {
    console.error("保存課堂資訊失敗", error);
    rulesStatus.textContent = "保存失敗，請稍後重試";
    rulesStatus.classList.remove("hidden");
  }
});

onAuthStateChanged(auth, (user) => {
  isAdminReady = !!user;
  loginSection.classList.toggle("hidden", !!user);
  adminSection.classList.toggle("hidden", !user);
  logoutBtn.classList.toggle("hidden", !user);
  if (user) {
    loadClassRulesForEdit();
  }
});

populateTimeOptions(startHourInput, startMinuteInput);
populateTimeOptions(endHourInput, endMinuteInput);
buildSongFields();
