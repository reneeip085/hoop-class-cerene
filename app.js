import {
  db,
  collection,
  doc,
  addDoc,
  onSnapshot,
  runTransaction,
} from "./firebase.js";

const CLASS_CAPACITY = 6;
const STATUS_DEFAULT = "未付留位費";

const upcomingContainer = document.getElementById("upcomingClasses");
const noUpcoming = document.getElementById("noUpcoming");

const nameDialog = document.getElementById("nameDialog");
const nameForm = document.getElementById("nameForm");
const nameDialogTitle = document.getElementById("nameDialogTitle");
const studentNameInput = document.getElementById("studentName");
const studentPinInput = document.getElementById("studentPin");

const statusDialog = document.getElementById("statusDialog");
const statusForm = document.getElementById("statusForm");
const confirmPinInput = document.getElementById("confirmPin");
const statusSelect = document.getElementById("statusSelect");
const cancelBookingBtn = document.getElementById("cancelBookingBtn");

let classes = [];
let pendingSignupClassId = null;
let pendingSeatIndex = null;
let activeStatusClassId = null;
let activeStatusSeatIndex = null;

function normalizeName(name) {
  return name.trim().replace(/\s+/g, " ");
}

function validatePin(pin) {
  if (!pin || pin.length < 4 || pin.length > 6) {
    throw new Error("PIN 碼必須 4-6 位");
  }
  const normalized = pin.toLowerCase();
  if (/^(.)\1+$/.test(normalized)) {
    throw new Error("PIN 碼不能是重複字符（如 0000 / aaaa）");
  }
  if (!/^[a-z0-9]+$/i.test(pin)) {
    throw new Error("PIN 碼只能是英文字母或數字");
  }
}

function parseClassDateTime(classItem) {
  return new Date(`${classItem.date}T${classItem.startTime}:00`);
}

function getUpcoming(items) {
  const now = new Date();
  return items
    .filter((item) => parseClassDateTime(item) >= now)
    .sort((a, b) => parseClassDateTime(a) - parseClassDateTime(b));
}

function logOperation(action, details) {
  return addDoc(collection(db, "operations"), {
    action,
    details,
    source: "student",
    createdAt: Date.now(),
  });
}

function classHeading(item) {
  return `${item.date} ${item.startTime}-${item.endTime}`;
}

function classCard(item) {
  const wrapper = document.createElement("article");
  wrapper.className = "card";

  const title = document.createElement("div");
  title.className = "class-title";

  const left = document.createElement("div");
  const h3 = document.createElement("h3");
  h3.textContent = classHeading(item);
  left.appendChild(h3);

  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = `地點：${item.location}`;
  left.appendChild(meta);

  const right = document.createElement("div");
  right.className = "badges";
  (item.levels || []).forEach((lv) => {
    const b = document.createElement("span");
    b.className = "badge";
    b.textContent = lv;
    right.appendChild(b);
  });

  title.appendChild(left);
  title.appendChild(right);
  wrapper.appendChild(title);

  const songTitle = document.createElement("p");
  songTitle.className = "meta";
  songTitle.textContent = "Song:";
  wrapper.appendChild(songTitle);

  const songs = document.createElement("ul");
  songs.className = "song-list";
  for (const lv of item.levels || []) {
    const li = document.createElement("li");
    li.textContent = `${lv} ${item.songs?.[lv] || ""}`;
    songs.appendChild(li);
  }
  wrapper.appendChild(songs);

  const seats = Array.isArray(item.seats) ? item.seats : [];
  const used = seats.filter(Boolean).length;
  const remain = CLASS_CAPACITY - used;

  const seatMeta = document.createElement("p");
  seatMeta.className = "meta";
  seatMeta.textContent = `名額：${used}/${CLASS_CAPACITY}（剩餘 ${remain}）`;
  wrapper.appendChild(seatMeta);

  const seatGrid = document.createElement("div");
  seatGrid.className = "seat-grid";

  for (let i = 0; i < CLASS_CAPACITY; i += 1) {
    const seat = document.createElement("div");
    const value = seats[i];
    seat.className = "seat";

    if (value) {
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = `${i + 1}. ${value.name}`;
      seat.appendChild(name);

      const status = document.createElement("div");
      status.className = "status";
      status.textContent = value.status || STATUS_DEFAULT;
      seat.appendChild(status);

      const btn = document.createElement("button");
      btn.className = "button secondary";
      btn.textContent = "更新狀態";
      btn.addEventListener("click", () => {
        openStatusDialog(item.id, i, value.status || STATUS_DEFAULT);
      });
      seat.appendChild(btn);
    } else {
      seat.classList.add("empty");
      const text = document.createElement("div");
      text.textContent = `${i + 1}. 空位`;
      seat.appendChild(text);

      const btn = document.createElement("button");
      btn.className = "button";
      btn.textContent = "報名";
      btn.addEventListener("click", () => {
        openNameDialog(item.id, i);
      });
      seat.appendChild(btn);
    }

    seatGrid.appendChild(seat);
  }

  wrapper.appendChild(seatGrid);
  return wrapper;
}

