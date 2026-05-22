import {
  auth,
  onAuthStateChanged,
  db,
  collection,
  doc,
  deleteDoc,
  updateDoc,
  addDoc,
  getDoc,
  setDoc,
  onSnapshot,
  runTransaction,
} from "./firebase.js";

const CLASS_CAPACITY = 6;
const LEVELS = ["Lv0", "Lv1", "Lv2"];

const searchDateInput = document.getElementById("searchDate");
const clearSearchBtn = document.getElementById("clearSearch");
const sortToggleBtn = document.getElementById("sortToggle");
const classList = document.getElementById("classList");
const noClass = document.getElementById("noClass");

// Edit dialog elements
const editClassDialog = document.getElementById("editClassDialog");
const editClassForm = document.getElementById("editClassForm");
const editClassIdInput = document.getElementById("editClassId");
const editDateInput = document.getElementById("editDate");
const editStartHour = document.getElementById("editStartHour");
const editStartMinute = document.getElementById("editStartMinute");
const editEndHour = document.getElementById("editEndHour");
const editEndMinute = document.getElementById("editEndMinute");
const editLocationInput = document.getElementById("editLocation");
const editLevelInputs = [...document.querySelectorAll('input[name="editLevels"]')];
const editSongFields = document.getElementById("editSongFields");
const cancelEditClassBtn = document.getElementById("cancelEditClassBtn");

let classCache = [];
let sortAscending = true;
const privateContactCache = new Map();

function buildPrivateContactDocId(classId, seatIndex, pin) {
  const key = `${String(classId || "")}_${String(seatIndex ?? "")}_${String(pin || "").trim().toLowerCase()}`;
  return key.replace(/[^a-z0-9_-]/gi, "_");
}

function buildLegacyNamePinDocId(classId, studentName, pin) {
  const key = `${String(classId || "")}_${String(studentName || "").toLowerCase()}_${String(pin || "").trim().toLowerCase()}`;
  return key.replace(/[^a-z0-9_-]/gi, "_");
}

function buildLegacyPinDocId(classId, pin) {
  const key = `${String(classId || "")}_${String(pin || "").trim().toLowerCase()}`;
  return key.replace(/[^a-z0-9_-]/gi, "_");
}

function sameName(a, b) {
  const left = String(a || "").trim().replace(/\s+/g, " ").toLowerCase();
  const right = String(b || "").trim().replace(/\s+/g, " ").toLowerCase();
  return left === right;
}

async function getPrivateContact(classId, seatIndex, studentName, pin) {
  const docId = buildPrivateContactDocId(classId, seatIndex, pin);
  if (privateContactCache.has(docId)) {
    return privateContactCache.get(docId);
  }

  const snap = await getDoc(doc(db, "privateContacts", docId));
  let contact = snap.exists() ? (snap.data().contactMethod || "") : "";

  if (!contact) {
    const legacyNamePinId = buildLegacyNamePinDocId(classId, studentName, pin);
    if (legacyNamePinId !== docId) {
      const legacyNamePinSnap = await getDoc(doc(db, "privateContacts", legacyNamePinId));
      contact = legacyNamePinSnap.exists() ? (legacyNamePinSnap.data().contactMethod || "") : "";
    }
  }

  if (!contact) {
    const legacyPinId = buildLegacyPinDocId(classId, pin);
    if (legacyPinId !== docId) {
      const legacyPinSnap = await getDoc(doc(db, "privateContacts", legacyPinId));
      if (legacyPinSnap.exists()) {
        const data = legacyPinSnap.data() || {};
        if (sameName(data.studentName, studentName)) {
          contact = data.contactMethod || "";
        }
      }
    }
  }

  privateContactCache.set(docId, contact);
  return contact;
}

function renderPrivateContact(classId, seatIndex, studentName, pin, containerEl) {
  containerEl.textContent = "聯絡資料載入中...";
  getPrivateContact(classId, seatIndex, studentName, pin)
    .then((contact) => {
      containerEl.textContent = contact ? `聯絡方法：${contact}` : "聯絡方法：未提供";
    })
    .catch(() => {
      containerEl.textContent = "聯絡方法：讀取失敗";
    });
}

function classDate(item) {
  return new Date(`${item.date}T${item.startTime}:00`);
}

