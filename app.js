import {
  db,
  collection,
  doc,
  addDoc,
  onSnapshot,
  runTransaction,
} from "./firebase.js";

const CLASS_CAPACITY = 6;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

const upcomingContainer = document.getElementById("upcomingClasses");
const noUpcoming = document.getElementById("noUpcoming");

const nameDialog = document.getElementById("nameDialog");
const nameForm = document.getElementById("nameForm");
const nameDialogTitle = document.getElementById("nameDialogTitle");
const studentNameInput = document.getElementById("studentName");
const studentPinInput = document.getElementById("studentPin");

const statusDialog = document.getElementById("statusDialog");
const statusForm = document.getElementById("statusForm");
const statusDialogTitle = document.getElementById("statusDialogTitle");
const confirmPinInput = document.getElementById("confirmPin");
const paymentMethodWrap = document.getElementById("paymentMethodWrap");
const paymentMethodInput = document.getElementById("paymentMethodInput");
const cancelBookingBtn = document.getElementById("cancelBookingBtn");
const saveStatusBtn = document.getElementById("saveStatusBtn");

let classes = [];
let pendingSignupClassId = null;
let activeStatusClassId = null;
let activeStatusIndex = null;
let activeStatusType = "seat";

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
  const datePart = classItem?.date || "";
  const timePart = classItem?.startTime || "00:00";
  const value = new Date(`${datePart}T${timePart}:00`);

  if (!Number.isNaN(value.getTime())) {
    return value;
  }

  // Fallback: treat malformed time as start-of-day so future classes are not hidden.
  return new Date(`${datePart}T00:00:00`);
}

