import {
  db,
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  onSnapshot,
  runTransaction,
} from "./firebase.js";

const CLASS_CAPACITY = 6;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

const upcomingContainer = document.getElementById("upcomingClasses");
const noUpcoming = document.getElementById("noUpcoming");
const searchDateInput = document.getElementById("searchDate");
const clearSearchDateBtn = document.getElementById("clearSearchDate");
const classRulesContent = document.getElementById("classRulesContent");
const classRulesUpdatedAt = document.getElementById("classRulesUpdatedAt");
const paymeSection = document.getElementById("paymeSection");
const paymeLinksEl = document.getElementById("paymeLinks");

const nameDialog = document.getElementById("nameDialog");
const nameForm = document.getElementById("nameForm");
const nameDialogTitle = document.getElementById("nameDialogTitle");
const studentNameInput = document.getElementById("studentName");
const studentPinInput = document.getElementById("studentPin");
const studentContactInput = document.getElementById("studentContact");
const studentPaymentMethodInput = document.getElementById("studentPaymentMethod");
const studentPaymentDateInput = document.getElementById("studentPaymentDate");
const signupPaymentWrap = document.getElementById("signupPaymentWrap");

const statusDialog = document.getElementById("statusDialog");
const statusForm = document.getElementById("statusForm");
const statusDialogTitle = document.getElementById("statusDialogTitle");
const statusPinGate = document.getElementById("statusPinGate");
const confirmPinInput = document.getElementById("confirmPin");
const statusVerifyHint = document.getElementById("statusVerifyHint");
const verifyPinBtn = document.getElementById("verifyPinBtn");
const paymentMethodWrap = document.getElementById("paymentMethodWrap");
const paymentMethodInput = document.getElementById("paymentMethodInput");
const paymentDateInput = document.getElementById("paymentDateInput");
const statusContactWrap = document.getElementById("statusContactWrap");
const statusContactInput = document.getElementById("statusContactInput");
const cancelBookingBtn = document.getElementById("cancelBookingBtn");
const saveStatusBtn = document.getElementById("saveStatusBtn");
const appToast = document.getElementById("appToast");
const confirmDialog = document.getElementById("confirmDialog");
const confirmTitle = document.getElementById("confirmTitle");
const confirmMessage = document.getElementById("confirmMessage");
const confirmForm = document.getElementById("confirmForm");

let classes = [];
let pendingSignupClassId = null;
let activeStatusClassId = null;
let activeStatusIndex = null;
let activeStatusType = "seat";
let statusPinVerified = false;
let toastTimer = null;

function showToast(message) {
  if (!appToast) {
    return;
  }
  appToast.textContent = message;
  appToast.classList.remove("hidden");
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toastTimer = setTimeout(() => {
    appToast.classList.add("hidden");
  }, 2600);
}

function askConfirm(message, title = "請確認") {
  if (!confirmDialog || !confirmForm) {
    return Promise.resolve(false);
  }

  confirmTitle.textContent = title;
  confirmMessage.textContent = message;

  return new Promise((resolve) => {
    const onSubmit = (event) => {
      const action = event.submitter?.value;
      resolve(action === "confirm");
    };

    confirmForm.addEventListener("submit", onSubmit, { once: true });
    confirmDialog.showModal();
  });
}

function normalizeName(name) {
  return name.trim().replace(/\s+/g, " ");
}

function normalizeContact(contact) {
  const cleaned = String(contact || "").trim();
  if (!cleaned) {
    return "";
  }
  return cleaned;
}

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
  return normalizeName(String(a || "")).toLowerCase() === normalizeName(String(b || "")).toLowerCase();
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

function parseDateParts(dateStr) {
  const m = String(dateStr || "").match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) {
    return null;
  }
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
  };
}

function parseTimeParts(timeStr) {
  const m = String(timeStr || "00:00").match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m) {
    return { hour: 0, minute: 0, valid: false };
  }
  return {
    hour: Number(m[1]),
    minute: Number(m[2]),
    valid: true,
  };
}

function parseClassDateTime(classItem) {
  const date = parseDateParts(classItem?.date);
  if (!date) {
    return new Date(NaN);
  }
  const time = parseTimeParts(classItem?.startTime);
  return new Date(date.year, date.month - 1, date.day, time.hour, time.minute, 0, 0);
}

