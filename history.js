import { auth, onAuthStateChanged, db, collection, getDocs, query, orderBy } from "./firebase.js";

const CLASS_CAPACITY = 6;
const historyContainer = document.getElementById("historyClasses");
const noHistory = document.getElementById("noHistory");

let classes = [];

function parseClassDateTime(classItem) {
  return new Date(`${classItem.date}T${classItem.startTime}:00`);
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

function getHistory(items) {
  const now = new Date();
  return items
    .filter((item) => parseClassDateTime(item) < now)
    .sort((a, b) => parseClassDateTime(b) - parseClassDateTime(a));
}

function classHeading(item) {
  return formatClassHeader(item.date, item.startTime, item.endTime);
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

  const songs = document.createElement("ul");
  songs.className = "song-list";
  for (const lv of item.levels || []) {
    const li = document.createElement("li");
    li.textContent = `${lv} ${item.songs?.[lv] || ""}`;
    songs.appendChild(li);
  }
  wrapper.appendChild(songs);

  const seats = Array.isArray(item.seats) ? item.seats : [];
  const attendees = seats.filter(Boolean);
  const used = attendees.length;

  const seatMeta = document.createElement("p");
  seatMeta.className = "meta";
  seatMeta.textContent = `出席：${used}/${CLASS_CAPACITY}`;
  wrapper.appendChild(seatMeta);

  if (attendees.length > 0) {
    const attendeeTitle = document.createElement("p");
    attendeeTitle.className = "meta";
    attendeeTitle.textContent = "報名名單與付款資料";
    wrapper.appendChild(attendeeTitle);

    const attendeeList = document.createElement("ul");
    attendeeList.className = "song-list";
    attendees.forEach((seat, idx) => {
      const li = document.createElement("li");
      const paymentMethod = seat.paymentMethod || "未填";
      const paymentDate = seat.paymentDate || "未填";
      li.textContent = `${idx + 1}. ${seat.name || "--"} | 付款方式: ${paymentMethod} | 付款日期: ${paymentDate}`;
      attendeeList.appendChild(li);
    });
    wrapper.appendChild(attendeeList);
  }

  return wrapper;
}

function render() {
  const history = getHistory(classes);
  historyContainer.innerHTML = "";
  noHistory.classList.toggle("hidden", history.length > 0);
  history.forEach((item) => historyContainer.appendChild(classCard(item)));
}

async function loadHistory() {
  try {
    const snap = await getDocs(query(collection(db, "classes"), orderBy("date", "desc")));
    classes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  } catch (error) {
    console.error("讀取歷史班期失敗", error);
    historyContainer.innerHTML = "";
    noHistory.classList.remove("hidden");
  }
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    alert("請先在 Admin 頁面登入。");
    window.location.href = "admin.html";
    return;
  }

  loadHistory();
});