function render() {
  const upcoming = getUpcoming(classes);
  upcomingContainer.innerHTML = "";
  noUpcoming.classList.toggle("hidden", upcoming.length > 0);
  upcoming.forEach((item) => upcomingContainer.appendChild(classCard(item)));
}

function openNameDialog(classId, seatIndex) {
  pendingSignupClassId = classId;
  pendingSeatIndex = seatIndex;
  nameDialogTitle.textContent = `報名名額 ${seatIndex + 1}`;
  studentNameInput.value = "";
  studentPinInput.value = "";
  nameDialog.showModal();
}

async function signup(classId, seatIndex, studentName, studentPin) {
  const classRef = doc(db, "classes", classId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(classRef);
    if (!snap.exists()) {
      throw new Error("班期不存在");
    }

    const data = snap.data();
    const seats = Array.isArray(data.seats) ? [...data.seats] : Array(CLASS_CAPACITY).fill(null);

    if (seats.find((s) => s && normalizeName(s.name) === normalizeName(studentName))) {
      throw new Error("同一班期不可重覆報名");
    }

    if (seats[seatIndex]) {
      throw new Error("此名額已被佔用，請刷新後再試");
    }

    if (seats.filter(Boolean).length >= CLASS_CAPACITY) {
      throw new Error("班期已滿額");
    }

    seats[seatIndex] = {
      name: studentName,
      pin: studentPin,
      status: STATUS_DEFAULT,
      updatedAt: Date.now(),
    };

    transaction.update(classRef, {
      seats,
      updatedAt: Date.now(),
    });
  });

  await logOperation("student_signup", {
    classId,
    seatIndex,
    studentName,
  });
}

function openStatusDialog(classId, seatIndex, status) {
  activeStatusClassId = classId;
  activeStatusSeatIndex = seatIndex;
  confirmPinInput.value = "";
  statusSelect.value = status || STATUS_DEFAULT;
  statusDialog.showModal();
}

async function updateStatus(classId, seatIndex, confirmPin, newStatus) {
  const classRef = doc(db, "classes", classId);
  let studentName = "";

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(classRef);
    if (!snap.exists()) {
      throw new Error("班期不存在");
    }

    const data = snap.data();
    const seats = Array.isArray(data.seats) ? [...data.seats] : [];
    const seat = seats[seatIndex];

    if (!seat) {
      throw new Error("找不到名額資料");
    }

    if (seat.pin !== confirmPin) {
      throw new Error("PIN 碼錯誤，不能修改");
    }

    studentName = seat.name;
    seat.status = newStatus;
    seat.updatedAt = Date.now();
    seats[seatIndex] = seat;

    transaction.update(classRef, {
      seats,
      updatedAt: Date.now(),
    });
  });

  await logOperation("student_update_status", {
    classId,
    seatIndex,
    studentName,
    status: newStatus,
  });
}

async function cancelBooking(classId, seatIndex, confirmPin) {
  const classRef = doc(db, "classes", classId);
  let studentName = "";

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(classRef);
    if (!snap.exists()) {
      throw new Error("班期不存在");
    }

    const data = snap.data();
    const seats = Array.isArray(data.seats) ? [...data.seats] : [];
    const seat = seats[seatIndex];

    if (!seat) {
      throw new Error("名額已是空位");
    }

    if (seat.pin !== confirmPin) {
      throw new Error("PIN 碼錯誤，不能取消");
    }

    studentName = seat.name;
    seats[seatIndex] = null;
    transaction.update(classRef, {
      seats,
      updatedAt: Date.now(),
    });
  });

  await logOperation("student_cancel_booking", {
    classId,
    seatIndex,
    studentName,
  });
}

nameForm.addEventListener("submit", async (event) => {
  const action = event.submitter?.value;
  if (action !== "confirm") {
    return;
  }

  event.preventDefault();
  const studentName = normalizeName(studentNameInput.value);
  const studentPin = studentPinInput.value;

  if (!studentName) {
    alert("請輸入名字");
    return;
  }

  try {
    validatePin(studentPin);
    await signup(pendingSignupClassId, pendingSeatIndex, studentName, studentPin);
    nameDialog.close();
  } catch (error) {
    alert(error.message || "報名失敗");
  }
});

statusForm.addEventListener("submit", async (event) => {
  const action = event.submitter?.value;
  if (action !== "save") {
    return;
  }

  event.preventDefault();
  const confirmPin = confirmPinInput.value;

  if (!confirmPin) {
    alert("請輸入 PIN 碼");
    return;
  }

  try {
    await updateStatus(activeStatusClassId, activeStatusSeatIndex, confirmPin, statusSelect.value);
    statusDialog.close();
  } catch (error) {
    alert(error.message || "更新失敗");
  }
});

cancelBookingBtn.addEventListener("click", async () => {
  const confirmPin = confirmPinInput.value;
  if (!confirmPin) {
    alert("請先輸入 PIN 碼");
    return;
  }

  if (!confirm("確定取消報名？")) {
    return;
  }

  try {
    await cancelBooking(activeStatusClassId, activeStatusSeatIndex, confirmPin);
    statusDialog.close();
  } catch (error) {
    alert(error.message || "取消失敗");
  }
});

onSnapshot(collection(db, "classes"), (snapshot) => {
  classes = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  render();
});