function classEndDate(item) {
  return new Date(`${item.date}T${item.endTime}:00`);
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

function doubleConfirm(first, second) {
  if (!confirm(first)) {
    return false;
  }
  return confirm(second);
}

function logOperation(action, details) {
  return addDoc(collection(db, "operations"), {
    action,
    details,
    source: "admin",
    createdAt: Date.now(),
  });
}

function populateTimeOptions(hourEl, minuteEl) {
  for (let h = 0; h < 24; h += 1) {
    const o = document.createElement("option");
    o.value = String(h).padStart(2, "0");
    o.textContent = o.value;
    hourEl.appendChild(o);
  }
  for (let m = 0; m < 60; m += 1) {
    const o = document.createElement("option");
    o.value = String(m).padStart(2, "0");
    o.textContent = o.value;
    minuteEl.appendChild(o);
  }
}

function buildEditSongFields() {
  const selected = editLevelInputs.filter((x) => x.checked).map((x) => x.value);
  editSongFields.innerHTML = "";
  if (selected.length === 0) {
    const notice = document.createElement("p");
    notice.className = "notice";
    notice.textContent = "請先選擇 Level，系統會顯示對應歌曲欄位。";
    editSongFields.appendChild(notice);
    return;
  }
  selected.forEach((lv) => {
    const wrap = document.createElement("div");
    wrap.className = "stack";
    const label = document.createElement("label");
    label.setAttribute("for", `editSong_${lv}`);
    label.textContent = `${lv} 歌曲`;
    const input = document.createElement("input");
    input.id = `editSong_${lv}`;
    input.maxLength = 100;
    input.required = true;
    wrap.appendChild(label);
    wrap.appendChild(input);
    editSongFields.appendChild(wrap);
  });
}

function openEditClassDialog(item) {
  editClassIdInput.value = item.id;
  editDateInput.value = item.date;
  const [sh, sm] = (item.startTime || "00:00").split(":");
  const [eh, em] = (item.endTime || "00:00").split(":");
  editStartHour.value = sh;
  editStartMinute.value = sm;
  editEndHour.value = eh;
  editEndMinute.value = em;
  editLocationInput.value = item.location || "";
  editLevelInputs.forEach((input) => {
    input.checked = (item.levels || []).includes(input.value);
  });
  buildEditSongFields();
  (item.levels || []).forEach((lv) => {
    const input = document.getElementById(`editSong_${lv}`);
    if (input) {
      input.value = item.songs?.[lv] || "";
    }
  });
  editClassDialog.showModal();
}

editClassForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = editClassIdInput.value;
  if (!id) return;

  const startTime = `${editStartHour.value}:${editStartMinute.value}`;
  const endTime = `${editEndHour.value}:${editEndMinute.value}`;
  const levels = editLevelInputs.filter((x) => x.checked).map((x) => x.value);

  if (levels.length < 1) { alert("請選至少 1 個 Level"); return; }
  if (!editDateInput.value || !editLocationInput.value.trim()) { alert("請填妥日期及地點"); return; }
  if (startTime >= endTime) { alert("結束時間必須晚於開始時間"); return; }

  const songs = {};
  for (const lv of levels) {
    const input = document.getElementById(`editSong_${lv}`);
    const song = input?.value.trim();
    if (!song) { alert(`${lv} 歌曲不可留空`); return; }
    songs[lv] = song;
  }

  const payload = {
    date: editDateInput.value,
    startTime,
    endTime,
    location: editLocationInput.value.trim(),
    levels,
    songs,
    updatedAt: Date.now(),
  };

  try {
    await updateDoc(doc(db, "classes", id), payload);
    await logOperation("admin_update_class", {
      classId: id,
      header: formatClassHeader(payload.date, payload.startTime, payload.endTime),
    });
    editClassDialog.close();
  } catch (e) {
    alert(e.message || "儲存失敗");
  }
});

cancelEditClassBtn.addEventListener("click", () => editClassDialog.close());
editLevelInputs.forEach((x) => x.addEventListener("change", buildEditSongFields));

async function removeClass(id) {
  if (!doubleConfirm("確定刪除此班期？", "請再次確認：此動作無法復原，是否繼續？")) {
    return;
  }

  await deleteDoc(doc(db, "classes", id));
  await logOperation("admin_delete_class", { classId: id });
}

