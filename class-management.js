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
  onSnapshot,
} from "./firebase.js";

const CLASS_CAPACITY = 6;

const searchDateInput = document.getElementById("searchDate");
const clearSearchBtn = document.getElementById("clearSearch");
const sortToggleBtn = document.getElementById("sortToggle");
const classList = document.getElementById("classList");
const noClass = document.getElementById("noClass");

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

  const target = classCache.find((x) => x.id === classId);
  if (!target) {
    return;
  }

  const seats = Array.isArray(target.seats) ? [...target.seats] : Array(CLASS_CAPACITY).fill(null);
  const removedName = seats[index]?.name || "";
  seats[index] = null;

  await updateDoc(doc(db, "classes", classId), {
    seats,
    updatedAt: Date.now(),
  });

  await logOperation("admin_remove_student", {
    classId,
    seatIndex: index,
    studentName: removedName,
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

  const actions = document.createElement("div");
  actions.className = "inline-buttons";

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "button danger";
  deleteBtn.textContent = "刪除班期";
  deleteBtn.addEventListener("click", () => removeClass(item.id));

  actions.appendChild(deleteBtn);
  card.appendChild(actions);

  return card;
}

function renderClasses() {
  const keyword = searchDateInput.value;
  const now = new Date();
  const list = [...classCache]
    .filter((item) => classDate(item) >= now)
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
