import {
  db,
  collection,
  doc,
  updateDoc,
  onSnapshot,
  runTransaction,
} from "./firebase.js";

const CLASS_CAPACITY = 6;
const STATUS_DEFAULT = "未付留位費";
const STATUS_PAID = "已付留位費 ✅";

const upcomingContainer = document.getElementById("upcomingClasses");
const historyContainer = document.getElementById("historyClasses");
const noUpcoming = document.getElementById("noUpcoming");
const noHistory = document.getElementById("noHistory");

const nameDialog = document.getElementById("nameDialog");
const nameForm = document.getElementById("nameForm");
const nameDialogTitle = document.getElementById("nameDialogTitle");
const studentNameInput = document.getElementById("studentName");
const studentPinInput = document.getElementById("studentPin");

const statusDialog = document.getElementById("statusDialog");
const statusForm = document.getElementById("statusForm");
const confirmNameInput = document.getElementById("confirmName");
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
  const trimmed = pin.toLowerCase();
  if (/^(.)\1+$/.test(trimmed)) {
    throw new Error("PIN 碼不能是重複的字符（如 0000、aaaa）");
  }
  if (!/^[a-z0-9]+$/i.test(pin)) {
    throw new Error("PIN 碼只能用英文字母或數字");
  }
}

function parseClassDateTime(classItem) {
  return new Date(`${classItem.date}T${classItem.startTime}:00`);
}

function splitUpcomingHistory(items) {
  const now = new Date();
  const upcoming = [];
  const history = [];
  for (const item of items) {
    if (parseClassDateTime(item) >= now) {
      upcoming.push(item);
    } else {
      history.push(item);
    }
  }
  upcoming.sort((a, b) => parseClassDateTime(a) - parseClassDateTime(b));
  history.sort((a, b) => parseClassDateTime(b) - parseClassDateTime(a));
  return { upcoming, history };
}

function classHeading(item) {
  const levels = (item.levels || []).join(" + ");
  return `${item.date} ${item.startTime}-${item.endTime}`;
}

function classCard(item, isHistory) {
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

      const pin = document.createElement("div");
      pin.className = "status";
      pin.textContent = `PIN: ${value.pin || "N/A"}`;
      seat.appendChild(pin);

      const status = document.createElement("div");
      status.className = "status";
      status.textContent = value.status || STATUS_DEFAULT;
      seat.appendChild(status);

      if (!isHistory) {
        const btn = document.createElement("button");
        btn.className = "button secondary";
        btn.textContent = "更新狀態";
        btn.addEventListener("click", () => {
          openStatusDialog(item.id, i, value.name, value.status || STATUS_DEFAULT);
        });
        seat.appendChild(btn);
      }
    } else {
      seat.classList.add("empty");
      const text = document.createElement("div");
      text.textContent = `${i + 1}. 空位`;
      seat.appendChild(text);

      if (!isHistory) {
        const btn = document.createElement("button");
        btn.className = "button";
        btn.textContent = "報名";
        btn.addEventListener("click", () => {
          openNameDialog(item.id, i);
        });
        seat.appendChild(btn);
      }
    }

    seatGrid.appendChild(seat);
  }

  wrapper.appendChild(seatGrid);
  return wrapper;
}

function render() {
  const { upcoming, history } = splitUpcomingHistory(classes);

  upcomingContainer.innerHTML = "";
  historyContainer.innerHTML = "";

  noUpcoming.classList.toggle("hidden", upcoming.length > 0);
  noHistory.classList.toggle("hidden", history.length > 0);

  upcoming.forEach((item) => upcomingContainer.appendChild(classCard(item, false)));
  history.forEach((item) => historyContainer.appendChild(classCard(item, true)));
}

function openNameDialog(classId, seatIndex) {
  pendingSignupClassId = classId;
  pendingSeatIndex = seatIndex;
  nameDialogTitle.textContent = `報名名額 ${seatIndex + 1}`;
  studentNameInput.value = "";
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

    const duplicate = seats.find((s) => s && normalizeName(s.name) === normalizeName(studentName));
    if (duplicate) {
      throw new Error("同一班期不可重覆報名");
    }

    if (seats[seatIndex]) {
      throw new Error("此名額已被佔用，請刷新後再試");
    }

    const filledCount = seats.filter(Boolean).length;
    if (filledCount >= CLASS_CAPACITY) {
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
}

function openStatusDialog(classId, seatIndex, name, status) {
  activeStatusClassId = classId;
  activeStatusSeatIndex = seatIndex;
  confirmNameInput.value = "";
  confirmNameInput.placeholder = `輸入 ${name}`;
  confirmPinInput.value = "";
  confirmPinInput.placeholder = "輸入你的 PIN 碼";
  statusSelect.value = status || STATUS_DEFAULT;
  statusDialog.showModal();
}

async function updateStatus(classId, seatIndex, confirmName, confirmPin, newStatus) {
  const classRef = doc(db, "classes", classId);
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

    if (normalizeName(seat.name) !== normalizeName(confirmName)) {
      throw new Error("名字不一致，不能修改");
    }

    if (seat.pin !== confirmPin) {
      throw new Error("PIN 碼錯誤，不能修改");
    }

    seat.status = newStatus;
    seat.updatedAt = Date.now();
    seats[seatIndex] = seat;

    transaction.update(classRef, {
      seats,
      updatedAt: Date.now(),
    });
  });
}

async function cancelBooking(classId, seatIndex, confirmName, confirmPin) {
  const classRef = doc(db, "classes", classId);
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

    if (normalizeName(seat.name) !== normalizeName(confirmName)) {
      throw new Error("名字不一致，不能取消");
    }

    if (seat.pin !== confirmPin) {
      throw new Error("PIN 碼錯誤，不能取消");
    }

    seats[seatIndex] = null;
    transaction.update(classRef, {
      seats,
      updatedAt: Date.now(),
    });
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
  const confirmName = normalizeName(confirmNameInput.value);
  const confirmPin = confirmPinInput.value;

  if (!confirmName) {
    alert("請輸入名字");
    return;
  }

  if (!confirmPin) {
    alert("請輸入 PIN 碼");
    return;
  }

  try {
    await updateStatus(activeStatusClassId, activeStatusSeatIndex, confirmName, confirmPin, statusSelect.value);
    statusDialog.close();
  } catch (error) {
    alert(error.message || "更新失敗");
  }
});

cancelBookingBtn.addEventListener("click", async () => {
  const confirmName = normalizeName(confirmNameInput.value);
  const confirmPin = confirmPinInput.value;

  if (!confirmName) {
    alert("請先輸入名字確認");
    return;
  }

  if (!confirmPin) {
    alert("請先輸入 PIN 碼");
    return;
  }

  if (!confirm("確定取消報名？")) {
    return;
  }

  try {
    await cancelBooking(activeStatusClassId, activeStatusSeatIndex, confirmName, confirmPin);
    statusDialog.close();
  } catch (error) {
    alert(error.message || "取消失敗");
  }
});

onSnapshot(collection(db, "classes"), (snapshot) => {
  classes = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  render();
});
