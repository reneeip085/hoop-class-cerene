import { auth, onAuthStateChanged, db, collection, onSnapshot } from "./firebase.js";

const operationList = document.getElementById("operationList");
const noOperation = document.getElementById("noOperation");

const ACTION_LABELS = {
  student_signup: "學生報名",
  student_update_status: "學生更新狀態",
  student_cancel_booking: "學生取消報名",
  admin_create_class: "Admin 新增班期",
  admin_update_class: "Admin 編輯班期",
  admin_delete_class: "Admin 刪除班期",
  admin_remove_student: "Admin 移除報名人",
};

let operations = [];

function toTime(ts) {
  if (!ts) {
    return "--";
  }
  const d = new Date(ts);
  return d.toLocaleString("zh-HK", { hour12: false });
}

function renderRow(op) {
  const card = document.createElement("article");
  card.className = "card";

  const title = document.createElement("h3");
  title.textContent = ACTION_LABELS[op.action] || op.action || "未命名操作";
  card.appendChild(title);

  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = `來源：${op.source || "unknown"} | 時間：${toTime(op.createdAt)}`;
  card.appendChild(meta);

  const details = document.createElement("pre");
  details.className = "meta";
  details.style.whiteSpace = "pre-wrap";
  details.style.margin = "0";
  details.textContent = JSON.stringify(op.details || {}, null, 2);
  card.appendChild(details);

  return card;
}

function render() {
  operationList.innerHTML = "";
  noOperation.classList.toggle("hidden", operations.length > 0);
  operations.forEach((op) => operationList.appendChild(renderRow(op)));
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    alert("請先在 Admin 頁面登入。");
    window.location.href = "admin.html";
    return;
  }

  onSnapshot(collection(db, "operations"), (snapshot) => {
    operations = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    render();
  });
});