function parseClassEndDateTime(classItem) {
  const date = parseDateParts(classItem?.date);
  if (!date) {
    return new Date(NaN);
  }
  const time = parseTimeParts(classItem?.endTime);
  return new Date(date.year, date.month - 1, date.day, time.hour, time.minute, 0, 0);
}

function isWithin24Hours(classItem) {
  const diff = parseClassDateTime(classItem).getTime() - Date.now();
  return diff > 0 && diff <= TWENTY_FOUR_HOURS_MS;
}

function formatClassHeader(dateStr, startTime, endTime) {
  const date = parseDateParts(dateStr);
  const dateObj = date
    ? new Date(date.year, date.month - 1, date.day, 0, 0, 0, 0)
    : new Date(NaN);
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
      const dt = parseClassEndDateTime(item);
      if (!Number.isNaN(dt.getTime())) {
        return dt >= now;
      }

      // Last-resort fallback by date only.
      const parsedDate = parseDateParts(item?.date);
      if (!parsedDate) {
        return false;
      }
      const d = new Date(parsedDate.year, parsedDate.month - 1, parsedDate.day, 0, 0, 0, 0);
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

async function upsertPrivateContact(classId, seatIndex, studentName, studentPin, contactMethod) {
  const cleanedContact = normalizeContact(contactMethod);
  if (!cleanedContact) {
    return;
  }

  const docId = buildPrivateContactDocId(classId, seatIndex, studentPin);
  await setDoc(
    doc(db, "privateContacts", docId),
    {
      classId,
      seatIndex,
      studentName,
      pinKey: String(studentPin || "").trim().toLowerCase(),
      contactMethod: cleanedContact,
      updatedAt: Date.now(),
    },
    { merge: true },
  );
}

async function getStoredPrivateContact(classId, seatIndex, studentName, pin) {
  const primaryId = buildPrivateContactDocId(classId, seatIndex, pin);
  const primarySnap = await getDoc(doc(db, "privateContacts", primaryId));
  if (primarySnap.exists()) {
    return primarySnap.data().contactMethod || "";
  }

  // Fallback: contact was stored while on waitlist
  const waitlistId = buildPrivateContactDocId(classId, "waitlist", pin);
  const waitlistSnap = await getDoc(doc(db, "privateContacts", waitlistId));
  if (waitlistSnap.exists()) {
    return waitlistSnap.data().contactMethod || "";
  }

  const namePinId = buildLegacyNamePinDocId(classId, studentName, pin);
  const namePinSnap = await getDoc(doc(db, "privateContacts", namePinId));
  if (namePinSnap.exists()) {
    return namePinSnap.data().contactMethod || "";
  }

  const pinId = buildLegacyPinDocId(classId, pin);
  const pinSnap = await getDoc(doc(db, "privateContacts", pinId));
  if (!pinSnap.exists()) {
    return "";
  }

  const data = pinSnap.data() || {};
  if (sameName(data.studentName, studentName)) {
    return data.contactMethod || "";
  }
  return "";
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

function normalizeWaitlist(waitlist) {
  const list = Array.isArray(waitlist) ? [...waitlist] : [];
  const keyed = list
    .filter((x) => x && x.name)
    .map((x, idx) => ({
      ...x,
      joinedAt: typeof x.joinedAt === "number" ? x.joinedAt : (Date.now() + idx),
    }))
    .sort((a, b) => a.joinedAt - b.joinedAt);

  const seen = new Set();
  const deduped = [];
  keyed.forEach((x) => {
    const key = normalizeName(x.name).toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    deduped.push(x);
  });
  return deduped;
}

function getActiveSeatRecord() {
  const classItem = classes.find((item) => item.id === activeStatusClassId);
  if (!classItem) {
    return null;
  }
  const seats = normalizeSeats(Array.isArray(classItem.seats) ? classItem.seats : []);
  const seat = seats[activeStatusIndex];
  if (!seat) {
    return null;
  }
  return { classItem, seat };
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
  const waitlist = normalizeWaitlist(item.waitlist);
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

      const dateDiv = document.createElement("div");
      dateDiv.className = "status";
      dateDiv.textContent = `付款日期：${value.paymentDate || "未提供"}`;
      seat.appendChild(dateDiv);

      const btn = document.createElement("button");
      btn.className = "button secondary";
      btn.textContent = "更新資料";
      if (!locked) {
        btn.addEventListener("click", () => {
          openStatusDialog(item.id, "seat", i);
        });
        seat.appendChild(btn);
      }
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
        openStatusDialog(item.id, "waitlist", idx);
      });
      row.appendChild(cancelWaitBtn);

      waitWrap.appendChild(row);
    });
    wrapper.appendChild(waitWrap);
  }

  return wrapper;
}