async function clearSeat(classId, index) {
  if (!confirm("確定移除此報名人？")) {
    return;
  }

  const classRef = doc(db, "classes", classId);
  let removedName = "";
  let promotedName = "";
  let promotedPin = "";
  let promotedSeatIndex = -1;

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(classRef);
    if (!snap.exists()) return;
    const data = snap.data();

    const seats = Array.isArray(data.seats) ? [...data.seats] : Array(CLASS_CAPACITY).fill(null);
    const waitlist = Array.isArray(data.waitlist) ? [...data.waitlist].filter(Boolean) : [];

    removedName = seats[index]?.name || "";
    seats[index] = null;

    // Compact seats and promote from waitlist if any
    const compacted = [...seats.filter(Boolean), ...Array(CLASS_CAPACITY).fill(null)].slice(0, CLASS_CAPACITY);
    if (waitlist.length > 0) {
      const next = waitlist.shift();
      promotedName = next.name;
      promotedPin = next.pin || "";
      const empty = compacted.findIndex((x) => !x);
      if (empty >= 0) {
        promotedSeatIndex = empty;
        compacted[empty] = {
          name: next.name,
          pin: next.pin,
          paymentMethod: "",
          paymentDate: "",
          fromWaitlistAt: Date.now(),
          updatedAt: Date.now(),
        };
      }
    }

    transaction.update(classRef, {
      seats: compacted,
      waitlist,
      updatedAt: Date.now(),
    });
  });

  // Migrate contact info from waitlist key to seat key for promoted student
  if (promotedName && promotedSeatIndex >= 0 && promotedPin) {
    try {
      const waitlistDocId = buildPrivateContactDocId(classId, "waitlist", promotedPin);
      const waitlistSnap = await getDoc(doc(db, "privateContacts", waitlistDocId));
      if (waitlistSnap.exists()) {
        const newDocId = buildPrivateContactDocId(classId, promotedSeatIndex, promotedPin);
        await setDoc(doc(db, "privateContacts", newDocId), {
          ...waitlistSnap.data(),
          seatIndex: promotedSeatIndex,
          updatedAt: Date.now(),
        }, { merge: true });
      }
    } catch (e) {
      console.error("遷移聯絡資料失敗", e);
    }
  }

  await logOperation("admin_remove_student", {
    classId,
    seatIndex: index,
    studentName: removedName,
    promotedName,
  });
}

function renderClassCard(item) {
  const card = document.createElement("article");
  card.className = "card";

  const title = document.createElement("div");
  title.className = "class-title";

  const left = document.createElement("div");
  const h3 = document.createElement("h3");
  h3.textContent = formatClassHeader(item.date, item.startTime, item.endTime);
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
      st.textContent = value.paymentMethod ? `付款方式：${value.paymentMethod}` : (value.status || "未填付款方式");
      seat.appendChild(st);

      const dateDiv = document.createElement("div");
      dateDiv.className = "status";
      dateDiv.textContent = `付款日期：${value.paymentDate || "未提供"}`;
      seat.appendChild(dateDiv);

      const contactText = document.createElement("div");
      contactText.className = "status";
      renderPrivateContact(item.id, i, value.name || "", value.pin || "", contactText);
      seat.appendChild(contactText);

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

  const waitlist = Array.isArray(item.waitlist) ? item.waitlist.filter(Boolean) : [];
  if (waitlist.length > 0) {
    const waitTitle = document.createElement("p");
    waitTitle.className = "meta";
    waitTitle.textContent = `等候名單（${waitlist.length} 人）`;
    card.appendChild(waitTitle);

    const waitGrid = document.createElement("div");
    waitGrid.className = "stack";
    waitlist.forEach((entry, idx) => {
      const row = document.createElement("div");
      row.className = "seat";

      const n = document.createElement("div");
      n.className = "name";
      n.textContent = `等 ${idx + 1}. ${entry.name}`;
      row.appendChild(n);

      const contactEl = document.createElement("div");
      contactEl.className = "status";
      renderPrivateContact(item.id, "waitlist", entry.name || "", entry.pin || "", contactEl);
      row.appendChild(contactEl);

      waitGrid.appendChild(row);
    });
    card.appendChild(waitGrid);
  }

  const actions = document.createElement("div");
  actions.className = "inline-buttons";

  const editBtn = document.createElement("button");
  editBtn.className = "button secondary";
  editBtn.textContent = "編輯班期";
  editBtn.addEventListener("click", () => openEditClassDialog(item));

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "button danger";
  deleteBtn.textContent = "刪除班期";
  deleteBtn.addEventListener("click", () => removeClass(item.id));

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);
  card.appendChild(actions);

  return card;
}

function renderClasses() {
  const keyword = searchDateInput.value;
  const now = new Date();
  const list = [...classCache]
    .filter((item) => classEndDate(item) >= now)
    .filter((item) => !keyword || item.date === keyword)
    .sort((a, b) => sortAscending ? classDate(a) - classDate(b) : classDate(b) - classDate(a));

  classList.innerHTML = "";
  noClass.classList.toggle("hidden", list.length > 0);
  list.forEach((item) => classList.appendChild(renderClassCard(item)));
}

searchDateInput.addEventListener("change", renderClasses);
clearSearchBtn.addEventListener("click", () => {
  searchDateInput.value = "";
  renderClasses();
});
sortToggleBtn.addEventListener("click", () => {
  sortAscending = !sortAscending;
  sortToggleBtn.textContent = sortAscending ? "時間 ↑" : "時間 ↓";
  renderClasses();
});

onAuthStateChanged(auth, (user) => {
  if (!user) {
    alert("請先在 Admin 頁面登入。");
    window.location.href = "admin.html";
    return;
  }

  onSnapshot(collection(db, "classes"), (snapshot) => {
    classCache = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    privateContactCache.clear();
    renderClasses();
  });
});

populateTimeOptions(editStartHour, editStartMinute);
populateTimeOptions(editEndHour, editEndMinute);
buildEditSongFields();