function isWithin24Hours(classItem) {
  const diff = parseClassDateTime(classItem).getTime() - Date.now();
  return diff > 0 && diff <= TWENTY_FOUR_HOURS_MS;
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

function getUpcoming(items) {
  const now = new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return items
    .filter((item) => {
      const dt = parseClassDateTime(item);
      if (!Number.isNaN(dt.getTime())) {
        return dt >= now;
      }

      // Last-resort fallback by date only.
      const d = new Date(`${item?.date || ""}T00:00:00`);
      if (Number.isNaN(d.getTime())) {
        return false;
      }
      return d >= today;
    })
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
  return formatClassHeader(item.date, item.startTime, item.endTime);
}

function formatSeatStatus(seat) {
  if (!seat) {
    return "未填付款方式";
  }
  if (seat.paymentMethod) {
    return `付款方式：${seat.paymentMethod}`;
  }
  return seat.status || "未填付款方式";
}

function normalizeSeats(seats) {
  const taken = seats.filter(Boolean);
  return [...taken, ...Array(CLASS_CAPACITY - taken.length).fill(null)];
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

  const seats = normalizeSeats(Array.isArray(item.seats) ? item.seats : []);
  const waitlist = Array.isArray(item.waitlist) ? item.waitlist : [];
  const used = seats.filter(Boolean).length;
  const remain = CLASS_CAPACITY - used;
  const locked = isWithin24Hours(item);

  const seatMeta = document.createElement("p");
  seatMeta.className = "meta";
  seatMeta.textContent = `名額：${used}/${CLASS_CAPACITY}（剩餘 ${remain}）`;
  wrapper.appendChild(seatMeta);

  const waitlistMeta = document.createElement("p");
  waitlistMeta.className = "meta";
  waitlistMeta.textContent = `Waitlist：${waitlist.length} 人`;
  wrapper.appendChild(waitlistMeta);

  if (locked) {
    const lockedNote = document.createElement("p");
    lockedNote.className = "meta";
    lockedNote.textContent = "開班前 24 小時內：只可報名，不可取消或修改資料。";
    wrapper.appendChild(lockedNote);
  }

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
      status.textContent = formatSeatStatus(value);
      seat.appendChild(status);

      const btn = document.createElement("button");
      btn.className = "button secondary";
      btn.textContent = "更新資料";
      btn.disabled = locked;
      btn.addEventListener("click", () => {
        openStatusDialog(item.id, "seat", i, value.paymentMethod || "");
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

  if (remain <= 0) {
    const waitBtn = document.createElement("button");
    waitBtn.className = "button";
    waitBtn.type = "button";
    waitBtn.textContent = "加入等候名單";
    waitBtn.addEventListener("click", () => openNameDialog(item.id, null));
    wrapper.appendChild(waitBtn);
  }

  if (waitlist.length > 0) {
    const waitTitle = document.createElement("p");
    waitTitle.className = "meta";
    waitTitle.textContent = "等候名單";
    wrapper.appendChild(waitTitle);

    const waitWrap = document.createElement("div");
    waitWrap.className = "stack";
    waitlist.forEach((entry, idx) => {
      const row = document.createElement("div");
      row.className = "inline-buttons";

      const text = document.createElement("span");
      text.className = "meta";
      text.textContent = `${idx + 1}. ${entry.name}`;
      row.appendChild(text);

      const cancelWaitBtn = document.createElement("button");
      cancelWaitBtn.className = "button secondary";
      cancelWaitBtn.type = "button";
      cancelWaitBtn.textContent = "取消等候";
      cancelWaitBtn.disabled = locked;
      cancelWaitBtn.addEventListener("click", () => {
        openStatusDialog(item.id, "waitlist", idx, "");
      });
      row.appendChild(cancelWaitBtn);

      waitWrap.appendChild(row);
    });
    wrapper.appendChild(waitWrap);
  }

  return wrapper;
}

function render() {
  const upcoming = getUpcoming(classes);
  upcomingContainer.innerHTML = "";
  noUpcoming.classList.toggle("hidden", upcoming.length > 0);
  upcoming.forEach((item) => upcomingContainer.appendChild(classCard(item)));
}

function applyLocalClassPatch(classId, patchFn) {
  let changed = false;
  classes = classes.map((item) => {
    if (item.id !== classId) {
      return item;
    }

    const clone = {
      ...item,
      seats: Array.isArray(item.seats) ? [...item.seats] : Array(CLASS_CAPACITY).fill(null),
      waitlist: Array.isArray(item.waitlist) ? [...item.waitlist] : [],
    };
    patchFn(clone);
    changed = true;
    return {
      ...clone,
      updatedAt: Date.now(),
    };
  });

  if (changed) {
    render();
  }
}

function openNameDialog(classId, seatIndex) {
  pendingSignupClassId = classId;
  nameDialogTitle.textContent = seatIndex == null ? "加入等候名單" : `報名名額 ${seatIndex + 1}`;
  studentNameInput.value = "";
  studentPinInput.value = "";
  nameDialog.showModal();
}

async function signup(classId, studentName, studentPin) {
  const classRef = doc(db, "classes", classId);
  let classData = null;
  let result = { mode: "seat", seatIndex: -1, waitlistPosition: -1 };

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(classRef);
    if (!snap.exists()) {
      throw new Error("班期不存在");
    }

    const data = snap.data();
    classData = data;
    const seats = normalizeSeats(Array.isArray(data.seats) ? [...data.seats] : Array(CLASS_CAPACITY).fill(null));
    const waitlist = Array.isArray(data.waitlist) ? [...data.waitlist] : [];

    if (seats.find((s) => s && normalizeName(s.name) === normalizeName(studentName))) {
      throw new Error("同一班期不可重覆報名");
    }

    if (waitlist.find((w) => normalizeName(w.name) === normalizeName(studentName))) {
      throw new Error("你已在等候名單中");
    }

    const used = seats.filter(Boolean).length;
    if (used < CLASS_CAPACITY) {
      const firstEmpty = seats.findIndex((x) => !x);
      seats[firstEmpty] = {
        name: studentName,
        pin: studentPin,
        paymentMethod: "",
        updatedAt: Date.now(),
      };
      result = { mode: "seat", seatIndex: firstEmpty, waitlistPosition: -1 };
    } else {
      waitlist.push({
        name: studentName,
        pin: studentPin,
        joinedAt: Date.now(),
      });
      result = { mode: "waitlist", seatIndex: -1, waitlistPosition: waitlist.length };
    }

    transaction.update(classRef, {
      seats,
      waitlist,
      updatedAt: Date.now(),
    });
  });

  await logOperation("student_signup", {
    classId,
    seatIndex: result.seatIndex,
    waitlistPosition: result.waitlistPosition,
    mode: result.mode,
    studentName,
    classHeader: classData ? formatClassHeader(classData.date, classData.startTime, classData.endTime) : "",
    levels: classData ? (classData.levels || []).join(", ") : "",
  });

  if (result.mode === "waitlist") {
    await logOperation("student_join_waitlist", {
      classId,
      studentName,
      waitlistPosition: result.waitlistPosition,
      classHeader: classData ? formatClassHeader(classData.date, classData.startTime, classData.endTime) : "",
      levels: classData ? (classData.levels || []).join(", ") : "",
    });
  }

  return result;
}

function openStatusDialog(classId, type, index, paymentMethod) {
  activeStatusClassId = classId;
  activeStatusType = type;
  activeStatusIndex = index;
  confirmPinInput.value = "";

  if (type === "seat") {
    statusDialogTitle.textContent = "更新付款方式";
    paymentMethodWrap.classList.remove("hidden");
    paymentMethodInput.value = paymentMethod || "";
    cancelBookingBtn.textContent = "取消報名";
    saveStatusBtn.classList.remove("hidden");
  } else {
    statusDialogTitle.textContent = "取消等候";
    paymentMethodWrap.classList.add("hidden");
    paymentMethodInput.value = "";
    cancelBookingBtn.textContent = "取消等候";
    saveStatusBtn.classList.add("hidden");
  }

  statusDialog.showModal();
}

async function updatePaymentMethod(classId, seatIndex, confirmPin, paymentMethod) {
  const classRef = doc(db, "classes", classId);
  let studentName = "";

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(classRef);
    if (!snap.exists()) {
      throw new Error("班期不存在");
    }

    const data = snap.data();
    if (isWithin24Hours(data)) {
      throw new Error("開班前 24 小時內不可修改資料");
    }

    const seats = normalizeSeats(Array.isArray(data.seats) ? [...data.seats] : []);
    const seat = seats[seatIndex];

    if (!seat) {
      throw new Error("找不到名額資料");
    }

    if (seat.pin !== confirmPin) {
      throw new Error("PIN 碼錯誤，不能修改");
    }

    studentName = seat.name;
    seat.paymentMethod = paymentMethod;
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
    paymentMethod,
  });
}