function render() {
  const selectedDate = searchDateInput?.value || "";
  const upcoming = getUpcoming(classes).filter((item) => !selectedDate || item.date === selectedDate);
  upcomingContainer.innerHTML = "";
  noUpcoming.classList.toggle("hidden", upcoming.length > 0);
  upcoming.forEach((item) => upcomingContainer.appendChild(classCard(item)));
}

async function loadClassRules() {
  try {
    onSnapshot(doc(db, "siteInfo", "classRules"), (snap) => {
      const content = snap.exists() ? snap.data().content : "";
      const updatedAt = snap.exists() ? snap.data().updatedAt : null;

      if (classRulesContent) {
        classRulesContent.textContent = content;
      }

      // PayMe section
      if (paymeSection) {
        const links = Array.isArray(snap.exists() && snap.data().links) ? snap.data().links : [];
        paymeSection.classList.toggle("hidden", links.length === 0);

        if (paymeLinksEl) {
          paymeLinksEl.innerHTML = "";
          links.forEach((item) => {
            if (!item.url) return;
            const a = document.createElement("a");
            a.href = item.url;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.textContent = item.label || item.url;
            a.style.display = "block";
            paymeLinksEl.appendChild(a);
          });
        }
      }

      if (classRulesUpdatedAt) {
        if (!updatedAt) {
          classRulesUpdatedAt.textContent = "";
          classRulesUpdatedAt.classList.add("hidden");
        } else {
          const timeValue = typeof updatedAt === "number"
            ? updatedAt
            : (typeof updatedAt?.toMillis === "function" ? updatedAt.toMillis() : null);

          if (!timeValue) {
            classRulesUpdatedAt.textContent = "";
            classRulesUpdatedAt.classList.add("hidden");
          } else {
            const text = new Date(timeValue).toLocaleString("zh-HK", { hour12: false });
            classRulesUpdatedAt.textContent = `最後更新時間：${text}`;
            classRulesUpdatedAt.classList.remove("hidden");
          }
        }
      }
    }, (error) => {
      console.error("讀取課堂資訊失敗", error);
    });
  } catch (error) {
    console.error("設置課堂資訊監聽失敗", error);
  }
}

function openNameDialog(classId, seatIndex) {
  pendingSignupClassId = classId;
  const isWaitlist = seatIndex == null;
  nameDialogTitle.textContent = isWaitlist ? "加入等候名單" : `報名名額 ${seatIndex + 1}`;
  studentNameInput.value = "";
  studentPinInput.value = "";
  if (studentContactInput) {
    studentContactInput.value = "";
  }
  if (studentPaymentMethodInput) {
    studentPaymentMethodInput.value = "";
  }
  if (studentPaymentDateInput) {
    studentPaymentDateInput.value = "";
  }
  if (signupPaymentWrap) {
    signupPaymentWrap.classList.toggle("hidden", isWaitlist);
  }
  nameDialog.showModal();
}

async function signup(classId, studentName, studentPin, contactMethod, paymentMethod, paymentDate) {
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
    const waitlist = normalizeWaitlist(data.waitlist);

    if (seats.find((s) => s && normalizeName(s.name) === normalizeName(studentName))) {
      throw new Error("同一班期不可重覆報名");
    }

    if (waitlist.find((w) => normalizeName(w.name).toLowerCase() === normalizeName(studentName).toLowerCase())) {
      throw new Error("你已在等候名單中");
    }

    const used = seats.filter(Boolean).length;
    if (used < CLASS_CAPACITY) {
      const firstEmpty = seats.findIndex((x) => !x);
      seats[firstEmpty] = {
        name: studentName,
        pin: studentPin,
        paymentMethod: paymentMethod || "",
        paymentDate: paymentDate || "",
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

  logOperation("student_signup", {
    classId,
    seatIndex: result.seatIndex,
    waitlistPosition: result.waitlistPosition,
    mode: result.mode,
    studentName,
    classHeader: classData ? formatClassHeader(classData.date, classData.startTime, classData.endTime) : "",
    levels: classData ? (classData.levels || []).join(", ") : "",
  }).catch((error) => console.error("寫入操作紀錄失敗", error));

  if (result.mode === "waitlist") {
    logOperation("student_join_waitlist", {
      classId,
      studentName,
      waitlistPosition: result.waitlistPosition,
      classHeader: classData ? formatClassHeader(classData.date, classData.startTime, classData.endTime) : "",
      levels: classData ? (classData.levels || []).join(", ") : "",
    }).catch((error) => console.error("寫入等候紀錄失敗", error));
  }

  upsertPrivateContact(
    classId,
    result.mode === "seat" ? result.seatIndex : "waitlist",
    studentName,
    studentPin,
    contactMethod,
  )
    .catch((error) => console.error("寫入聯絡資料失敗", error));

  return result;
}

function openStatusDialog(classId, type, index) {
  activeStatusClassId = classId;
  activeStatusType = type;
  activeStatusIndex = index;
  statusPinVerified = false;
  confirmPinInput.value = "";
  paymentMethodInput.value = "";
  paymentDateInput.value = "";
  if (statusContactInput) {
    statusContactInput.value = "";
  }

  if (type === "seat") {
    statusDialogTitle.textContent = "更新資料";
    statusPinGate.classList.remove("hidden");
    statusVerifyHint.classList.remove("hidden");
    verifyPinBtn.classList.remove("hidden");
    paymentMethodWrap.classList.add("hidden");
    statusContactWrap.classList.add("hidden");
    cancelBookingBtn.textContent = "取消報名";
    cancelBookingBtn.classList.add("hidden");
    cancelBookingBtn.disabled = true;
    saveStatusBtn.classList.add("hidden");
  } else {
    statusDialogTitle.textContent = "取消等候";
    statusPinGate.classList.remove("hidden");
    statusVerifyHint.classList.add("hidden");
    verifyPinBtn.classList.add("hidden");
    paymentMethodWrap.classList.add("hidden");
    statusContactWrap.classList.add("hidden");
    cancelBookingBtn.textContent = "取消等候";
    cancelBookingBtn.classList.remove("hidden");
    cancelBookingBtn.disabled = false;
    saveStatusBtn.classList.add("hidden");
  }

  statusDialog.showModal();
}

async function verifyStatusPinAndReveal() {
  if (activeStatusType !== "seat") {
    return;
  }

  const confirmPin = confirmPinInput.value.trim();
  if (!confirmPin) {
    showToast("請輸入 PIN 碼");
    return;
  }

  const active = getActiveSeatRecord();
  if (!active) {
    showToast("找不到名額資料");
    return;
  }

  if (isWithin24Hours(active.classItem)) {
    showToast("開班前 24 小時內不可修改資料");
    return;
  }

  if (active.seat.pin !== confirmPin) {
    showToast("PIN 碼錯誤");
    return;
  }

  statusPinVerified = true;
  statusPinGate.classList.add("hidden");
  paymentMethodInput.value = active.seat.paymentMethod || "";
  paymentDateInput.value = active.seat.paymentDate || "";
  
  // 讀取之前填入的聯絡方法
  try {
    statusContactInput.value = await getStoredPrivateContact(
      activeStatusClassId,
      activeStatusIndex,
      active.seat.name,
      confirmPin,
    );
  } catch (error) {
    console.error("讀取聯絡資料失敗", error);
    statusContactInput.value = "";
  }
  
  paymentMethodWrap.classList.remove("hidden");
  statusContactWrap.classList.remove("hidden");
  cancelBookingBtn.classList.remove("hidden");
  cancelBookingBtn.disabled = false;
  saveStatusBtn.classList.remove("hidden");
  verifyPinBtn.classList.add("hidden");
}

async function updatePaymentMethod(classId, seatIndex, confirmPin, paymentMethod, paymentDate, contactMethod) {
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
    seat.paymentDate = paymentDate || "";
    seat.updatedAt = Date.now();
    seats[seatIndex] = seat;

    transaction.update(classRef, {
      seats,
      updatedAt: Date.now(),
    });
  });

  logOperation("student_update_status", {
    classId,
    seatIndex,
    studentName,
    paymentMethod,
  }).catch((error) => console.error("寫入操作紀錄失敗", error));

  upsertPrivateContact(classId, seatIndex, studentName, confirmPin, contactMethod)
    .catch((error) => console.error("寫入聯絡資料失敗", error));

}