async function cancelEntry(classId, type, index, confirmPin) {
  const classRef = doc(db, "classes", classId);
  let studentName = "";
  let promotedName = "";

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(classRef);
    if (!snap.exists()) {
      throw new Error("班期不存在");
    }

    const data = snap.data();
    if (isWithin24Hours(data)) {
      throw new Error("開班前 24 小時內不可取消報名或等候");
    }

    const seats = normalizeSeats(Array.isArray(data.seats) ? [...data.seats] : []);
    const waitlist = Array.isArray(data.waitlist) ? [...data.waitlist] : [];

    if (type === "seat") {
      const seat = seats[index];

      if (!seat) {
        throw new Error("名額已是空位");
      }

      if (seat.pin !== confirmPin) {
        throw new Error("PIN 碼錯誤，不能取消");
      }

      studentName = seat.name;
      seats[index] = null;

      const compacted = normalizeSeats(seats);
      if (waitlist.length > 0) {
        const next = waitlist.shift();
        promotedName = next.name;
        const empty = compacted.findIndex((x) => !x);
        if (empty >= 0) {
          compacted[empty] = {
            name: next.name,
            pin: next.pin,
            paymentMethod: "",
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
      return;
    }

    const waiting = waitlist[index];
    if (!waiting) {
      throw new Error("找不到等候資料");
    }

    if (waiting.pin !== confirmPin) {
      throw new Error("PIN 碼錯誤，不能取消等候");
    }

    studentName = waiting.name;
    waitlist.splice(index, 1);
    transaction.update(classRef, {
      waitlist,
      updatedAt: Date.now(),
    });
  });

  if (type === "seat") {
    await logOperation("student_cancel_booking", {
      classId,
      seatIndex: index,
      studentName,
      promotedName,
    });
    if (promotedName) {
      await logOperation("student_promote_from_waitlist", {
        classId,
        studentName: promotedName,
      });
    }
    return;
  }

  await logOperation("student_cancel_waitlist", {
    classId,
    waitlistIndex: index,
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
    const result = await signup(pendingSignupClassId, studentName, studentPin);
    applyLocalClassPatch(pendingSignupClassId, (item) => {
      item.seats = normalizeSeats(item.seats || []);
      item.waitlist = Array.isArray(item.waitlist) ? item.waitlist : [];

      if (result.mode === "seat") {
        item.seats[result.seatIndex] = {
          name: studentName,
          pin: studentPin,
          paymentMethod: "",
          updatedAt: Date.now(),
        };
        return;
      }

      item.waitlist.push({
        name: studentName,
        pin: studentPin,
        joinedAt: Date.now(),
      });
    });

    if (result.mode === "waitlist") {
      alert(`班期已滿，已加入等候名單（第 ${result.waitlistPosition} 位）。`);
    }
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

  if (activeStatusType !== "seat") {
    return;
  }

  event.preventDefault();
  const confirmPin = confirmPinInput.value;
  const paymentMethod = paymentMethodInput.value.trim();

  if (!confirmPin) {
    alert("請輸入 PIN 碼");
    return;
  }

  try {
    await updatePaymentMethod(
      activeStatusClassId,
      activeStatusIndex,
      confirmPin,
      paymentMethod,
    );
    applyLocalClassPatch(activeStatusClassId, (item) => {
      item.seats = normalizeSeats(item.seats || []);
      const current = item.seats[activeStatusIndex] || {};
      item.seats[activeStatusIndex] = {
        ...current,
        paymentMethod,
        updatedAt: Date.now(),
      };
    });
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

  const confirmText = activeStatusType === "waitlist" ? "確定取消等候？" : "確定取消報名？";
  if (!confirm(confirmText)) {
    return;
  }

  try {
    await cancelEntry(activeStatusClassId, activeStatusType, activeStatusIndex, confirmPin);
    applyLocalClassPatch(activeStatusClassId, (item) => {
      item.seats = normalizeSeats(item.seats || []);
      item.waitlist = Array.isArray(item.waitlist) ? item.waitlist : [];

      if (activeStatusType === "seat") {
        item.seats[activeStatusIndex] = null;
        item.seats = normalizeSeats(item.seats);
        if (item.waitlist.length > 0) {
          const promoted = item.waitlist.shift();
          const empty = item.seats.findIndex((x) => !x);
          if (empty >= 0) {
            item.seats[empty] = {
              name: promoted.name,
              pin: promoted.pin,
              paymentMethod: "",
              fromWaitlistAt: Date.now(),
              updatedAt: Date.now(),
            };
          }
        }
        return;
      }

      item.waitlist.splice(activeStatusIndex, 1);
    });
    statusDialog.close();
  } catch (error) {
    alert(error.message || "取消失敗");
  }
});

onSnapshot(collection(db, "classes"), (snapshot) => {
  classes = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  render();
});