async function cancelEntry(classId, type, index, confirmPin) {
  const classRef = doc(db, "classes", classId);
  let studentName = "";
  let promotedName = "";
  let promotedPin = "";
  let promotedSeatIndex = -1;

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
    const waitlist = normalizeWaitlist(data.waitlist);

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
        promotedPin = next.pin || "";
        const empty = compacted.findIndex((x) => !x);
        if (empty >= 0) {
          promotedSeatIndex = empty;
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

    logOperation("student_cancel_booking", {
      classId,
      seatIndex: index,
      studentName,
      promotedName,
    }).catch((error) => console.error("寫入取消紀錄失敗", error));
    if (promotedName) {
      logOperation("student_promote_from_waitlist", {
        classId,
        studentName: promotedName,
      }).catch((error) => console.error("寫入遞補紀錄失敗", error));
    }
    return;
  }

  logOperation("student_cancel_waitlist", {
    classId,
    waitlistIndex: index,
    studentName,
  }).catch((error) => console.error("寫入取消等候紀錄失敗", error));
}

nameForm.addEventListener("submit", async (event) => {
  const action = event.submitter?.value;
  if (action !== "confirm") {
    return;
  }

  event.preventDefault();
  const studentName = normalizeName(studentNameInput.value);
  const studentPin = studentPinInput.value;
  const studentContact = studentContactInput?.value || "";
  const studentPaymentMethod = studentPaymentMethodInput?.value.trim() || "";
  const studentPaymentDate = studentPaymentDateInput?.value.trim() || "";

  if (!studentName) {
    showToast("請輸入名字");
    return;
  }

  try {
    validatePin(studentPin);
    const result = await signup(
      pendingSignupClassId,
      studentName,
      studentPin,
      studentContact,
      studentPaymentMethod,
      studentPaymentDate,
    );

    if (result.mode === "waitlist") {
      showToast(`班期已滿，已加入等候名單（第 ${result.waitlistPosition} 位）。`);
    }
    nameDialog.close();
  } catch (error) {
    showToast(error.message || "報名失敗");
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
  const paymentDate = paymentDateInput.value.trim();
  const contactMethod = statusContactInput?.value.trim() || "";

  if (!statusPinVerified) {
    showToast("請先驗證 PIN 碼");
    return;
  }

  if (!confirmPin) {
    showToast("請輸入 PIN 碼");
    return;
  }

  try {
    await updatePaymentMethod(
      activeStatusClassId,
      activeStatusIndex,
      confirmPin,
      paymentMethod,
      paymentDate,
      contactMethod,
    );
    statusDialog.close();
  } catch (error) {
    showToast(error.message || "更新失敗");
  }
});

verifyPinBtn?.addEventListener("click", verifyStatusPinAndReveal);

cancelBookingBtn.addEventListener("click", async () => {
  if (activeStatusType === "seat" && !statusPinVerified) {
    showToast("請先驗證 PIN 碼，才可取消報名");
    return;
  }

  const confirmPin = confirmPinInput.value;
  if (!confirmPin) {
    showToast("請先輸入 PIN 碼");
    return;
  }

  const confirmText = activeStatusType === "waitlist" ? "確定取消等候？" : "確定取消報名？";
  if (!(await askConfirm(confirmText))) {
    return;
  }

  try {
    await cancelEntry(activeStatusClassId, activeStatusType, activeStatusIndex, confirmPin);
    statusDialog.close();
  } catch (error) {
    showToast(error.message || "取消失敗");
  }
});

loadClassRules();
searchDateInput?.addEventListener("input", render);
searchDateInput?.addEventListener("change", render);
clearSearchDateBtn?.addEventListener("click", () => {
  if (searchDateInput) {
    searchDateInput.value = "";
  }
  render();
});

onSnapshot(
  collection(db, "classes"),
  (snapshot) => {
    classes = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  },
  (error) => {
    console.error("讀取班期失敗", error);
    showToast("讀取班期失敗，請稍後再試或聯絡老師。");
  },
);
